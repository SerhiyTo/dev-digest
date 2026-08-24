import type {
  BlastRadiusResponse,
  FeatureModelResolver,
  LLMProvider,
  PrBriefResponse,
  Provider,
  Severity,
  SmartDiffRole,
} from '@devdigest/shared';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { assembleGenerationInput } from './assemble.js';
import {
  BRIEF_FEATURE_MODEL_ID,
  BRIEF_MAX_RETRIES,
  BRIEF_PROMPT_TEMPLATE,
  BRIEF_SCHEMA_NAME,
  BRIEF_TIMEOUT_MS,
  MAX_FOCUS_ROWS,
  MAX_REFS_PER_RISK,
  MAX_RISKS,
} from './constants.js';
import {
  GeneratedBrief,
  capFocusRows,
  capRisks,
  dropRisksWithoutRefs,
  groundFileRefs,
  groundFocusRows,
  orderFocusRows,
  selectFileSummaries,
  truncateStrings,
  type GeneratedReviewFocusRow,
} from './domain.js';
import { buildBriefDocument, buildBriefResponse } from './helpers.js';
import type {
  BlastSource,
  BriefChangedFile,
  BriefFindingRow,
  BriefGenerationStore,
  BriefStore,
  FileRoleSource,
  FileSource,
  IntentSource,
  Logger,
  PullSource,
  ReviewSource,
} from './ports.js';

const FOCUS_FINDING_SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

function lineRangeOverlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

function buildFindingSeverityLookup(
  findings: readonly BriefFindingRow[],
): (row: GeneratedReviewFocusRow) => Severity | undefined {
  return (row) => {
    let worst: Severity | undefined;
    for (const finding of findings) {
      if (finding.file !== row.file) continue;
      if (!lineRangeOverlaps(row.start_line, row.end_line, finding.startLine, finding.endLine)) continue;
      if (worst === undefined || FOCUS_FINDING_SEVERITY_RANK[finding.severity] < FOCUS_FINDING_SEVERITY_RANK[worst]) {
        worst = finding.severity;
      }
    }
    return worst;
  };
}

const REAPER_ERROR_MESSAGE = 'Server restarted while a brief generation was running.';

export interface BriefServiceDeps {
  briefStore: BriefStore;
  generationStore: BriefGenerationStore;
  intentSource: IntentSource;
  reviewSource: ReviewSource;
  pullSource: PullSource;
  fileSource: FileSource;
  blastSource: BlastSource;
  fileRoleSource: FileRoleSource;
  featureModels: FeatureModelResolver;
  llm: (provider: Provider) => Promise<LLMProvider>;
  logger?: Logger;
}

function diffTextFromChangedFiles(files: readonly BriefChangedFile[]): string {
  const parts: string[] = [];
  for (const file of files) {
    if (!file.patch) continue;
    parts.push(`diff --git a/${file.path} b/${file.path}`);
    parts.push(`--- a/${file.path}`);
    parts.push(`+++ b/${file.path}`);
    parts.push(file.patch);
  }
  return parts.join('\n');
}

function blastFilePaths(blast: BlastRadiusResponse): string[] {
  const paths = new Set<string>();
  for (const symbol of blast.changed_symbols) paths.add(symbol.file);
  for (const impact of blast.downstream) {
    for (const caller of impact.callers) paths.add(caller.file);
  }
  return [...paths];
}

function allowedRefPaths(files: readonly BriefChangedFile[], blast: BlastRadiusResponse): Set<string> {
  const paths = new Set(files.map((file) => file.path));
  if (!blast.degraded) {
    for (const path of blastFilePaths(blast)) paths.add(path);
  }
  return paths;
}

