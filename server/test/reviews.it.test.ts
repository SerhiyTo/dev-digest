import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

const SKILL_BODY = '# Test coverage rubric\nList every branch added by the diff that no test exercises.';

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    await waitForRunTrace(pg.handle.db, runId);
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');

    // cost propagates: mock LLM returns costUsd per call → agent_runs, trace
    // stats, and the timeline RunSummary all carry the same non-null value.
    expect(run!.costUsd).toBeGreaterThan(0);
    expect(trace.stats.cost_usd).toBe(run!.costUsd);
    const timeline = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(timeline[0].cost_usd).toBe(run!.costUsd);

    await app.close();
  });

  it('a linked enabled skill lands in the persisted trace; the same skill disabled leaves no Skills block', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'test-coverage-rubric-it',
          description: 'Flags uncovered branches.',
          type: 'rubric',
          body: SKILL_BODY,
          source: 'manual',
        },
      })
    ).json();
    expect(skill.enabled).toBe(true);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SkillAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const links = (
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [skill.id] },
      })
    ).json();
    expect(links).toHaveLength(1);

    const enabledRun = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentId: agent.id },
      })
    ).json();
    const enabledRunId = enabledRun.runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await waitForRunTrace(pg.handle.db, enabledRunId);
    const enabledTrace = (
      await app.inject({ method: 'GET', url: `/runs/${enabledRunId}/trace` })
    ).json();
    expect(enabledTrace.prompt_assembly.skills).toContain('### test-coverage-rubric-it');
    expect(enabledTrace.prompt_assembly.skills).toContain(SKILL_BODY);
    expect(enabledTrace.prompt_assembly.user).toContain('## Skills / rules');

    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } });

    const disabledRun = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentId: agent.id },
      })
    ).json();
    const disabledRunId = disabledRun.runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    await waitForRunTrace(pg.handle.db, disabledRunId);
    const disabledTrace = (
      await app.inject({ method: 'GET', url: `/runs/${disabledRunId}/trace` })
    ).json();

    const [disabledRunRow] = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, disabledRunId));
    expect(disabledRunRow!.status).toBe('done');
    expect(disabledTrace.prompt_assembly.user).toContain('## Diff to review');
    expect(disabledTrace.prompt_assembly.user).toContain(`Review pull request #${pr.number}`);

    expect(disabledTrace.prompt_assembly.skills).toBeNull();
    expect(disabledTrace.prompt_assembly.user).not.toContain('## Skills / rules');
    expect(disabledTrace.prompt_assembly.user).not.toContain(SKILL_BODY);

    await app.close();
  });

  it('PR list aggregates cost: SUM of non-null run costs, null when no run has cost', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    // PR A: two priced runs + one failed (null cost); PR B: only a null-cost run.
    const { repo, pr: prA } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [prB] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 483,
        title: 'No-cost PR',
        author: 'deepak.r',
        branch: 'chore/x',
        base: 'main',
        headSha: 'e5f6a7b8',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.agentRuns).values([
      { workspaceId, prId: prA.id, status: 'done', costUsd: 0.01 },
      { workspaceId, prId: prA.id, status: 'done', costUsd: 0.004 },
      { workspaceId, prId: prA.id, status: 'failed', costUsd: null },
      { workspaceId, prId: prB!.id, status: 'failed', costUsd: null },
    ]);

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const a = pulls.find((p: { number: number }) => p.number === prA.number);
    const b = pulls.find((p: { number: number }) => p.number === prB!.number);
    expect(a.cost_usd).toBeCloseTo(0.014, 10);
    // never $0.00 from missing data — all-null sums stay null
    expect(b.cost_usd).toBeNull();

    await app.close();
  });

  it('PR list aggregates findings_by_severity: active findings only, null when unreviewed', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr: reviewed } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [unreviewed] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 484,
        title: 'Never reviewed',
        author: 'tomek.w',
        branch: 'chore/y',
        base: 'main',
        headSha: 'c9d8e7f6',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SevAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${reviewed.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, reviewed.id, { expected: 1 });

    const listPulls = async () =>
      (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();

    const before = await listPulls();
    const r = before.find((p: { number: number }) => p.number === reviewed.number);
    const u = before.find((p: { number: number }) => p.number === unreviewed!.number);
    expect(r.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
    expect(u.findings_by_severity).toBeNull();

    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${reviewed.id}/reviews` })
    ).json();
    await app.inject({ method: 'POST', url: `/findings/${reviews[0].findings[0].id}/dismiss` });

    const after = await listPulls();
    const r2 = after.find((p: { number: number }) => p.number === reviewed.number);
    expect(r2.findings_by_severity).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});
