import { z } from 'zod';
import type {
  ConventionCandidate,
  ConventionSkillDraft,
  ConventionStatus,
  ConventionsView,
  Skill,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { ConventionEvidenceRow } from '../../db/schema/knowledge.js';
import { renderPrompt } from '../../platform/prompts.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { skillBodyPatch } from '../skills/diff.js';
import { ConventionsRepository, type ConventionRow, type InsertConvention } from './repository.js';
import { countDropReasons, sumNullable, toConventionDto, toScanStateDto } from './helpers.js';
import { groundConventions, type GroundedConvention } from './grounding.js';
import { mergeDecisions } from './merge.js';
import {
  buildPromptFiles,
  filterSelection,
  renderCandidateList,
  renderNumberedFiles,
} from './prompt-input.js';
import {
  buildSkillBody,
  conventionSlug,
  evidenceFilesOf,
  skillDescription,
  type DraftConvention,
} from './skill-body.js';
import {
  CANDIDATE_FILE_COUNT,
  CONVENTIONS_FEATURE_MODEL_ID,
  CONVENTION_SKILL_TYPE,
  EXTRACTED_SKILL_SOURCE,
  EXTRACTION_SCHEMA_NAME,
  EXTRACT_PROMPT_TEMPLATE,
  EXTRACT_TIMEOUT_MS,
  FILE_SELECTION_SCHEMA_NAME,
  MAX_CONVENTIONS,
  MAX_PROBE_CHARS,
  SCAN_ABORTED_ERROR,
  SELECTED_FILE_COUNT,
  SELECT_PROMPT_TEMPLATE,
  SELECT_TIMEOUT_MS,
  STRUCTURED_MAX_RETRIES,
} from './constants.js';

/**
 * Conventions extractor.
 *
 * The scan is a two-step model dialogue (pick files, then read them) behind a
 * grounding gate that re-finds every cited snippet in the repository. See
 * `server/specs/2026-08-05-conventions.md` for why each step exists.
 */

const ConventionFileSelection = z.object({
  files: z
    .array(
      z.object({
        path: z.string().describe('A file path copied verbatim from the supplied list.'),
        reason: z
          .string()
          .describe('One short sentence: what house rules this file is likely to reveal.'),
      }),
    )
    .describe('The chosen files, most representative first.'),
});

const ConventionExtraction = z.object({
  conventions: z
    .array(
      z.object({
        rule: z
          .string()
          .describe('One sentence stating, in the imperative, the rule this team follows.'),
        evidence: z
          .array(
            z.object({
              path: z
                .string()
                .describe('The file the rule was observed in, copied verbatim from its header.'),
              start_line: z
                .number()
                .int()
                .describe("The left-gutter line number of the snippet's first line."),
              end_line: z
                .number()
                .int()
                .describe("The left-gutter line number of the snippet's last line."),
              snippet: z
                .string()
                .describe('The lines from that file, copied character for character.'),
            }),
          )
          .describe('One to three citations, each from a different file.'),
        probe: z
          .string()
          .describe(
            'A JavaScript regular expression, without delimiters, matching a single line that follows this rule. Empty when no reliable pattern exists.',
          ),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe('How consistently this rule holds across the supplied files.'),
      }),
    )
    .describe('The extracted house rules, most confident first.'),
});

export interface ScanPayload {
  workspaceId: string;
  repoId: string;
  pathPrefix: string | null;
}

export interface CreateSkillFromConventionsInput {
  name: string;
  description: string;
  type: Skill['type'];
  body: string;
  skillId?: string;
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  /** Close a scan whose background task died before it could close itself. */
  async failScan(repoId: string, error: string): Promise<void> {
    const scan = await this.repo.getScan(repoId);
    if (!scan || scan.status !== 'running') return;
    await this.repo.finishScan(repoId, { status: 'failed', error });
  }

  /** Boot-time reaper for scans orphaned by a dead process. */
  async reapStaleScans(): Promise<number> {
    return this.repo.reapRunningScans(SCAN_ABORTED_ERROR);
  }

  async view(workspaceId: string, repoId: string): Promise<ConventionsView | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;
    const [scan, rows] = await Promise.all([
      this.repo.getScan(repoId),
      this.repo.listForRepo(workspaceId, repoId),
    ]);
    return { state: toScanStateDto(scan), candidates: rows.map(toConventionDto) };
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: ConventionStatus,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.setStatus(workspaceId, id, status);
    return row ? toConventionDto(row) : undefined;
  }

  async setStatusMany(
    workspaceId: string,
    repoId: string,
    ids: string[],
    status: ConventionStatus,
  ): Promise<ConventionCandidate[] | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;
    const rows = await this.repo.setStatusMany(workspaceId, repoId, ids, status);
    return rows.map(toConventionDto);
  }

  async updateRule(
    workspaceId: string,
    id: string,
    rule: string,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.updateRule(workspaceId, id, rule);
    return row ? toConventionDto(row) : undefined;
  }

  /**
   * Mark the repo as scanning. Awaited by the route so the row exists before the
   * 202 is returned — the page polls `convention_scans`, and a caller that got a
   * 202 must never poll a stale state.
   */
  async beginScan(payload: ScanPayload): Promise<boolean> {
    const { workspaceId, repoId, pathPrefix } = payload;
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return false;
    await this.repo.startScan({ repoId, workspaceId, pathPrefix });
    return true;
  }

  /**
   * Runs the whole pipeline and records the outcome in `convention_scans`, which
   * is the only status the UI reads. Never rethrows: the caller is a
   * fire-and-forget background task, so a throw would have nowhere to go.
   */
  async runScan(payload: ScanPayload): Promise<void> {
    const { workspaceId, repoId, pathPrefix } = payload;
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return;

    try {
      const candidates = await this.sampleCandidates(repoId, pathPrefix);
      if (candidates.length === 0) {
        await this.repo.finishScan(repoId, {
          status: 'done',
          sampledFiles: 0,
          degradedReason: 'not_indexed',
        });
        return;
      }

      const { provider, model } = await resolveFeatureModel(
        this.container,
        workspaceId,
        CONVENTIONS_FEATURE_MODEL_ID,
      );
      const llm = await this.container.llm(provider);

      const selection = await llm.completeStructured({
        model,
        schema: ConventionFileSelection,
        schemaName: FILE_SELECTION_SCHEMA_NAME,
        timeoutMs: SELECT_TIMEOUT_MS,
        maxRetries: STRUCTURED_MAX_RETRIES,
        messages: [
          {
            role: 'system',
            content: await renderPrompt(SELECT_PROMPT_TEMPLATE, {
              repo: repo.fullName,
              max_files: String(SELECTED_FILE_COUNT),
              candidates: renderCandidateList(candidates),
            }),
          },
          { role: 'user', content: 'Choose the files.' },
        ],
      });

      const selected = filterSelection(
        selection.data.files.map((file) => file.path),
        candidates,
        SELECTED_FILE_COUNT,
      );
      const files = buildPromptFiles(await this.readFiles(repo, selected));
      if (files.length === 0) {
        await this.repo.finishScan(repoId, {
          status: 'done',
          sampledFiles: candidates.length,
          degradedReason: 'no_clone',
          costUsd: selection.costUsd,
          tokensIn: selection.tokensIn,
          tokensOut: selection.tokensOut,
          model,
        });
        return;
      }

      const extraction = await llm.completeStructured({
        model,
        schema: ConventionExtraction,
        schemaName: EXTRACTION_SCHEMA_NAME,
        timeoutMs: EXTRACT_TIMEOUT_MS,
        maxRetries: STRUCTURED_MAX_RETRIES,
        messages: [
          {
            role: 'system',
            content: await renderPrompt(EXTRACT_PROMPT_TEMPLATE, {
              repo: repo.fullName,
              max_conventions: String(MAX_CONVENTIONS),
              files: renderNumberedFiles(files),
            }),
          },
          { role: 'user', content: 'Name the house conventions.' },
        ],
      });

      const contents = new Map(files.map((file) => [file.path, file.content]));
      const { kept, dropped } = groundConventions(extraction.data.conventions, contents);
      const counted = await this.countOccurrences(repo, kept);
      const prior = await this.repo.listForRepo(workspaceId, repoId);
      const merged = mergeDecisions(prior, counted);

      await this.repo.replaceForRepo(
        workspaceId,
        repoId,
        merged.map((candidate) => toInsert(workspaceId, repoId, candidate)),
      );

      await this.repo.finishScan(repoId, {
        status: 'done',
        sampledFiles: candidates.length,
        selectedFiles: files.map((file) => file.path),
        candidateCount: kept.length,
        droppedCount: dropped.length,
        droppedReasons: countDropReasons(dropped),
        costUsd: sumNullable([selection.costUsd, extraction.costUsd]),
        tokensIn: sumNullable([selection.tokensIn, extraction.tokensIn]),
        tokensOut: sumNullable([selection.tokensOut, extraction.tokensOut]),
        model,
        degradedReason: null,
      });
    } catch (err) {
      await this.repo.finishScan(repoId, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async skillDraft(
    workspaceId: string,
    repoId: string,
  ): Promise<ConventionSkillDraft | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) return undefined;

    const conventions: DraftConvention[] = accepted.map((row) => ({
      rule: row.rule,
      evidence: row.evidence ?? [],
    }));
    const slug = conventionSlug(repo.name);
    const body = buildSkillBody(slug, repo.name, conventions);
    const existing = await this.repo.findExtractedSkill(workspaceId, slug);

    return {
      slug,
      name: slug,
      description: skillDescription(repo.name, accepted.length),
      type: CONVENTION_SKILL_TYPE,
      body,
      evidence_files: evidenceFilesOf(conventions),
      merged_count: accepted.length,
      existing_skill: existing
        ? { id: existing.id, name: existing.name, version: existing.version }
        : null,
      body_patch: existing ? skillBodyPatch(existing.body, body) : null,
    };
  }

  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromConventionsInput,
  ): Promise<Skill | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) return undefined;

    const evidenceFiles = evidenceFilesOf(
      accepted.map((row) => ({ rule: row.rule, evidence: row.evidence ?? [] })),
    );
    const skills = new SkillsService(this.container);

    const skill = input.skillId
      ? await skills.update(workspaceId, input.skillId, {
          name: input.name,
          description: input.description,
          type: input.type,
          body: input.body,
        })
      : await skills.create(workspaceId, {
          name: input.name,
          description: input.description,
          type: input.type,
          body: input.body,
          source: EXTRACTED_SKILL_SOURCE,
          evidenceFiles,
        });

    if (!skill) return undefined;
    await this.repo.linkToSkill(
      workspaceId,
      accepted.map((row) => row.id),
      skill.id,
    );
    await this.writeMemory(workspaceId, repoId, accepted);
    return skill;
  }

  private async sampleCandidates(repoId: string, pathPrefix: string | null): Promise<string[]> {
    const paths = await this.container.repoIntel.getConventionSamples(
      repoId,
      CANDIDATE_FILE_COUNT,
    );
    if (!pathPrefix) return paths;
    return paths.filter((path) => path.startsWith(pathPrefix));
  }

  /** `readFile` throws ENOENT for a path the clone no longer has — skip, never fail the scan. */
  private async readFiles(
    repo: { owner: string; name: string },
    paths: readonly string[],
  ): Promise<[string, string][]> {
    const entries: [string, string][] = [];
    for (const path of paths) {
      try {
        entries.push([path, await this.container.git.readFile(repo, path)]);
      } catch {
        continue;
      }
    }
    return entries;
  }

  /**
   * A soft, countable signal alongside the verified citations. Every failure
   * leaves the count null — "not measured" — rather than claiming a zero.
   */
  private async countOccurrences(
    repo: { owner: string; name: string },
    conventions: readonly GroundedConvention[],
  ): Promise<(GroundedConvention & { occurrenceFiles: number | null })[]> {
    const counted: (GroundedConvention & { occurrenceFiles: number | null })[] = [];
    for (const convention of conventions) {
      counted.push({ ...convention, occurrenceFiles: await this.probeCount(repo, convention) });
    }
    return counted;
  }

  private async probeCount(
    repo: { owner: string; name: string },
    convention: GroundedConvention,
  ): Promise<number | null> {
    const probe = convention.probe?.trim();
    if (!probe || probe.length > MAX_PROBE_CHARS) return null;
    try {
      new RegExp(probe);
      const matches = await this.container.codeIndex.grep(repo, probe);
      const files = new Set(matches.map((match) => match.path));
      return files.size > 0 ? files.size : null;
    } catch {
      return null;
    }
  }

  /**
   * Forward-looking: nothing retrieves memory yet (run-executor still passes
   * `memory: null`). Recorded now so a later lesson can wire retrieval without
   * a backfill. Never allowed to fail the merge.
   */
  private async writeMemory(
    workspaceId: string,
    repoId: string,
    accepted: readonly ConventionRow[],
  ): Promise<void> {
    try {
      const embeddings = await this.embedRules(accepted.map((row) => row.rule));
      const previousIds = accepted
        .map((row) => row.memoryId)
        .filter((id): id is string => id !== null);

      const ids = await this.repo.replaceMemory(
        previousIds,
        accepted.map((row, index) => ({
          workspaceId,
          repoId,
          scope: 'repo' as const,
          kind: 'convention' as const,
          content: row.rule,
          confidence: row.confidence,
          embedding: embeddings?.[index] ?? null,
          sources: (row.evidence ?? []).map((entry) => ({
            path: entry.path,
            pr: null,
            context: `${entry.path}:${entry.start_line}-${entry.end_line}`,
          })),
        })),
      );

      await Promise.all(
        accepted.map((row, index) =>
          this.repo.linkToMemory(workspaceId, row.id, ids[index] ?? null),
        ),
      );
    } catch {
      return;
    }
  }

  private async embedRules(rules: string[]): Promise<number[][] | null> {
    try {
      const embedder = await this.container.embedder();
      return await embedder.embed(rules);
    } catch {
      return null;
    }
  }
}

function toInsert(
  workspaceId: string,
  repoId: string,
  candidate: GroundedConvention & { occurrenceFiles: number | null; status: ConventionStatus },
): InsertConvention {
  return {
    workspaceId,
    repoId,
    rule: candidate.rule,
    evidence: candidate.evidence as ConventionEvidenceRow[],
    occurrenceFiles: candidate.occurrenceFiles,
    confidence: candidate.confidence,
    status: candidate.status,
  };
}
