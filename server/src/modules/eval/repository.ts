import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { NotFoundError } from '../../platform/errors.js';
import type { EvalExpectation, EvalOwnerKind } from '@devdigest/shared';
import type {
  AgentConfigSource,
  AgentSummary,
  AgentVersionSnapshot,
  CancelSuiteRunOutcome,
  EvalCaseStore,
  EvalRunStore,
  EvalSuiteRunStore,
  FinishEvalSuiteRun,
  InsertEvalCase,
  InsertEvalRun,
  SourceDiffSource,
  SourceFindingWithDiff,
  StartEvalSuiteRun,
  StoredEvalCase,
  StoredEvalRun,
  StoredEvalSuiteRun,
  UpdateEvalCase,
} from './ports.js';

export class EvalRepository
  implements EvalCaseStore, EvalRunStore, EvalSuiteRunStore, AgentConfigSource, SourceDiffSource
{
  constructor(private db: Db) {}

  async insertCase(values: InsertEvalCase): Promise<StoredEvalCase> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff,
        inputFiles: (values.inputFiles as object | undefined) ?? null,
        inputMeta: (values.inputMeta as object | undefined) ?? null,
        expectedOutput: values.expectedOutput,
        notes: values.notes ?? null,
        sourceFindingId: values.sourceFindingId ?? null,
      })
      .returning();
    return mapEvalCaseRow(row!);
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: UpdateEvalCase,
  ): Promise<StoredEvalCase | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.inputFiles !== undefined
          ? { inputFiles: patch.inputFiles as object | null }
          : {}),
        ...(patch.inputMeta !== undefined ? { inputMeta: patch.inputMeta as object | null } : {}),
        ...(patch.expectedOutput !== undefined ? { expectedOutput: patch.expectedOutput } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row ? mapEvalCaseRow(row) : undefined;
  }

  async getCaseById(workspaceId: string, id: string): Promise<StoredEvalCase | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row ? mapEvalCaseRow(row) : undefined;
  }

  async getCaseBySourceFindingId(
    workspaceId: string,
    sourceFindingId: string,
  ): Promise<StoredEvalCase | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.sourceFindingId, sourceFindingId),
        ),
      );
    return row ? mapEvalCaseRow(row) : undefined;
  }

  async listCasesByOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<StoredEvalCase[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      )
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
    return rows.map(mapEvalCaseRow);
  }

  async countCasesForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<number> {
    const rows = await this.db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      );
    return rows.length;
  }

  async deleteCaseById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async deleteCasesForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<number> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      )
      .returning({ id: t.evalCases.id });
    return rows.length;
  }

  async insertRun(values: InsertEvalRun): Promise<StoredEvalRun> {
    return this.db.transaction(async (tx) => {
      const [owningCase] = await tx
        .select({ id: t.evalCases.id })
        .from(t.evalCases)
        .where(and(eq(t.evalCases.workspaceId, values.workspaceId), eq(t.evalCases.id, values.caseId)));
      if (!owningCase) {
        throw new NotFoundError(`eval case ${values.caseId} not found in workspace`);
      }

      const [row] = await tx
        .insert(t.evalRuns)
        .values({
          caseId: values.caseId,
          actualOutput: values.actualOutput as object | null,
          pass: values.pass,
          recall: values.recall,
          precision: values.precision,
          citationAccuracy: values.citationAccuracy,
          durationMs: values.durationMs,
          costUsd: values.costUsd,
          suiteRunId: values.suiteRunId,
          agentVersion: values.agentVersion,
        })
        .returning();
      return mapEvalRunRow(row!);
    });
  }

  async getRunById(workspaceId: string, id: string): Promise<StoredEvalRun | undefined> {
    const [row] = await this.db
      .select({ run: t.evalRuns })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalRuns.id, id)));
    return row ? mapEvalRunRow(row.run) : undefined;
  }

  async listRunsByCase(
    workspaceId: string,
    caseId: string,
    limit = 50,
  ): Promise<StoredEvalRun[]> {
    const rows = await this.db
      .select({ run: t.evalRuns })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalRuns.caseId, caseId)))
      .orderBy(desc(t.evalRuns.ranAt))
      .limit(limit);
    return rows.map((r) => mapEvalRunRow(r.run));
  }

  async listRunsBySuiteRun(workspaceId: string, suiteRunId: string): Promise<StoredEvalRun[]> {
    const rows = await this.db
      .select({ run: t.evalRuns })
      .from(t.evalRuns)
      .innerJoin(t.evalSuiteRuns, eq(t.evalSuiteRuns.id, t.evalRuns.suiteRunId))
      .where(
        and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalRuns.suiteRunId, suiteRunId)),
      )
      .orderBy(desc(t.evalRuns.ranAt));
    return rows.map((r) => mapEvalRunRow(r.run));
  }

  async latestRunsByCaseIds(
    workspaceId: string,
    caseIds: string[],
  ): Promise<Map<string, StoredEvalRun>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .select({ run: t.evalRuns })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), inArray(t.evalRuns.caseId, caseIds)))
      .orderBy(desc(t.evalRuns.ranAt));
    const latest = new Map<string, StoredEvalRun>();
    for (const { run } of rows) {
      if (!latest.has(run.caseId)) latest.set(run.caseId, mapEvalRunRow(run));
    }
    return latest;
  }

  async startIfNoneRunning(values: StartEvalSuiteRun): Promise<StoredEvalSuiteRun | undefined> {
    return this.db.transaction(async (tx) => {
      const [running] = await tx
        .select({ id: t.evalSuiteRuns.id })
        .from(t.evalSuiteRuns)
        .where(
          and(
            eq(t.evalSuiteRuns.workspaceId, values.workspaceId),
            eq(t.evalSuiteRuns.agentId, values.agentId),
            eq(t.evalSuiteRuns.status, 'running'),
          ),
        );
      if (running) return undefined;

      const [row] = await tx
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId: values.workspaceId,
          agentId: values.agentId,
          agentVersion: values.agentVersion,
          status: 'running',
          casesTotal: values.casesTotal,
        })
        .returning();
      return mapEvalSuiteRunRow(row!);
    });
  }

  async getSuiteRunById(workspaceId: string, id: string): Promise<StoredEvalSuiteRun | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)));
    return row ? mapEvalSuiteRunRow(row) : undefined;
  }

  async getRunningForAgent(
    workspaceId: string,
    agentId: string,
  ): Promise<StoredEvalSuiteRun | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.status, 'running'),
        ),
      );
    return row ? mapEvalSuiteRunRow(row) : undefined;
  }

  async listForAgent(
    workspaceId: string,
    agentId: string,
    limit: number,
  ): Promise<StoredEvalSuiteRun[]> {
    const rows = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.agentId, agentId)),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
    return rows.map(mapEvalSuiteRunRow);
  }

  async trend(workspaceId: string, agentId: string, limit: number): Promise<StoredEvalSuiteRun[]> {
    const rows = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.status, 'done'),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
    return rows.map(mapEvalSuiteRunRow).reverse();
  }

  async recentCompleted(
    workspaceId: string,
    agentId: string,
    limit: number,
  ): Promise<StoredEvalSuiteRun[]> {
    const rows = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.status, 'done'),
        ),
      )
      .orderBy(desc(t.evalSuiteRuns.startedAt))
      .limit(limit);
    return rows.map(mapEvalSuiteRunRow);
  }

  async getCompletedById(
    workspaceId: string,
    agentId: string,
    id: string,
  ): Promise<StoredEvalSuiteRun | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(
        and(
          eq(t.evalSuiteRuns.workspaceId, workspaceId),
          eq(t.evalSuiteRuns.agentId, agentId),
          eq(t.evalSuiteRuns.id, id),
          eq(t.evalSuiteRuns.status, 'done'),
        ),
      );
    return row ? mapEvalSuiteRunRow(row) : undefined;
  }

  async finish(
    workspaceId: string,
    id: string,
    patch: FinishEvalSuiteRun,
  ): Promise<StoredEvalSuiteRun | undefined> {
    const [row] = await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: patch.status,
        finishedAt: new Date(),
        casesPassed: patch.casesPassed,
        recall: patch.recall,
        precision: patch.precision,
        citationAccuracy: patch.citationAccuracy,
        costUsd: patch.costUsd,
        durationMs: patch.durationMs,
      })
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)))
      .returning();
    return row ? mapEvalSuiteRunRow(row) : undefined;
  }

  async cancelIfRunning(workspaceId: string, id: string): Promise<CancelSuiteRunOutcome> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ status: t.evalSuiteRuns.status })
        .from(t.evalSuiteRuns)
        .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)));
      if (!existing) return 'not_found';
      if (existing.status !== 'running') return 'not_running';

      await tx
        .update(t.evalSuiteRuns)
        .set({ status: 'cancelled', finishedAt: new Date() })
        .where(
          and(
            eq(t.evalSuiteRuns.workspaceId, workspaceId),
            eq(t.evalSuiteRuns.id, id),
            eq(t.evalSuiteRuns.status, 'running'),
          ),
        );
      return 'cancelled';
    });
  }

  async reapStale(): Promise<number> {
    return reapStaleSuiteRuns(this.db);
  }

  async listAgents(workspaceId: string): Promise<AgentSummary[]> {
    return this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        version: t.agents.version,
        enabled: t.agents.enabled,
      })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.createdAt), asc(t.agents.id));
  }

  async getAgent(workspaceId: string, agentId: string): Promise<AgentSummary | undefined> {
    const [row] = await this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        version: t.agents.version,
        enabled: t.agents.enabled,
      })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row;
  }

  async getVersionSnapshot(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersionSnapshot | undefined> {
    const [joined] = await this.db
      .select({ version: t.agentVersions })
      .from(t.agentVersions)
      .innerJoin(t.agents, eq(t.agents.id, t.agentVersions.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentVersions.agentId, agentId),
          eq(t.agentVersions.version, version),
        ),
      );
    if (!joined) return undefined;
    const row = joined.version;
    const config = row.configJson as {
      provider: AgentVersionSnapshot['provider'];
      model: string;
      system_prompt: string;
      output_schema: unknown;
      strategy: AgentVersionSnapshot['strategy'];
      ci_fail_on: AgentVersionSnapshot['ciFailOn'];
      repo_intel: boolean;
      skills: string[];
    };
    return {
      agentId: row.agentId,
      version: row.version,
      provider: config.provider,
      model: config.model,
      systemPrompt: config.system_prompt,
      outputSchema: config.output_schema,
      strategy: config.strategy,
      ciFailOn: config.ci_fail_on,
      repoIntel: config.repo_intel,
      skillBlocks: await this.skillBlocksFor(workspaceId, config.skills ?? []),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async skillBlocksFor(workspaceId: string, skillIds: string[]): Promise<string[]> {
    if (skillIds.length === 0) return [];
    const rows = await this.db
      .select({ id: t.skills.id, name: t.skills.name, body: t.skills.body })
      .from(t.skills)
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.enabled, true),
          inArray(t.skills.id, skillIds),
        ),
      );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return skillIds
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map((row) => `### ${row.name}\n${row.body}`);
  }

  async getFindingWithDiff(
    workspaceId: string,
    findingId: string,
  ): Promise<SourceFindingWithDiff | undefined> {
    const [row] = await this.db
      .select({
        id: t.findings.id,
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        category: t.findings.category,
        severity: t.findings.severity,
        title: t.findings.title,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
        agentId: t.reviews.agentId,
        prId: t.reviews.prId,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.findings.id, findingId)));
    if (!row) return undefined;

    const [file] = await this.db
      .select({ path: t.prFiles.path, patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, row.prId), eq(t.prFiles.path, row.file)));

    return {
      finding: {
        id: row.id,
        agentId: row.agentId,
        file: row.file,
        startLine: row.startLine,
        endLine: row.endLine,
        category: row.category as SourceFindingWithDiff['finding']['category'],
        severity: row.severity as SourceFindingWithDiff['finding']['severity'],
        title: row.title,
        acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
        dismissedAt: row.dismissedAt ? row.dismissedAt.toISOString() : null,
      },
      fileDiff: file?.patch ? unifiedDiffForFile(file.path, file.patch) : null,
    };
  }
}

