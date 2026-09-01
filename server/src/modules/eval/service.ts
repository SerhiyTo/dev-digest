import { z } from 'zod';
import {
  EvalCaseInput,
  EvalCompare,
  EvalDashboard,
  EvalExpectation,
  EvalRun,
  EvalRunResult,
} from '@devdigest/shared';
import { AppError, ConflictError, NotFoundError } from '../../platform/errors.js';
import { skillBodyPatch } from '../_shared/diff.js';
import { deriveExpectationFromFinding, disambiguateCaseName } from './domain.js';
import {
  toEvalCaseRecord,
  toEvalRunRecord,
  toEvalSuiteRunRecord,
  type EvalCaseRowInput,
} from './helpers.js';
import {
  MAX_EVAL_CASES_PER_OWNER,
  MAX_EVAL_CASE_NAME_LENGTH,
  MAX_EVAL_DIFF_BYTES,
  MAX_EVAL_EXPECTATION_JSON_BYTES,
  MAX_EXPECTATIONS_PER_CASE,
  EVAL_RUN_PAGE_SIZE,
} from './constants.js';
import type {
  AgentConfigSource,
  EvalCaseStore,
  EvalRunStore,
  EvalSuiteRunStore,
  SourceDiffSource,
  StoredEvalCase,
  StoredEvalRun,
  StoredEvalSuiteRun,
  SuiteExecutor,
} from './ports.js';

const EvalCaseCreateBody = EvalCaseInput.omit({ owner_kind: true, owner_id: true });
type EvalCaseCreateBody = z.infer<typeof EvalCaseCreateBody>;
const EvalCaseUpdateBody = EvalCaseCreateBody.partial();
type EvalCaseUpdateBody = z.infer<typeof EvalCaseUpdateBody>;

const EVAL_TREND_LIMIT = 30;

function parseOrBadRequest<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError(
      'validation_error',
      issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid eval case input',
      400,
      { issues: parsed.error.issues },
    );
  }
  return parsed.data;
}

