import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[eval] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const NO_FINDINGS_REVIEW: Review = {
  verdict: 'approve',
  summary: 'No issues found.',
  score: 95,
  findings: [],
};

interface SuiteRunStatusBody {
  suite_run: { id: string; status: string };
}

async function waitForSuiteRunTerminal(
  app: FastifyInstance,
  suiteRunId: string,
): Promise<SuiteRunStatusBody> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await app.inject({ method: 'GET', url: `/eval-suite-runs/${suiteRunId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SuiteRunStatusBody;
    if (body.suite_run.status !== 'running') return body;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`eval suite run ${suiteRunId} did not leave "running" within 20s`);
}

d('eval case lifecycle (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-10, AC-18)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let agentId: string;
  let acceptedFindingId: string;
  let dismissedFindingId: string;
  let undecidedFindingId: string;

  beforeAll(async () => {
    pg = await startPg();
    const { db } = pg.handle;
    await seed(db);

    app = await buildApp({
      config: config(),
      db,
      overrides: { llm: { openai: new MockLLMProvider('openai', { structured: NO_FINDINGS_REVIEW }) } },
    });

    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    workspaceId = ws!.id;

    const createdAgent = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Eval Lifecycle Test Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(createdAgent.statusCode).toBe(201);
    agentId = createdAgent.json().id as string;

    const [pr482] = await db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));
    const prId = pr482!.id;

    const [ownedReview] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'eval.it.test.ts fixture review',
        score: 50,
        model: 'test',
      })
      .returning();
    const reviewId = ownedReview!.id;

    const [accepted, dismissed, undecided] = await db
      .insert(t.findings)
      .values([
        {
          reviewId,
          file: 'src/api/public/webhooks.ts',
          startLine: 3,
          endLine: 3,
          severity: 'CRITICAL',
          category: 'security',
          title: 'Unvalidated webhook signature check',
          rationale: 'eval.it.test.ts fixture finding — accepted.',
          suggestion: 'n/a',
          confidence: 0.9,
          acceptedAt: new Date(),
        },
        {
          reviewId,
          file: 'src/api/public/webhooks.ts',
          startLine: 5,
          endLine: 5,
          severity: 'WARNING',
          category: 'perf',
          title: 'Synchronous webhook fan-out',
          rationale: 'eval.it.test.ts fixture finding — dismissed.',
          suggestion: 'n/a',
          confidence: 0.6,
          dismissedAt: new Date(),
        },
        {
          reviewId,
          file: 'src/api/public/webhooks.ts',
          startLine: 7,
          endLine: 7,
          severity: 'WARNING',
          category: 'maintainability',
          title: 'Undecided webhook finding',
          rationale: 'eval.it.test.ts fixture finding — neither accepted nor dismissed.',
          suggestion: 'n/a',
          confidence: 0.5,
        },
      ])
      .returning();

    acceptedFindingId = accepted!.id;
    dismissedFindingId = dismissed!.id;
    undecidedFindingId = undecided!.id;
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('an accepted finding becomes a case carrying exactly one must_find expectation (AC-1)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/findings/${acceptedFindingId}/eval-case`,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.created).toBe(true);
    expect(body.case).toMatchObject({
      source_finding_id: acceptedFindingId,
      expected_output: [
        {
          kind: 'must_find',
          file: 'src/api/public/webhooks.ts',
          line: 3,
          end_line: 3,
          category: 'security',
        },
      ],
    });
    expect(body.case.expected_output).toHaveLength(1);
  });

  it('a dismissed finding becomes a case carrying exactly one must_not_flag expectation (AC-2)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/findings/${dismissedFindingId}/eval-case`,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.created).toBe(true);
    expect(body.case).toMatchObject({
      source_finding_id: dismissedFindingId,
      expected_output: [
        {
          kind: 'must_not_flag',
          file: 'src/api/public/webhooks.ts',
          line: 5,
          end_line: 5,
          category: 'perf',
        },
      ],
    });
    expect(body.case.expected_output).toHaveLength(1);
  });

  it('an undecided finding is refused with 400 and persists no case (AC-3)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/findings/${undecidedFindingId}/eval-case`,
    });
    expect(res.statusCode).toBe(400);

    const rows = await pg.handle.db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(eq(t.evalCases.sourceFindingId, undecidedFindingId));
    expect(rows).toHaveLength(0);
  });

  it('the created case stores a non-empty snapshot of the cited file diff and its source finding id (AC-4, AC-5)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentId}/eval-cases`,
    });
    expect(res.statusCode).toBe(200);
    const { cases } = res.json() as { cases: Array<Record<string, unknown>> };
    const fromAccepted = cases.find((c) => c.source_finding_id === acceptedFindingId);
    expect(fromAccepted).toBeDefined();
    expect(typeof fromAccepted!.input_diff).toBe('string');
    expect((fromAccepted!.input_diff as string).length).toBeGreaterThan(0);
    expect(fromAccepted!.input_diff as string).toContain('diff --git');
    expect(fromAccepted!.source_finding_id).toBe(acceptedFindingId);
  });

  it('a second create for the same finding returns the existing case unchanged, not a duplicate (AC-6)', async () => {
    const before = await app.inject({
      method: 'GET',
      url: `/agents/${agentId}/eval-cases`,
    });
    const casesBefore = (before.json() as { cases: unknown[] }).cases.length;

    const first = await app.inject({
      method: 'POST',
      url: `/findings/${acceptedFindingId}/eval-case`,
    });
    const firstCaseId = first.json().case.id as string;

    const second = await app.inject({
      method: 'POST',
      url: `/findings/${acceptedFindingId}/eval-case`,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();
    expect(secondBody.created).toBe(false);
    expect(secondBody.case.id).toBe(firstCaseId);

    const after = await app.inject({
      method: 'GET',
      url: `/agents/${agentId}/eval-cases`,
    });
    const casesAfter = (after.json() as { cases: unknown[] }).cases.length;
    expect(casesAfter).toBe(casesBefore);
  });

  it('an invalid expected output is refused with 400 naming the failing index and field, persisting nothing (AC-10)', async () => {
    const before = await app.inject({
      method: 'GET',
      url: `/agents/${agentId}/eval-cases`,
    });
    const casesBefore = (before.json() as { cases: unknown[] }).cases.length;

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-cases`,
      payload: {
        name: 'Invalid expectation case',
        input_diff: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n',
        expected_output: [
          { kind: 'must_find', file: 'src/x.ts', category: 'security' },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.message).toContain('expected_output.0.line');
    const issue = body.error.details.issues[0];
    expect(issue.path).toEqual(['expected_output', 0, 'line']);

    const after = await app.inject({
      method: 'GET',
      url: `/agents/${agentId}/eval-cases`,
    });
    const casesAfter = (after.json() as { cases: unknown[] }).cases.length;
    expect(casesAfter).toBe(casesBefore);

    const named = await pg.handle.db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(eq(t.evalCases.name, 'Invalid expectation case'));
    expect(named).toHaveLength(0);
  });

  it('a case or run belonging to another workspace answers 404 on both read and write (AC-18)', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'eval-it-other-ws' }).returning();
    const otherWorkspaceId = otherWs!.id;

    const [otherAgent] = await db
      .insert(t.agents)
      .values({
        workspaceId: otherWorkspaceId,
        name: 'Foreign Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'x',
      })
      .returning();

    const [foreignCase] = await db
      .insert(t.evalCases)
      .values({
        workspaceId: otherWorkspaceId,
        ownerKind: 'agent',
        ownerId: otherAgent!.id,
        name: 'Foreign workspace case',
        inputDiff: 'diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n',
        expectedOutput: [],
      })
      .returning();
    const foreignCaseId = foreignCase!.id;

    const [foreignRun] = await db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId: otherWorkspaceId,
        agentId: otherAgent!.id,
        agentVersion: 1,
        status: 'running',
        casesTotal: 0,
      })
      .returning();
    const foreignRunId = foreignRun!.id;

    const caseRead = await app.inject({ method: 'GET', url: `/eval-cases/${foreignCaseId}` });
    expect(caseRead.statusCode).toBe(404);

    const caseWrite = await app.inject({
      method: 'PATCH',
      url: `/eval-cases/${foreignCaseId}`,
      payload: { name: 'hijacked' },
    });
    expect(caseWrite.statusCode).toBe(404);

    const runRead = await app.inject({ method: 'GET', url: `/eval-suite-runs/${foreignRunId}` });
    expect(runRead.statusCode).toBe(404);

    const runWrite = await app.inject({
      method: 'POST',
      url: `/eval-suite-runs/${foreignRunId}/cancel`,
    });
    expect(runWrite.statusCode).toBe(404);

    const stillForeign = await db
      .select({ id: t.evalCases.id, name: t.evalCases.name })
      .from(t.evalCases)
      .where(eq(t.evalCases.id, foreignCaseId));
    expect(stillForeign[0]?.name).toBe('Foreign workspace case');
  });

  it('cancelling a suite run that already reached a terminal state answers 200 with ok:false, not a 404', async () => {
    const createdAgent = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Eval Cancel-Terminal Test Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(createdAgent.statusCode).toBe(201);
    const cancelAgentId = createdAgent.json().id as string;

    const createdCase = await app.inject({
      method: 'POST',
      url: `/agents/${cancelAgentId}/eval-cases`,
      payload: {
        name: 'Cancel-terminal case',
        input_diff: 'diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n',
        expected_output: [],
      },
    });
    expect(createdCase.statusCode).toBe(201);

    const started = await app.inject({
      method: 'POST',
      url: `/agents/${cancelAgentId}/eval-runs/start`,
    });
    expect(started.statusCode).toBe(202);
    const suiteRunId = started.json().id as string;

    const finished = await waitForSuiteRunTerminal(app, suiteRunId);
    expect(finished.suite_run.status).toBe('done');

    const res = await app.inject({
      method: 'POST',
      url: `/eval-suite-runs/${suiteRunId}/cancel`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: false });
  });
  it('a case created from a finding still runs to completion after its source pull request is deleted (AC-4)', async () => {
    const { db } = pg.handle;

    const [pr] = await db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));
    const prId = pr!.id;

    await db.insert(t.prFiles).values({
      prId,
      path: 'src/api/public/durable.ts',
      additions: 1,
      deletions: 1,
      patch: '@@ -1,3 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = untrusted(input);\n',
    });

    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'eval.it.test.ts durability fixture review',
        score: 40,
        model: 'test',
      })
      .returning();

    const [durableFinding] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/api/public/durable.ts',
        startLine: 2,
        endLine: 2,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Untrusted input reaches the handler',
        rationale: 'eval.it.test.ts durability fixture finding — accepted.',
        suggestion: 'n/a',
        confidence: 0.9,
        acceptedAt: new Date(),
      })
      .returning();

    const create = await app.inject({
      method: 'POST',
      url: `/findings/${durableFinding!.id}/eval-case`,
    });
    expect(create.statusCode).toBe(201);
    const caseId = create.json().case.id as string;
    const snapshot = create.json().case.input_diff as string;
    expect(snapshot).toContain('src/api/public/durable.ts');

    await db.delete(t.pullRequests).where(eq(t.pullRequests.id, prId));

    const gone = await db
      .select({ id: t.findings.id })
      .from(t.findings)
      .where(eq(t.findings.id, durableFinding!.id));
    expect(gone).toHaveLength(0);

    const stillThere = await app.inject({ method: 'GET', url: `/eval-cases/${caseId}` });
    expect(stillThere.statusCode).toBe(200);
    expect(stillThere.json()).toMatchObject({ id: caseId, input_diff: snapshot });

    const run = await app.inject({ method: 'POST', url: `/eval-cases/${caseId}/run` });
    expect(run.statusCode).toBe(200);

    const [persistedRun] = await pg.handle.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.caseId, caseId));
    expect(persistedRun).toMatchObject({ caseId, suiteRunId: null });
    expect(persistedRun!.actualOutput).not.toBeNull();
  });
});
