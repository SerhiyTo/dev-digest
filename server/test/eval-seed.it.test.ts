import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, DEMO_RUN_AGENT_NAME } from '../src/db/seed.js';
import { EvalExpectation } from '../src/vendor/shared/contracts/knowledge.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[eval-seed] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const evalExpectationArray = z.array(EvalExpectation);

d('eval seed — Security Reviewer case set, scoped to its own owner (AC-50, AC-63, AC-64)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  async function securityReviewerAgent() {
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, ws!.id), eq(t.agents.name, DEMO_RUN_AGENT_NAME)));
    return { workspaceId: ws!.id, agent: agent! };
  }

  async function ownedCaseRows(agentId: string) {
    return pg.handle.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)));
  }

  it('plants at least 8 eval cases on the seeded Security Reviewer agent, each with a non-empty diff and an AC-9-valid expectation list (AC-63)', async () => {
    const { agent } = await securityReviewerAgent();
    const rows = await ownedCaseRows(agent.id);

    expect(rows.length).toBeGreaterThanOrEqual(8);

    for (const row of rows) {
      expect(row.inputDiff ?? '').not.toBe('');
      const parsed = evalExpectationArray.safeParse(row.expectedOutput);
      expect(parsed.success).toBe(true);
    }
  });

  it('serves the seeded set through the agent eval-cases list endpoint in a prepared environment (AC-50)', async () => {
    const { agent } = await securityReviewerAgent();
    const app = await buildApp({ config: config(), db: pg.handle.db });
    try {
      const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { cases: Array<{ owner_kind: string; owner_id: string; input_diff: string }> };
      expect(body.cases.length).toBeGreaterThanOrEqual(8);
      for (const c of body.cases) {
        expect(c).toMatchObject({ owner_kind: 'agent', owner_id: agent.id });
        expect(c.input_diff.length).toBeGreaterThan(0);
      }
    } finally {
      await app.close();
    }
  });

  it('does not multiply the Security Reviewer eval cases when the seed runs a second time (AC-64)', async () => {
    const { agent } = await securityReviewerAgent();
    const before = await ownedCaseRows(agent.id);
    expect(before.length).toBeGreaterThanOrEqual(8);

    await seed(pg.handle.db);

    const after = await ownedCaseRows(agent.id);
    expect(after.length).toBe(before.length);
  });
});
