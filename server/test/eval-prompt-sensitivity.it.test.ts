import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, DEMO_RUN_AGENT_NAME } from '../src/db/seed.js';
import { SECURITY_REVIEWER_PROMPT, SECURITY_REVIEWER_SSRF_LINE } from '../src/db/seed-prompts.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-prompt-sensitivity] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SSRF_FINDING = {
  id: 'ssrf-1',
  severity: 'CRITICAL' as const,
  category: 'security' as const,
  title: 'Server-Side Request Forgery via merchant callback URL',
  file: 'src/gateway/webhookRelay.ts',
  start_line: 12,
  end_line: 12,
  rationale:
    'The callback URL comes straight from the request body and is fetched with no validation, allowing an attacker to reach internal services.',
  suggestion: 'Validate the callback URL against an allowlist of merchant domains before fetching it.',
  confidence: 0.92,
  kind: 'finding' as const,
};

const REVIEW_WITH_SSRF: Review = {
  verdict: 'request_changes',
  summary: 'Found one CRITICAL SSRF issue in the merchant callback relay.',
  score: 35,
  findings: [SSRF_FINDING],
};

const REVIEW_WITHOUT_SSRF: Review = {
  verdict: 'approve',
  summary: 'No issues found in the diff.',
  score: 95,
  findings: [],
};

interface SuiteRunRecord {
  id: string;
  status: string;
  agent_version: number;
  recall: number | null;
  precision: number | null;
}

interface SuiteRunBody {
  suite_run: SuiteRunRecord;
  runs: unknown[];
}

async function waitForSuiteRunDone(app: FastifyInstance, suiteRunId: string): Promise<SuiteRunBody> {
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

type SeededAgentRow = typeof t.agents.$inferSelect;

async function snapshotInitialVersionTheSeedNeverWrote(
  db: PgFixture['handle']['db'],
  agent: SeededAgentRow,
): Promise<void> {
  await db
    .insert(t.agentVersions)
    .values({
      agentId: agent.id,
      version: agent.version,
      configJson: {
        provider: agent.provider,
        model: agent.model,
        system_prompt: agent.systemPrompt,
        output_schema: agent.outputSchema,
        strategy: agent.strategy,
        ci_fail_on: agent.ciFailOn,
        repo_intel: agent.repoIntel,
        skills: [],
      },
    })
    .onConflictDoNothing();
}

d('AC-49 / AC-65 — a prompt change moves recall or precision (mock LLM)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;
  let originalSystemPrompt: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, DEMO_RUN_AGENT_NAME)));
    agentId = agent!.id;
    originalSystemPrompt = agent!.systemPrompt;
    await snapshotInitialVersionTheSeedNeverWrote(pg.handle.db, agent!);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: Review): Promise<FastifyInstance> {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: new MockLLMProvider('openai', { structured }) } },
    });
  }

  it('removing the named SSRF prompt line changes recall or precision across two suite runs over the same unchanged case set', async () => {
    expect(originalSystemPrompt).toContain(SECURITY_REVIEWER_SSRF_LINE);
    expect(originalSystemPrompt).toBe(SECURITY_REVIEWER_PROMPT);

    const app1 = await appWith(REVIEW_WITH_SSRF);
    const start1 = await app1.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs/start` });
    expect(start1.statusCode).toBe(202);
    const started1 = start1.json() as SuiteRunRecord;

    const finished1 = await waitForSuiteRunDone(app1, started1.id);
    expect(finished1.suite_run).toMatchObject({ id: started1.id, status: 'done', agent_version: 1 });
    await app1.close();

    const withoutSsrfLine = SECURITY_REVIEWER_PROMPT.split('\n')
      .filter((line) => line !== SECURITY_REVIEWER_SSRF_LINE)
      .join('\n');
    expect(withoutSsrfLine).not.toContain(SECURITY_REVIEWER_SSRF_LINE);
    expect(withoutSsrfLine.length).toBeLessThan(SECURITY_REVIEWER_PROMPT.length);

    const app2 = await appWith(REVIEW_WITHOUT_SSRF);
    const updated = await app2.inject({
      method: 'PUT',
      url: `/agents/${agentId}`,
      payload: { system_prompt: withoutSsrfLine },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ version: 2 });

    const start2 = await app2.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs/start` });
    expect(start2.statusCode).toBe(202);
    const started2 = start2.json() as SuiteRunRecord;

    const finished2 = await waitForSuiteRunDone(app2, started2.id);
    expect(finished2.suite_run).toMatchObject({ id: started2.id, status: 'done', agent_version: 2 });
    await app2.close();

    expect(started1.agent_version).not.toBe(started2.agent_version);
    expect(finished1.suite_run.agent_version).not.toBe(finished2.suite_run.agent_version);

    const run1 = finished1.suite_run;
    const run2 = finished2.suite_run;
    const recallChanged = run1.recall !== run2.recall;
    const precisionChanged = run1.precision !== run2.precision;
    expect(recallChanged || precisionChanged).toBe(true);
    expect(run1).toMatchObject({ recall: 0.2, precision: 1 });
    expect(run2).toMatchObject({ recall: 0, precision: null });
  });
});