function parseOrInternalError<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('internal_error', 'eval: response failed its own contract', 500, {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

function diffOrNull(older: number | null, newer: number | null): number | null {
  return older === null || newer === null ? null : newer - older;
}

function metricDiff(older: number | null, newer: number | null) {
  return { older, newer, diff: diffOrNull(older, newer) };
}

export interface EvalServiceDeps {
  caseStore: EvalCaseStore;
  runStore: EvalRunStore;
  suiteRunStore: EvalSuiteRunStore;
  agentConfig: AgentConfigSource;
  sourceDiff: SourceDiffSource;
  executor: SuiteExecutor;
}

export class EvalService {
  constructor(private readonly deps: EvalServiceDeps) {}

  async createFromFinding(workspaceId: string, findingId: string) {
    const found = await this.deps.sourceDiff.getFindingWithDiff(workspaceId, findingId);
    if (!found) throw new NotFoundError('Finding not found');

    const existing = await this.deps.caseStore.getCaseBySourceFindingId(workspaceId, findingId);
    if (existing) {
      return { case: await this.caseRecordWithLatestRun(workspaceId, existing), created: false };
    }

    const derived = deriveExpectationFromFinding({
      file: found.finding.file,
      startLine: found.finding.startLine,
      endLine: found.finding.endLine,
      category: found.finding.category,
      severity: found.finding.severity,
      acceptedAt: found.finding.acceptedAt,
      dismissedAt: found.finding.dismissedAt,
    });
    if (!derived.ok) {
      throw new AppError(
        'validation_error',
        'The finding must be accepted or dismissed before it can become an eval case',
        400,
      );
    }
    if (!found.finding.agentId) {
      throw new AppError(
        'validation_error',
        'The finding has no owning agent to attribute the eval case to',
        400,
      );
    }
    if (found.fileDiff === null) {
      throw new AppError('validation_error', 'No diff is available to snapshot for this finding', 400);
    }

    const existingNames = (
      await this.deps.caseStore.listCasesByOwner(workspaceId, 'agent', found.finding.agentId)
    ).map((c) => c.name);
    const name = disambiguateCaseName(found.finding.title, existingNames);

    const created = await this.deps.caseStore.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: found.finding.agentId,
      name,
      inputDiff: found.fileDiff,
      expectedOutput: derived.expectations,
      sourceFindingId: findingId,
    });

    return { case: this.caseRecordFromStored(created), created: true };
  }

  async createCase(workspaceId: string, agentId: string, body: unknown) {
    const input = parseOrBadRequest(EvalCaseCreateBody, body);
    this.enforceCaseLimits(input);

    const agent = await this.deps.agentConfig.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const count = await this.deps.caseStore.countCasesForOwner(workspaceId, 'agent', agentId);
    if (count >= MAX_EVAL_CASES_PER_OWNER) {
      throw new AppError(
        'validation_error',
        `An agent may own at most ${MAX_EVAL_CASES_PER_OWNER} eval cases`,
        400,
      );
    }

    const created = await this.deps.caseStore.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files ?? null,
      inputMeta: input.input_meta ?? null,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
    });

    return this.caseRecordFromStored(created);
  }

  async getCase(workspaceId: string, id: string) {
    const stored = await this.deps.caseStore.getCaseById(workspaceId, id);
    if (!stored) throw new NotFoundError('Eval case not found');
    return this.caseRecordWithLatestRun(workspaceId, stored);
  }

  async updateCase(workspaceId: string, id: string, body: unknown) {
    const input = parseOrBadRequest(EvalCaseUpdateBody, body);
    this.enforceCaseLimits(input);

    const updated = await this.deps.caseStore.updateCase(workspaceId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.input_diff !== undefined ? { inputDiff: input.input_diff } : {}),
      ...(input.input_files !== undefined ? { inputFiles: input.input_files } : {}),
      ...(input.input_meta !== undefined ? { inputMeta: input.input_meta } : {}),
      ...(input.expected_output !== undefined ? { expectedOutput: input.expected_output } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    });
    if (!updated) throw new NotFoundError('Eval case not found');
    return this.caseRecordWithLatestRun(workspaceId, updated);
  }

  async deleteCase(workspaceId: string, id: string): Promise<{ ok: boolean }> {
    const ok = await this.deps.caseStore.deleteCaseById(workspaceId, id);
    return { ok };
  }

  async listCases(workspaceId: string, agentId: string) {
    const cases = await this.deps.caseStore.listCasesByOwner(workspaceId, 'agent', agentId);
    const latest = await this.deps.runStore.latestRunsByCaseIds(
      workspaceId,
      cases.map((c) => c.id),
    );
    return cases.map((c) => this.caseRecordFromStored(c, latest.get(c.id)));
  }

  async runSingleCase(workspaceId: string, caseId: string): Promise<EvalRunResult> {
    const kase = await this.deps.caseStore.getCaseById(workspaceId, caseId);
    if (!kase) throw new NotFoundError('Eval case not found');
    if (kase.ownerKind !== 'agent') {
      throw new AppError('validation_error', 'Only agent-owned eval cases can be run', 400);
    }
    const agent = await this.deps.agentConfig.getAgent(workspaceId, kase.ownerId);
    if (!agent) throw new NotFoundError('Owning agent not found');

    await this.deps.executor.runSingleCase({
      workspaceId,
      agentId: agent.id,
      caseId,
      agentVersion: agent.version,
    });

    const [run] = await this.deps.runStore.listRunsByCase(workspaceId, caseId, 1);
    if (!run) {
      throw new AppError('internal_error', 'eval: single-case run did not persist a result', 500);
    }
    return this.toRunResult(run, kase.name, kase.expectedOutput);
  }

  async startSuiteRun(workspaceId: string, agentId: string) {
    const agent = await this.deps.agentConfig.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const cases = await this.deps.caseStore.listCasesByOwner(workspaceId, 'agent', agentId);
    const started = await this.deps.suiteRunStore.startIfNoneRunning({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      casesTotal: cases.length,
    });
    if (!started) {
      throw new ConflictError('An eval suite run is already in progress for this agent');
    }

    this.deps.executor.startSuite({
      workspaceId,
      agentId,
      suiteRunId: started.id,
      agentVersion: agent.version,
    });

    return this.suiteRunRecord(started);
  }

  async cancelSuiteRun(workspaceId: string, id: string): Promise<{ ok: boolean }> {
    const outcome = await this.deps.suiteRunStore.cancelIfRunning(workspaceId, id);
    if (outcome === 'not_found') throw new NotFoundError('Eval suite run not found');
    if (outcome === 'cancelled') this.deps.executor.cancelSuite(id);
    return { ok: outcome === 'cancelled' };
  }

  async getSuiteRun(workspaceId: string, id: string) {
    const suiteRun = await this.deps.suiteRunStore.getSuiteRunById(workspaceId, id);
    if (!suiteRun) throw new NotFoundError('Eval suite run not found');

    const rows = await this.deps.runStore.listRunsBySuiteRun(workspaceId, id);
    const names = await this.caseNames(workspaceId, [...new Set(rows.map((r) => r.caseId))]);
    return {
      suite_run: this.suiteRunRecord(suiteRun),
      runs: rows.map((r) => this.runRecord(r, names.get(r.caseId) ?? null)),
    };
  }

  async listSuiteRuns(workspaceId: string, agentId: string) {
    const runs = await this.deps.suiteRunStore.listForAgent(workspaceId, agentId, EVAL_RUN_PAGE_SIZE);
    return runs.map((r) => this.suiteRunRecord(r));
  }

  async getDashboard(workspaceId: string, agentId: string): Promise<EvalDashboard> {
    const agent = await this.deps.agentConfig.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const [casesTotal, recent, trendRuns] = await Promise.all([
      this.deps.caseStore.countCasesForOwner(workspaceId, 'agent', agentId),
      this.deps.suiteRunStore.recentCompleted(workspaceId, agentId, 2),
      this.deps.suiteRunStore.trend(workspaceId, agentId, EVAL_TREND_LIMIT),
    ]);
    const [latest, previous] = recent;

    const current = latest
      ? {
          recall: latest.recall,
          precision: latest.precision,
          citation_accuracy: latest.citationAccuracy,
          traces_passed: latest.casesPassed,
          traces_total: latest.casesTotal ?? 0,
          cost_usd: latest.costUsd,
        }
      : {
          recall: null,
          precision: null,
          citation_accuracy: null,
          traces_passed: null,
          traces_total: 0,
          cost_usd: null,
        };

    const delta =
      latest && previous
        ? {
            recall: diffOrNull(previous.recall, latest.recall),
            precision: diffOrNull(previous.precision, latest.precision),
            citation_accuracy: diffOrNull(previous.citationAccuracy, latest.citationAccuracy),
          }
        : { recall: null, precision: null, citation_accuracy: null };

    const trend = trendRuns.map((r) => ({
      ran_at: r.startedAt,
      recall: r.recall,
      precision: r.precision,
      citation_accuracy: r.citationAccuracy,
      pass_rate: r.casesTotal && r.casesTotal > 0 ? (r.casesPassed ?? 0) / r.casesTotal : 0,
      cost_usd: r.costUsd,
    }));

    const recentRunRows = latest
      ? await this.deps.runStore.listRunsBySuiteRun(workspaceId, latest.id)
      : [];
    const names = await this.caseNames(workspaceId, [...new Set(recentRunRows.map((r) => r.caseId))]);
    const recentRuns = recentRunRows.map((r) => this.runRecord(r, names.get(r.caseId) ?? null));

    return parseOrInternalError(EvalDashboard, {
      owner_kind: 'agent',
      owner_id: agentId,
      cases_total: casesTotal,
      current,
      delta,
      trend,
      recent_runs: recentRuns,
      alert: null,
    });
  }

  async listDashboards(workspaceId: string): Promise<EvalDashboard[]> {
    const agents = await this.deps.agentConfig.listAgents(workspaceId);
    const dashboards: EvalDashboard[] = [];
    for (const agent of agents) {
      dashboards.push(await this.getDashboard(workspaceId, agent.id));
    }
    return dashboards;
  }

  async compareRuns(
    workspaceId: string,
    agentId: string,
    runIdA: string,
    runIdB: string,
  ): Promise<EvalCompare> {
    const [a, b] = await Promise.all([
      this.deps.suiteRunStore.getCompletedById(workspaceId, agentId, runIdA),
      this.deps.suiteRunStore.getCompletedById(workspaceId, agentId, runIdB),
    ]);
    if (!a || !b) throw new NotFoundError('One or both eval runs were not found or are not complete');

    const [older, newer] = a.startedAt <= b.startedAt ? [a, b] : [b, a];
    const sameVersion = older.agentVersion === newer.agentVersion;

    const [olderSnapshot, newerSnapshot] = await Promise.all([
      this.deps.agentConfig.getVersionSnapshot(workspaceId, agentId, older.agentVersion),
      this.deps.agentConfig.getVersionSnapshot(workspaceId, agentId, newer.agentVersion),
    ]);
    const bothSnapshotsReadable = Boolean(olderSnapshot && newerSnapshot);
    const promptDiff = bothSnapshotsReadable
      ? skillBodyPatch(olderSnapshot!.systemPrompt, newerSnapshot!.systemPrompt)
      : null;

    return parseOrInternalError(EvalCompare, {
      older_run: this.suiteRunRecord(older),
      newer_run: this.suiteRunRecord(newer),
      recall: metricDiff(older.recall, newer.recall),
      precision: metricDiff(older.precision, newer.precision),
      citation_accuracy: metricDiff(older.citationAccuracy, newer.citationAccuracy),
      cost_usd: metricDiff(older.costUsd, newer.costUsd),
      same_version: sameVersion,
      prompt_diff: promptDiff,
      prompt_diff_unavailable: !bothSnapshotsReadable,
    });
  }

  async reapStale(): Promise<number> {
    return this.deps.suiteRunStore.reapStale();
  }

  private enforceCaseLimits(input: {
    name?: string;
    input_diff?: string;
    expected_output?: EvalExpectation[];
  }): void {
    if (input.name !== undefined && input.name.length > MAX_EVAL_CASE_NAME_LENGTH) {
      throw new AppError(
        'validation_error',
        `name must be at most ${MAX_EVAL_CASE_NAME_LENGTH} characters`,
        400,
      );
    }
    if (
      input.input_diff !== undefined &&
      Buffer.byteLength(input.input_diff, 'utf8') > MAX_EVAL_DIFF_BYTES
    ) {
      throw new AppError('validation_error', `input_diff exceeds ${MAX_EVAL_DIFF_BYTES} bytes`, 400);
    }
    if (input.expected_output !== undefined) {
      if (input.expected_output.length > MAX_EXPECTATIONS_PER_CASE) {
        throw new AppError(
          'validation_error',
          `expected_output may carry at most ${MAX_EXPECTATIONS_PER_CASE} entries`,
          400,
        );
      }
      if (
        Buffer.byteLength(JSON.stringify(input.expected_output), 'utf8') >
        MAX_EVAL_EXPECTATION_JSON_BYTES
      ) {
        throw new AppError(
          'validation_error',
          `expected_output exceeds ${MAX_EVAL_EXPECTATION_JSON_BYTES} bytes`,
          400,
        );
      }
    }
  }

  private async caseRecordWithLatestRun(workspaceId: string, stored: StoredEvalCase) {
    const [latestRun] = await this.deps.runStore.listRunsByCase(workspaceId, stored.id, 1);
    return this.caseRecordFromStored(stored, latestRun);
  }

  private caseRecordFromStored(stored: StoredEvalCase, latestRun?: StoredEvalRun) {
    const expectationKinds = [...new Set(stored.expectedOutput.map((e) => e.kind))];
    const row: EvalCaseRowInput = {
      id: stored.id,
      ownerKind: stored.ownerKind,
      ownerId: stored.ownerId,
      name: stored.name,
      inputDiff: stored.inputDiff,
      inputFiles: stored.inputFiles,
      inputMeta: stored.inputMeta,
      expectedOutput: stored.expectedOutput,
      notes: stored.notes,
      sourceFindingId: stored.sourceFindingId,
      createdAt: stored.createdAt,
      expectationKinds,
      lastRunAt: latestRun ? latestRun.ranAt : null,
      lastRunPass: latestRun ? latestRun.pass : null,
    };
    return toEvalCaseRecord(row);
  }

  private runRecord(run: StoredEvalRun, caseName: string | null) {
    return toEvalRunRecord({
      id: run.id,
      caseId: run.caseId,
      caseName,
      suiteRunId: run.suiteRunId,
      agentVersion: run.agentVersion,
      ranAt: run.ranAt,
      actualOutput: run.actualOutput,
      pass: run.pass,
      recall: run.recall,
      precision: run.precision,
      citationAccuracy: run.citationAccuracy,
      durationMs: run.durationMs,
      costUsd: run.costUsd,
    });
  }

  private suiteRunRecord(run: StoredEvalSuiteRun) {
    return toEvalSuiteRunRecord({
      id: run.id,
      agentId: run.agentId,
      agentVersion: run.agentVersion,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      casesTotal: run.casesTotal,
      casesPassed: run.casesPassed,
      recall: run.recall,
      precision: run.precision,
      citationAccuracy: run.citationAccuracy,
      costUsd: run.costUsd,
      durationMs: run.durationMs,
    });
  }

  private toRunResult(run: StoredEvalRun, caseName: string, expectedOutput: unknown): EvalRunResult {
    return parseOrInternalError(EvalRunResult, {
      run_id: run.id,
      case_id: run.caseId,
      result: {
        recall: run.recall,
        precision: run.precision,
        citation_accuracy: run.citationAccuracy,
        traces_passed: run.pass ? 1 : 0,
        traces_total: 1,
        duration_ms: run.durationMs ?? 0,
        cost_usd: run.costUsd,
        per_trace: [
          {
            name: caseName,
            pass: run.pass ?? false,
            expected: expectedOutput,
            actual: run.actualOutput,
          },
        ],
      } satisfies EvalRun,
    });
  }

  private async caseNames(workspaceId: string, caseIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    await Promise.all(
      caseIds.map(async (id) => {
        const kase = await this.deps.caseStore.getCaseById(workspaceId, id);
        if (kase) map.set(id, kase.name);
      }),
    );
    return map;
  }
}
