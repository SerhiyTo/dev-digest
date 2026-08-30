import { and, asc, desc, eq, isNotNull, isNull, lt, ne } from 'drizzle-orm';
import { Severity } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { STUCK_GENERATION_MS } from './constants.js';
import type {
  BeginBriefGeneration,
  BriefChangedFile,
  BriefDocumentRow,
  BriefFindingRow,
  BriefGenerationRow,
  BriefGenerationStore,
  BriefIntentRow,
  BriefPullSummary,
  BriefReviewsRead,
  BriefStore,
  FailBriefGeneration,
  FileSource,
  FinishBriefGeneration,
  IntentSource,
  PullSource,
  ReviewSource,
  UpsertBriefDocument,
} from './ports.js';

const STUCK_GENERATION_ERROR = 'Generation exceeded the stuck-generation timeout';

export class BriefRepository
  implements BriefStore, BriefGenerationStore, IntentSource, ReviewSource, PullSource, FileSource
{
  constructor(private db: Db) {}

  async readBrief(prId: string): Promise<BriefDocumentRow | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    if (!row) return undefined;
    return {
      json: row.json,
      headSha: row.headSha,
      model: row.model,
      provider: row.provider,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      degradedReason: row.degradedReason,
      truncated: row.truncated,
      generatedAt: row.generatedAt,
    };
  }

  async upsertBrief(values: UpsertBriefDocument): Promise<void> {
    const fresh = {
      json: values.json,
      headSha: values.headSha,
      model: values.model,
      provider: values.provider,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd,
      degradedReason: values.degradedReason,
      truncated: values.truncated,
      generatedAt: new Date(),
    };
    await this.db
      .insert(t.prBrief)
      .values({ prId: values.prId, ...fresh })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: fresh });
  }

  async readGeneration(prId: string): Promise<BriefGenerationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.prBriefGenerations)
      .where(eq(t.prBriefGenerations.prId, prId));
    if (!row) return undefined;
    return {
      prId: row.prId,
      workspaceId: row.workspaceId,
      status: row.status,
      provider: row.provider,
      model: row.model,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      degradedReason: row.degradedReason,
      error: row.error,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    };
  }

  async beginGeneration(values: BeginBriefGeneration): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const stuckBefore = new Date(Date.now() - STUCK_GENERATION_MS);
      await tx
        .update(t.prBriefGenerations)
        .set({ status: 'failed', error: STUCK_GENERATION_ERROR, finishedAt: new Date() })
        .where(
          and(
            eq(t.prBriefGenerations.prId, values.prId),
            eq(t.prBriefGenerations.status, 'running'),
            lt(t.prBriefGenerations.startedAt, stuckBefore),
          ),
        );

      const fresh = {
        workspaceId: values.workspaceId,
        status: 'running' as const,
        provider: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
        degradedReason: null,
        error: null,
        startedAt: new Date(),
        finishedAt: null,
      };
      const rows = await tx
        .insert(t.prBriefGenerations)
        .values({ prId: values.prId, ...fresh })
        .onConflictDoUpdate({
          target: t.prBriefGenerations.prId,
          set: fresh,
          setWhere: ne(t.prBriefGenerations.status, 'running'),
        })
        .returning({ prId: t.prBriefGenerations.prId });
      return rows.length > 0;
    });
  }

  async finishGeneration(prId: string, patch: FinishBriefGeneration): Promise<void> {
    await this.db
      .update(t.prBriefGenerations)
      .set({
        status: 'done',
        finishedAt: new Date(),
        provider: patch.provider,
        model: patch.model,
        tokensIn: patch.tokensIn,
        tokensOut: patch.tokensOut,
        costUsd: patch.costUsd,
        degradedReason: patch.degradedReason,
        error: null,
      })
      .where(eq(t.prBriefGenerations.prId, prId));
  }

  async failGeneration(prId: string, patch: FailBriefGeneration): Promise<void> {
    await this.db
      .update(t.prBriefGenerations)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        provider: patch.provider,
        model: patch.model,
        tokensIn: patch.tokensIn,
        tokensOut: patch.tokensOut,
        costUsd: patch.costUsd,
        error: patch.error,
      })
      .where(eq(t.prBriefGenerations.prId, prId));
  }

  async reapRunning(error: string): Promise<number> {
    const rows = await this.db
      .update(t.prBriefGenerations)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(eq(t.prBriefGenerations.status, 'running'))
      .returning({ prId: t.prBriefGenerations.prId });
    return rows.length;
  }

  async readIntent(prId: string): Promise<BriefIntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if (!row) return undefined;
    return {
      intent: row.intent,
      inScope: row.inScope,
      outOfScope: row.outOfScope,
      riskAreas: row.riskAreas,
      evidence: row.evidence,
      confidence: row.confidence,
    };
  }

  async readReviews(prId: string): Promise<BriefReviewsRead> {
    const [latestRow] = await this.db
      .select({
        verdict: t.reviews.verdict,
        summary: t.reviews.summary,
        model: t.reviews.model,
        runScore: t.agentRuns.score,
        runFindingsCount: t.agentRuns.findingsCount,
        runBlockers: t.agentRuns.blockers,
      })
      .from(t.reviews)
      .leftJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
      .where(eq(t.reviews.prId, prId))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);

    const modelRows = await this.db
      .selectDistinct({ model: t.reviews.model })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), isNotNull(t.reviews.model)));

    return {
      latest: latestRow
        ? {
            verdict: latestRow.verdict,
            summary: latestRow.summary,
            score: latestRow.runScore,
            model: latestRow.model,
            findingsCount: latestRow.runFindingsCount ?? 0,
            blockers: latestRow.runBlockers ?? 0,
          }
        : null,
      distinctModels: modelRows
        .map((row) => row.model)
        .filter((model): model is string => model !== null),
    };
  }

  async readFindings(prId: string): Promise<BriefFindingRow[]> {
    const rows = await this.db
      .select({
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        severity: t.findings.severity,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.prId, prId), isNull(t.findings.dismissedAt)));

    const findings: BriefFindingRow[] = [];
    for (const row of rows) {
      const parsedSeverity = Severity.safeParse(row.severity);
      if (!parsedSeverity.success) continue;
      findings.push({
        file: row.file,
        startLine: row.startLine,
        endLine: row.endLine,
        severity: parsedSeverity.data,
      });
    }
    return findings;
  }

  async getPullSummary(workspaceId: string, prId: string): Promise<BriefPullSummary | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        workspaceId: t.pullRequests.workspaceId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        branch: t.pullRequests.branch,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;

    const commitRows = await this.db
      .select({ sha: t.prCommits.sha, message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(asc(t.prCommits.committedAt));

    return { ...row, commits: commitRows };
  }

  async getChangedFiles(prId: string): Promise<BriefChangedFile[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }
}
