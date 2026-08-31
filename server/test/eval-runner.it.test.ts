import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  CompletionRequest,
  CompletionResult,
  Finding,
  LLMProvider,
  ModelInfo,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { reapStaleSuiteRuns } from '../src/modules/eval/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[eval-runner] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF_PATH = 'src/gateway/webhookRelay.ts';
const GROUNDED_LINE = 11;
const UNGROUNDED_LINE = 500;

function diffFixture(path = DIFF_PATH): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -10,5 +10,5 @@`,
    ` const a = 1;`,
    `-const b = 2;`,
    `+const b = fetchExternal(url);`,
    ` const c = 3;`,
    ` const d = 4;`,
    ` const e = 5;`,
  ].join('\n');
}

let findingCounter = 0;
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  findingCounter += 1;
  return {
    id: `finding-${findingCounter}`,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Server-Side Request Forgery via merchant callback URL',
    file: DIFF_PATH,
    start_line: GROUNDED_LINE,
    end_line: GROUNDED_LINE,
    rationale: 'The callback URL comes straight from the request body with no validation.',
    suggestion: 'Validate the callback URL against an allowlist of merchant domains.',
    confidence: 0.9,
    kind: 'finding',
    ...overrides,
  };
}

function makeReview(findings: Finding[], overrides: Partial<Review> = {}): Review {
  return {
    verdict: findings.length > 0 ? 'request_changes' : 'approve',
    summary: findings.length > 0 ? 'Found issues in the diff.' : 'No issues found in the diff.',
    score: findings.length > 0 ? 40 : 95,
    findings,
    ...overrides,
  };
}

function mustFindExpectation(line = GROUNDED_LINE, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'must_find',
    file: DIFF_PATH,
    line,
    end_line: line,
    category: 'security',
    ...overrides,
  };
}

type ScriptedCall =
  | { kind: 'review'; review: Review }
  | { kind: 'error'; errorMessage: string }
  | { kind: 'delayed'; delayMs: number; review: Review };

class ScriptedLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'openrouter' = 'openrouter';
  calls: string[] = [];
  private scripts = new Map<string, ScriptedCall>();

  registerReview(caseId: string, review: Review): void {
    this.scripts.set(caseId, { kind: 'review', review });
  }

  registerError(caseId: string, errorMessage: string): void {
    this.scripts.set(caseId, { kind: 'error', errorMessage });
  }

  registerDelayedReview(caseId: string, delayMs: number, review: Review): void {
    this.scripts.set(caseId, { kind: 'delayed', delayMs, review });
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: 'scripted-model', provider: 'openrouter' }];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return { text: 'unused', model: req.model, tokensIn: 0, tokensOut: 0, costUsd: 0 };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const caseId = req.sessionId?.split(':').pop() ?? '';
    this.calls.push(caseId);
    const script = this.scripts.get(caseId);
    if (!script) throw new Error(`ScriptedLLMProvider: no script registered for case ${caseId}`);
    if (script.kind === 'error') throw new Error(script.errorMessage);
    if (script.kind === 'delayed') await new Promise((resolve) => setTimeout(resolve, script.delayMs));
    const parsed = req.schema.safeParse(script.review);
    if (!parsed.success) {
      throw new Error(`ScriptedLLMProvider fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0.001,
      raw: JSON.stringify(script.review),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

interface SuiteRunRecord {
  id: string;
  agent_id: string;
  agent_version: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  cases_total: number;
  cases_passed: number | null;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
}

interface RunRecord {
  id: string;
  case_id: string;
  suite_run_id: string | null;
  agent_version: number | null;
  actual_output: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  duration_ms: number | null;
  cost_usd: number | null;
}

interface SuiteRunBody {
  suite_run: SuiteRunRecord;
  runs: RunRecord[];
}

interface DashboardBody {
  cases_total: number;
  current: { recall: number | null };
  delta: { recall: number | null; precision: number | null; citation_accuracy: number | null };
  trend: { ran_at: string; recall: number | null; precision: number | null }[];
}

