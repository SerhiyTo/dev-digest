import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[eval-agent-delete] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const CASE_DIFF = [
  'diff --git a/src/webhook.ts b/src/webhook.ts',
  '--- a/src/webhook.ts',
  '+++ b/src/webhook.ts',
  '@@ -1,1 +1,1 @@',
  '+const url = req.body.callback;',
].join('\n');

const NO_FINDINGS_REVIEW: Review = {
  verdict: 'approve',
  summary: 'No issues found.',
  score: 95,
  findings: [],
};

interface SuiteRunRecord {
  id: string;
  status: string;
}

interface SuiteRunBody {
  suite_run: SuiteRunRecord;
  runs: unknown[];
}

async function waitForSuiteRunDone(
  app: FastifyInstance,
  suiteRunId: string,
): Promise<SuiteRunBody> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await app.inject({ method: 'GET', url: `/eval-suite-runs/${suiteRunId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SuiteRunBody;
    if (body.suite_run.status !== 'running') return body;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`eval suite run ${suiteRunId} did not leave "running" within 20s`);
}

function evalCaseBody(name: string) {
  return {
    name,
    input_diff: CASE_DIFF,
    expected_output: [],
  };
}

d('DELETE /agents/:id cascades to eval cases and their runs, leaving another workspace untouched (AC-17)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(): Promise<FastifyInstance> {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        llm: { openai: new MockLLMProvider('openai', { structured: NO_FINDINGS_REVIEW }) },
      },
    });
  }

  it('deletes the agent, its own workspace eval cases and their run rows, but leaves another workspace untouched', async () => {
    const { db } = pg.handle;
    const app = await makeApp();

    const [otherWs] = await db
      .insert(t.workspaces)
      .values({ name: 'eval-delete-other-workspace' })
      .returning();
    const [foreignAgent] = await db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign Reviewer',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'x',
      })
      .returning();
    const [foreignCase] = await db
      .insert(t.evalCases)
      .values({
        workspaceId: otherWs!.id,
        ownerKind: 'agent',
        ownerId: foreignAgent!.id,
        name: 'foreign survivor case',
        inputDiff: CASE_DIFF,
        expectedOutput: [],
      })
      .returning();

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Delete Me Reviewer',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agentId = created.json().id as string;

    const case1 = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-cases`,
      payload: evalCaseBody('case one'),
    });
    expect(case1.statusCode).toBe(201);
    const case2 = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-cases`,
      payload: evalCaseBody('case two'),
    });
    expect(case2.statusCode).toBe(201);
    const caseIds = [case1.json().id as string, case2.json().id as string];

    const started = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-runs/start`,
    });
    expect(started.statusCode).toBe(202);
    const suiteRunId = (started.json() as SuiteRunRecord).id;

    const finished = await waitForSuiteRunDone(app, suiteRunId);
    expect(finished.suite_run).toMatchObject({ id: suiteRunId, status: 'done' });

    const runsBeforeDelete = await db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.suiteRunId, suiteRunId));
    expect(runsBeforeDelete).toHaveLength(caseIds.length);
    expect(runsBeforeDelete.map((r) => r.caseId).sort()).toEqual([...caseIds].sort());

    const deleted = await app.inject({ method: 'DELETE', url: `/agents/${agentId}` });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ ok: true });

    const remainingCases = await db
      .select()
      .from(t.evalCases)
      .where(eq(t.evalCases.ownerId, agentId));
    expect(remainingCases).toHaveLength(0);

    const remainingSuiteRuns = await db
      .select()
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.id, suiteRunId));
    expect(remainingSuiteRuns).toHaveLength(0);

    const remainingRuns = await db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.suiteRunId, suiteRunId));
    expect(remainingRuns).toHaveLength(0);

    const survivorCase = await db
      .select()
      .from(t.evalCases)
      .where(eq(t.evalCases.id, foreignCase!.id));
    expect(survivorCase).toHaveLength(1);
    expect(survivorCase[0]).toMatchObject({
      id: foreignCase!.id,
      workspaceId: otherWs!.id,
      ownerId: foreignAgent!.id,
    });

    const survivorAgent = await db
      .select()
      .from(t.agents)
      .where(eq(t.agents.id, foreignAgent!.id));
    expect(survivorAgent).toHaveLength(1);

    await app.close();
  });
});