function mapEvalCaseRow(row: typeof t.evalCases.$inferSelect): StoredEvalCase {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ownerKind: row.ownerKind,
    ownerId: row.ownerId,
    name: row.name,
    inputDiff: row.inputDiff ?? '',
    inputFiles: row.inputFiles,
    inputMeta: row.inputMeta,
    expectedOutput: (row.expectedOutput as EvalExpectation[] | null) ?? [],
    notes: row.notes,
    sourceFindingId: row.sourceFindingId,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapEvalRunRow(row: typeof t.evalRuns.$inferSelect): StoredEvalRun {
  return {
    id: row.id,
    caseId: row.caseId,
    ranAt: row.ranAt.toISOString(),
    actualOutput: row.actualOutput,
    pass: row.pass,
    recall: row.recall,
    precision: row.precision,
    citationAccuracy: row.citationAccuracy,
    durationMs: row.durationMs,
    costUsd: row.costUsd,
    suiteRunId: row.suiteRunId,
    agentVersion: row.agentVersion,
  };
}

function mapEvalSuiteRunRow(row: typeof t.evalSuiteRuns.$inferSelect): StoredEvalSuiteRun {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    agentVersion: row.agentVersion,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    casesTotal: row.casesTotal,
    casesPassed: row.casesPassed,
    recall: row.recall,
    precision: row.precision,
    citationAccuracy: row.citationAccuracy,
    costUsd: row.costUsd,
    durationMs: row.durationMs,
  };
}

function unifiedDiffForFile(path: string, patch: string): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, patch].join('\n');
}

export async function reapStaleSuiteRuns(db: Db): Promise<number> {
  const rows = await db
    .update(t.evalSuiteRuns)
    .set({ status: 'failed', finishedAt: new Date() })
    .where(eq(t.evalSuiteRuns.status, 'running'))
    .returning({ id: t.evalSuiteRuns.id });
  return rows.length;
}