async function waitUntil<T>(
  poll: () => Promise<T>,
  predicate: (value: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20_000, intervalMs = 20 } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await poll();
    if (predicate(value)) return value;
    if (Date.now() > deadline) throw new Error('waitUntil timed out');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function getSuiteRun(app: FastifyInstance, id: string): Promise<SuiteRunBody> {
  const res = await app.inject({ method: 'GET', url: `/eval-suite-runs/${id}` });
  expect(res.statusCode).toBe(200);
  return res.json() as SuiteRunBody;
}

async function waitForSuiteRunTerminal(app: FastifyInstance, id: string): Promise<SuiteRunBody> {
  return waitUntil(() => getSuiteRun(app, id), (body) => body.suite_run.status !== 'running');
}

async function createAgent(app: FastifyInstance, name: string): Promise<{ id: string; version: number }> {
  const res = await app.inject({
    method: 'POST',
    url: '/agents',
    payload: {
      name,
      provider: 'openrouter',
      model: 'scripted-model',
      system_prompt: 'You are a security reviewer.',
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; version: number };
}

async function createCase(
  app: FastifyInstance,
  agentId: string,
  name: string,
  expectedOutput: unknown[],
  inputDiff = diffFixture(),
): Promise<{ id: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/agents/${agentId}/eval-cases`,
    payload: { name, input_diff: inputDiff, expected_output: expectedOutput },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

async function listSuiteRuns(app: FastifyInstance, agentId: string): Promise<{ runs: SuiteRunRecord[] }> {
  const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs` });
  expect(res.statusCode).toBe(200);
  return res.json() as { runs: SuiteRunRecord[] };
}

async function getDashboard(app: FastifyInstance, agentId: string): Promise<DashboardBody> {
  const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-dashboard` });
  expect(res.statusCode).toBe(200);
  return res.json() as DashboardBody;
}

d('eval suite runner (AC-19–AC-26, AC-43, AC-57, AC-59–AC-61)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let provider: ScriptedLLMProvider;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    provider = new ScriptedLLMProvider();
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: provider } },
    });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('AC-19 / AC-20 / AC-23 — a start writes one suite run, one per-case row per case, and completion writes aggregates and marks the run done', async () => {
    const agent = await createAgent(app, 'AC-19-20-23 agent');
    const passingCase = await createCase(app, agent.id, 'passing case', [mustFindExpectation()]);
    const failingCase = await createCase(app, agent.id, 'scored-fail case', [mustFindExpectation()]);
    provider.registerReview(passingCase.id, makeReview([makeFinding()]));
    provider.registerReview(failingCase.id, makeReview([]));

    const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs/start` });
    expect(start.statusCode).toBe(202);
    const started = start.json() as SuiteRunRecord;
    expect(started).toMatchObject({
      agent_id: agent.id,
      agent_version: agent.version,
      status: 'running',
      cases_total: 2,
    });
    expect(typeof started.started_at).toBe('string');

    const finished = await waitForSuiteRunTerminal(app, started.id);
    expect(finished.suite_run).toMatchObject({
      id: started.id,
      status: 'done',
      cases_passed: 1,
      cases_total: 2,
      recall: 0.5,
      precision: 1,
      citation_accuracy: 1,
    });
    expect(typeof finished.suite_run.cost_usd).toBe('number');
    expect(typeof finished.suite_run.duration_ms).toBe('number');
    expect(typeof finished.suite_run.finished_at).toBe('string');

    expect(finished.runs).toHaveLength(2);
    for (const run of finished.runs) {
      expect(run).toMatchObject({ suite_run_id: started.id, agent_version: agent.version });
      expect(typeof run.case_id).toBe('string');
      expect(run.actual_output).not.toBeNull();
      expect(typeof run.duration_ms).toBe('number');
      expect(typeof run.cost_usd).toBe('number');
    }
    expect(finished.runs.find((r) => r.case_id === passingCase.id)).toMatchObject({
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
    });
    expect(finished.runs.find((r) => r.case_id === failingCase.id)).toMatchObject({
      pass: false,
      recall: 0,
      precision: null,
      citation_accuracy: null,
    });

    const list = await listSuiteRuns(app, agent.id);
    expect(list.runs).toHaveLength(1);
    expect(list.runs[0]).toMatchObject({ id: started.id, agent_version: agent.version });
  });

  it('AC-21 — a second start while one is in progress answers 409 and writes no second suite run', async () => {
    const agent = await createAgent(app, 'AC-21 agent');
    const kase = await createCase(app, agent.id, 'slow case', [mustFindExpectation()]);
    provider.registerDelayedReview(kase.id, 400, makeReview([makeFinding()]));

    const start1 = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs/start` });
    expect(start1.statusCode).toBe(202);
    const started1 = start1.json() as SuiteRunRecord;

    const start2 = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs/start` });
    expect(start2.statusCode).toBe(409);

    const list = await listSuiteRuns(app, agent.id);
    expect(list.runs).toHaveLength(1);
    expect(list.runs[0]!.id).toBe(started1.id);

    await waitForSuiteRunTerminal(app, started1.id);
  });

  it('AC-22 — a failing case neither stops the suite nor leaves the denominators', async () => {
    const agent = await createAgent(app, 'AC-22 agent');
    const okCase = await createCase(app, agent.id, 'ok case', [mustFindExpectation()]);
    const errorCase = await createCase(app, agent.id, 'erroring case', [mustFindExpectation()]);
    provider.registerReview(okCase.id, makeReview([makeFinding()]));
    provider.registerError(errorCase.id, 'provider timed out');

    const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs/start` });
    expect(start.statusCode).toBe(202);
    const started = start.json() as SuiteRunRecord;
    const finished = await waitForSuiteRunTerminal(app, started.id);

    expect(finished.suite_run).toMatchObject({ status: 'done', cases_total: 2, cases_passed: 1, recall: 0.5 });
    expect(finished.runs).toHaveLength(2);

    const failedRow = finished.runs.find((r) => r.case_id === errorCase.id);
    expect(failedRow).toMatchObject({ pass: false });
    expect((failedRow!.actual_output as { error: string }).error).toContain('provider timed out');
  });

  it('AC-24 — a run whose process died is incomplete and excluded from trend, delta and compare', async () => {
    const agent = await createAgent(app, 'AC-24 agent');
    const staleStart = new Date(Date.now() - 60_000);

    const [stale] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        agentVersion: agent.version,
        status: 'running',
        startedAt: staleStart,
        casesTotal: 1,
      })
      .returning();

    const [control] = await pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        agentVersion: agent.version,
        status: 'done',
        startedAt: new Date(),
        finishedAt: new Date(),
        casesTotal: 1,
        casesPassed: 1,
        recall: 1,
        precision: 1,
        citationAccuracy: 1,
        costUsd: 0.01,
        durationMs: 500,
      })
      .returning();

    const reaped = await reapStaleSuiteRuns(pg.handle.db);
    expect(reaped).toBeGreaterThanOrEqual(1);

    const [reread] = await pg.handle.db
      .select()
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.id, stale!.id));
    expect(reread).toMatchObject({ status: 'failed', recall: null });

    const dashboard = await getDashboard(app, agent.id);
    expect(dashboard.trend).toHaveLength(1);
    expect(dashboard.trend[0]).toMatchObject({ recall: control!.recall });

    const list = await listSuiteRuns(app, agent.id);
    const staleInList = list.runs.find((r) => r.id === stale!.id);
    expect(staleInList).toMatchObject({ status: 'failed' });

    const compare = await app.inject({
      method: 'GET',
      url: `/agents/${agent.id}/eval-runs/compare?a=${stale!.id}&b=${stale!.id}`,
    });
    expect(compare.statusCode).toBe(404);
  });

  it('AC-25 — starts are rate-limited to 10 per minute per workspace', async () => {
    const isolatedApp = await buildApp({
      config: loadConfig({
        ...process.env,
        NODE_ENV: 'production',
        LOG_LEVEL: 'silent',
      } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { llm: { openrouter: provider } },
    });
    try {
      const agent = await createAgent(isolatedApp, 'AC-25 agent');

      for (let i = 0; i < 10; i += 1) {
        const start = await isolatedApp.inject({
          method: 'POST',
          url: `/agents/${agent.id}/eval-runs/start`,
        });
        expect(start.statusCode).toBe(202);
        const started = start.json() as SuiteRunRecord;
        await waitForSuiteRunTerminal(isolatedApp, started.id);
      }

      const eleventh = await isolatedApp.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-runs/start`,
      });
      expect(eleventh.statusCode).toBe(429);
    } finally {
      await isolatedApp.close();
    }
  });

  it('AC-26 — a single-case run carries a null suite id and feeds no aggregate', async () => {
    const agent = await createAgent(app, 'AC-26 agent');
    const kase = await createCase(app, agent.id, 'standalone case', [mustFindExpectation()]);
    provider.registerReview(kase.id, makeReview([makeFinding()]));

    const before = await getDashboard(app, agent.id);
    expect(before.trend).toHaveLength(0);

    const run = await app.inject({ method: 'POST', url: `/eval-cases/${kase.id}/run` });
    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({ case_id: kase.id });

    const [persisted] = await pg.handle.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.caseId, kase.id));
    expect(persisted).toMatchObject({ suiteRunId: null });

    const after = await getDashboard(app, agent.id);
    expect(after.trend).toHaveLength(0);

    const list = await listSuiteRuns(app, agent.id);
    expect(list.runs).toHaveLength(0);
  });

  it('AC-43 — the trend series is oldest→newest and capped at 30 completed runs', async () => {
    const agent = await createAgent(app, 'AC-43 agent');
    const base = Date.now() - 35 * 60_000;

    for (let i = 0; i < 35; i += 1) {
      await pg.handle.db.insert(t.evalSuiteRuns).values({
        workspaceId,
        agentId: agent.id,
        agentVersion: agent.version,
        status: 'done',
        startedAt: new Date(base + i * 60_000),
        finishedAt: new Date(base + i * 60_000 + 1000),
        casesTotal: 1,
        casesPassed: 1,
        recall: i,
        precision: 1,
        citationAccuracy: 1,
        costUsd: 0.01,
        durationMs: 100,
      });
    }

    const dashboard = await getDashboard(app, agent.id);
    expect(dashboard.trend).toHaveLength(30);
    expect(dashboard.trend[0]).toMatchObject({ recall: 5 });
    expect(dashboard.trend[29]).toMatchObject({ recall: 34 });
    for (let i = 0; i < dashboard.trend.length - 1; i += 1) {
      expect(dashboard.trend[i]!.recall).toBeLessThan(dashboard.trend[i + 1]!.recall as number);
    }
  });

  it('AC-57 — the grounding gate applies before anything is persisted or scored', async () => {
    const agent = await createAgent(app, 'AC-57 agent');
    const kase = await createCase(app, agent.id, 'grounding case', [mustFindExpectation(GROUNDED_LINE)]);
    const groundedFinding = makeFinding({ title: 'Grounded SSRF citation' });
    const ungroundedFinding = makeFinding({
      title: 'Ungrounded phantom citation',
      start_line: UNGROUNDED_LINE,
      end_line: UNGROUNDED_LINE,
    });
    provider.registerReview(kase.id, makeReview([groundedFinding, ungroundedFinding]));

    const run = await app.inject({ method: 'POST', url: `/eval-cases/${kase.id}/run` });
    expect(run.statusCode).toBe(200);
    const body = run.json() as { result: { recall: number | null; per_trace: { actual: { findings: Finding[] } }[] } };
    expect(body.result.recall).toBe(1);
    expect(body.result.per_trace[0]!.actual.findings).toHaveLength(1);
    expect(body.result.per_trace[0]!.actual.findings[0]!.title).toBe('Grounded SSRF citation');

    const [persisted] = await pg.handle.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.caseId, kase.id));
    const persistedOutput = persisted!.actualOutput as { findings: Finding[] };
    expect(persistedOutput.findings).toHaveLength(1);
    expect(persistedOutput.findings[0]!.title).toBe('Grounded SSRF citation');
  });

  it('AC-59 / AC-60 / AC-61 — cancel stops after the case in flight, keeps written rows, unblocks the next start, and excludes the cancelled run from trend, delta and comparison', async () => {
    const agent = await createAgent(app, 'AC-59-60-61 agent');
    const cases = await Promise.all([
      createCase(app, agent.id, 'cancel case 0', [mustFindExpectation()]),
      createCase(app, agent.id, 'cancel case 1', [mustFindExpectation()]),
      createCase(app, agent.id, 'cancel case 2', [mustFindExpectation()]),
    ]);
    for (const kase of cases) {
      provider.registerDelayedReview(kase.id, 600, makeReview([makeFinding()]));
    }

    const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs/start` });
    expect(start.statusCode).toBe(202);
    const started = start.json() as SuiteRunRecord;

    await waitUntil(() => getSuiteRun(app, started.id), (body) => body.runs.length >= 1, {
      timeoutMs: 5000,
    });
    const cancel = await app.inject({ method: 'POST', url: `/eval-suite-runs/${started.id}/cancel` });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ ok: true });

    const cancelledImmediately = await getSuiteRun(app, started.id);
    expect(cancelledImmediately.suite_run).toMatchObject({ status: 'cancelled' });

    const finished = await waitUntil(
      () => getSuiteRun(app, started.id),
      (body) => body.runs.length >= 2,
      { timeoutMs: 5000 },
    );
    expect(finished.suite_run).toMatchObject({ status: 'cancelled' });
    expect(finished.runs).toHaveLength(2);
    const executedCaseIds = new Set(finished.runs.map((r) => r.case_id));
    const allCaseIds = cases.map((c) => c.id);
    expect([...executedCaseIds].every((id) => allCaseIds.includes(id))).toBe(true);
    const skippedCaseId = allCaseIds.find((id) => !executedCaseIds.has(id));
    expect(skippedCaseId).toBeDefined();
    expect(provider.calls).not.toContain(skippedCaseId);

    const secondStart = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs/start` });
    expect(secondStart.statusCode).toBe(202);
    const secondStarted = secondStart.json() as SuiteRunRecord;
    const secondCancel = await app.inject({
      method: 'POST',
      url: `/eval-suite-runs/${secondStarted.id}/cancel`,
    });
    expect(secondCancel.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 700));

    const dashboard = await getDashboard(app, agent.id);
    expect(dashboard.trend).toHaveLength(0);
    expect(dashboard.delta).toMatchObject({ recall: null, precision: null, citation_accuracy: null });

    const compare = await app.inject({
      method: 'GET',
      url: `/agents/${agent.id}/eval-runs/compare?a=${started.id}&b=${started.id}`,
    });
    expect(compare.statusCode).toBe(404);
  });

  it('AC-13 — a case carrying an empty expectation list passes when the agent reports no findings', async () => {
    const agent = await createAgent(app, 'AC-13 agent');
    const silentCase = await createCase(app, agent.id, 'asserts silence', []);
    provider.registerReview(silentCase.id, makeReview([]));

    const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs/start` });
    expect(start.statusCode).toBe(202);
    const started = start.json() as SuiteRunRecord;
    const finished = await waitForSuiteRunTerminal(app, started.id);

    expect(finished.suite_run).toMatchObject({
      status: 'done',
      cases_total: 1,
      cases_passed: 1,
      recall: null,
      precision: null,
    });
    expect(finished.runs).toHaveLength(1);
    expect(finished.runs[0]).toMatchObject({ case_id: silentCase.id, pass: true, recall: null });
  });
});