export class BriefService {
  constructor(private readonly deps: BriefServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.deps.pullSource.getPullSummary(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [storedBrief, generation] = await Promise.all([
      this.deps.briefStore.readBrief(prId),
      this.deps.generationStore.readGeneration(prId),
    ]);

    try {
      return buildBriefResponse({ storedBrief, generation, currentHeadSha: pull.headSha });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'stored brief failed validation';
      this.deps.logger?.error({ prId, err: message }, 'brief: stored document failed validation; degrading to no brief');
      const fallback = buildBriefResponse({ storedBrief: undefined, generation, currentHeadSha: pull.headSha });
      return {
        ...fallback,
        stale: storedBrief ? storedBrief.headSha !== pull.headSha : false,
      };
    }
  }

  async beginGeneration(workspaceId: string, prId: string): Promise<void> {
    const pull = await this.deps.pullSource.getPullSummary(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const started = await this.deps.generationStore.beginGeneration({ prId, workspaceId });
    if (!started) {
      throw new ConflictError('A brief generation is already running for this pull request.');
    }
  }

  async runGeneration(workspaceId: string, prId: string): Promise<void> {
    const startedAt = Date.now();
    let provider: Provider | null = null;
    let model: string | null = null;

    try {
      this.deps.logger?.info({ prId, workspaceId }, 'brief: generation started');

      const pull = await this.deps.pullSource.getPullSummary(workspaceId, prId);
      if (!pull) throw new Error('pull request no longer exists');

      const resolved = await this.deps.featureModels.resolve(workspaceId, BRIEF_FEATURE_MODEL_ID);
      provider = resolved.provider;
      model = resolved.model;

      const [intent, reviews, findings, files, blast, fileRoles] = await Promise.all([
        this.deps.intentSource.readIntent(prId),
        this.deps.reviewSource.readReviews(prId),
        this.deps.reviewSource.readFindings(prId),
        this.deps.fileSource.getChangedFiles(prId),
        this.deps.blastSource.get(workspaceId, prId),
        this.deps.fileRoleSource.get(workspaceId, prId),
      ]);
      if (!blast) throw new Error('blast radius unavailable for this pull request');
      const roleByPath: ReadonlyMap<string, SmartDiffRole> = fileRoles ?? new Map();

      const llm = await this.deps.llm(provider);
      const systemPrompt = await renderPrompt(BRIEF_PROMPT_TEMPLATE, {});
      const { userMessage, droppedFileCount, truncatedFileCount } = assembleGenerationInput({
        pull,
        files,
        fileRoles: roleByPath,
        blast,
        intent,
      });

      const result = await llm.completeStructured({
        model,
        schema: GeneratedBrief,
        schemaName: BRIEF_SCHEMA_NAME,
        timeoutMs: BRIEF_TIMEOUT_MS,
        maxRetries: BRIEF_MAX_RETRIES,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      const diff = parseUnifiedDiff(diffTextFromChangedFiles(files));
      const allowedPaths = allowedRefPaths(files, blast);

      const groundedRefs = groundFileRefs(result.data.risks, allowedPaths);
      if (groundedRefs.droppedRefCount > 0) {
        this.deps.logger?.warn(
          { prId, droppedRefCount: groundedRefs.droppedRefCount },
          'brief: dropped ungrounded file refs',
        );
      }

      const referenced = dropRisksWithoutRefs(groundedRefs.risks);
      if (referenced.droppedCount > 0) {
        this.deps.logger?.warn(
          { prId, droppedCount: referenced.droppedCount },
          'brief: dropped risks left with no surviving ref',
        );
      }

      const cappedRisks = capRisks(referenced.risks, MAX_RISKS, MAX_REFS_PER_RISK);
      if (cappedRisks.droppedCount > 0) {
        this.deps.logger?.warn(
          { prId, droppedCount: cappedRisks.droppedCount },
          'brief: capped risks over the limit',
        );
      }

      const groundedFocus = groundFocusRows(result.data.review_focus, diff);
      if (groundedFocus.droppedCount > 0) {
        this.deps.logger?.warn(
          { prId, droppedCount: groundedFocus.droppedCount },
          'brief: dropped review-focus rows outside every hunk',
        );
      }

      const orderedFocus = orderFocusRows(groundedFocus.rows, buildFindingSeverityLookup(findings));
      const cappedFocus = capFocusRows(orderedFocus, MAX_FOCUS_ROWS);
      if (cappedFocus.droppedCount > 0) {
        this.deps.logger?.warn(
          { prId, droppedCount: cappedFocus.droppedCount },
          'brief: capped review-focus rows over the limit',
        );
      }

      const selectedSummaries = selectFileSummaries(result.data.file_summaries, roleByPath);

      const truncated = truncateStrings({
        summary: result.data.summary,
        risks: cappedRisks.risks,
        reviewFocus: cappedFocus.rows,
        fileSummaries: selectedSummaries,
      });

      const document = buildBriefDocument({
        summary: truncated.summary,
        risks: truncated.risks,
        reviewFocus: truncated.reviewFocus,
        fileSummaries: truncated.fileSummaries,
        intent,
        blast,
        headSha: pull.headSha,
        model: result.model,
        reviewModels: reviews.distinctModels,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
      });

      await this.deps.briefStore.upsertBrief({
        prId,
        json: document,
        headSha: pull.headSha,
        model: result.model,
        provider,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        degradedReason: document.degraded_reason ?? null,
        truncated: document.truncated,
      });

      await this.deps.generationStore.finishGeneration(prId, {
        provider,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        degradedReason: document.degraded_reason ?? null,
      });

      this.deps.logger?.info(
        {
          prId,
          provider,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          durationMs: Date.now() - startedAt,
          droppedFileCount,
          truncatedFileCount,
          droppedRefCount: groundedRefs.droppedRefCount,
          droppedRiskCount: referenced.droppedCount + cappedRisks.droppedCount,
          droppedFocusCount: groundedFocus.droppedCount + cappedFocus.droppedCount,
          degradedReason: document.degraded_reason,
        },
        'brief: generation finished',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'brief generation failed';
      await this.deps.generationStore.failGeneration(prId, {
        provider,
        model,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
        error: message,
      });
      this.deps.logger?.error({ prId, err: message }, 'brief: generation failed');
    }
  }

  async reapRunning(): Promise<number> {
    const count = await this.deps.generationStore.reapRunning(REAPER_ERROR_MESSAGE);
    this.deps.logger?.info({ count }, 'brief: reaped running generations at boot');
    return count;
  }
}
