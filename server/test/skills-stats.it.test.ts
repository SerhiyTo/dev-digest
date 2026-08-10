import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockAuthProvider, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-stats] Docker not available — skipping integration tests.');
}

/**
 * `GET /skills/:id/stats` over a real Postgres. Every test gets its own
 * workspace (via a MockAuthProvider override) so `pull_frequency`'s
 * workspace-wide denominator can't be polluted by another test's runs.
 *
 * The point of this suite is the null-vs-0 distinction on the two ratios:
 * `null` means "nothing to measure", `0` means "measured, and it's zero".
 */
d('skill stats', () => {
  let pg: PgFixture;
  let systemUserId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [user] = await pg.handle.db.select().from(t.users).limit(1);
    systemUserId = user!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  let wsSeq = 0;
  async function makeApp() {
    const { db } = pg.handle;
    const [ws] = await db
      .insert(t.workspaces)
      .values({ name: `stats-ws-${wsSeq++}` })
      .returning();
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db,
      overrides: {
        // `createdBy` on agents/skills FKs into `users`, so the mocked user
        // must be the real seeded one, not the provider's placeholder `u1`.
        auth: new MockAuthProvider(
          { id: systemUserId, email: 'you@local', name: 'You' },
          { id: ws!.id, name: ws!.name },
        ),
        git: new MockGitClient(),
        github: new MockGitHubClient(),
      },
    });
    return { app, workspaceId: ws!.id };
  }

  const createBody = {
    name: 'Test Quality',
    type: 'rubric' as const,
    body: 'Flag any new branch without a test.\n',
  };

  async function createSkill(
    app: Awaited<ReturnType<typeof makeApp>>['app'],
    overrides: Record<string, unknown> = {},
  ) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>['app'], name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review the diff.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function linkSkills(
    app: Awaited<ReturnType<typeof makeApp>>['app'],
    agentId: string,
    skillIds: string[],
  ) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: skillIds },
    });
    expect(res.statusCode).toBe(200);
  }

  async function getStats(app: Awaited<ReturnType<typeof makeApp>>['app'], skillId: string) {
    const res = await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  let repoSeq = 0;
  async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
    const name = `stats-repo-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Stats fixture PR',
        author: 'fixture',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  function insertRun(
    db: PgFixture['handle']['db'],
    values: Partial<typeof t.agentRuns.$inferInsert> &
      Pick<typeof t.agentRuns.$inferInsert, 'workspaceId'>,
  ) {
    return db
      .insert(t.agentRuns)
      .values({ status: 'done', ...values })
      .returning()
      .then((rows) => rows[0]!);
  }

  function insertReview(
    db: PgFixture['handle']['db'],
    values: Partial<typeof t.reviews.$inferInsert> &
      Pick<typeof t.reviews.$inferInsert, 'workspaceId' | 'prId'>,
  ) {
    return db
      .insert(t.reviews)
      .values({ kind: 'review', ...values })
      .returning()
      .then((rows) => rows[0]!);
  }

  function insertFinding(
    db: PgFixture['handle']['db'],
    values: Partial<typeof t.findings.$inferInsert> &
      Pick<typeof t.findings.$inferInsert, 'reviewId'>,
  ) {
    return db
      .insert(t.findings)
      .values({
        file: 'src/x.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'bug',
        title: 'Fixture finding',
        rationale: 'because fixtures',
        confidence: 0.5,
        ...values,
      })
      .returning()
      .then((rows) => rows[0]!);
  }

  it('a skill with no links: used_by 0, agents [], findings_30d 0, empty category map, null ratios', async () => {
    const { app } = await makeApp();
    const skill = await createSkill(app);

    const stats = await getStats(app, skill.id);
    expect(stats.used_by).toBe(0);
    expect(stats.agents).toEqual([]);
    expect(stats.findings_30d).toBe(0);
    expect(stats.findings_by_category).toEqual({});
    expect(stats.pull_frequency).toBeNull();
    expect(stats.accept_rate).toBeNull();
    await app.close();
  });

  it('pull_frequency is 0, not null, when the workspace has runs but the linked agent never ran', async () => {
    const { app, workspaceId } = await makeApp();
    const { db } = pg.handle;
    const skill = await createSkill(app, { name: 'Never Pulled' });
    const idleAgent = await createAgent(app, 'Idle Agent');
    await linkSkills(app, idleAgent.id, [skill.id]);

    // Unrelated activity in the same workspace so the denominator is > 0,
    // but none of it belongs to the idle, linked agent.
    const busyAgent = await createAgent(app, 'Busy Agent');
    const { pr } = await setupRepoAndPr(db, workspaceId);
    await insertRun(db, { workspaceId, prId: pr.id, agentId: busyAgent.id });

    const stats = await getStats(app, skill.id);
    expect(stats.pull_frequency).toBe(0);
    expect(stats.pull_frequency).not.toBeNull();
    await app.close();
  });

  it('used_by counts links; a skill linked to two agents reports 2 with both present, no duplicates', async () => {
    const { app } = await makeApp();
    const skill = await createSkill(app, { name: 'Shared' });
    const agentOne = await createAgent(app, 'Agent One');
    const agentTwo = await createAgent(app, 'Agent Two');
    await linkSkills(app, agentOne.id, [skill.id]);
    await linkSkills(app, agentTwo.id, [skill.id]);

    const stats = await getStats(app, skill.id);
    expect(stats.used_by).toBe(2);
    const ids = stats.agents.map((a: { id: string }) => a.id);
    expect(new Set(ids)).toEqual(new Set([agentOne.id, agentTwo.id]));
    expect(ids).toHaveLength(new Set(ids).size);
    await app.close();
  });

  it('accept_rate counts only accepted and dismissed findings, ignoring untriaged ones', async () => {
    const { app, workspaceId } = await makeApp();
    const { db } = pg.handle;
    const skill = await createSkill(app, { name: 'Accept Mix' });
    const agent = await createAgent(app, 'Mix Agent');
    await linkSkills(app, agent.id, [skill.id]);
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const run = await insertRun(db, { workspaceId, prId: pr.id, agentId: agent.id });
    const review = await insertReview(db, { workspaceId, prId: pr.id, agentId: agent.id, runId: run.id });

    await insertFinding(db, { reviewId: review.id, acceptedAt: new Date() });
    await insertFinding(db, { reviewId: review.id, acceptedAt: new Date() });
    await insertFinding(db, { reviewId: review.id, dismissedAt: new Date() });
    await insertFinding(db, { reviewId: review.id }); // untriaged — must not enter the ratio

    const stats = await getStats(app, skill.id);
    expect(stats.accept_rate).toBeCloseTo(2 / 3, 10);
    await app.close();
  });

  it('accept_rate is null when every finding is untriaged', async () => {
    const { app, workspaceId } = await makeApp();
    const { db } = pg.handle;
    const skill = await createSkill(app, { name: 'All Untriaged' });
    const agent = await createAgent(app, 'Untriaged Agent');
    await linkSkills(app, agent.id, [skill.id]);
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const run = await insertRun(db, { workspaceId, prId: pr.id, agentId: agent.id });
    const review = await insertReview(db, { workspaceId, prId: pr.id, agentId: agent.id, runId: run.id });
    await insertFinding(db, { reviewId: review.id });
    await insertFinding(db, { reviewId: review.id });

    const stats = await getStats(app, skill.id);
    expect(stats.accept_rate).toBeNull();
    await app.close();
  });

  it('findings_by_category groups correctly across several categories', async () => {
    const { app, workspaceId } = await makeApp();
    const { db } = pg.handle;
    const skill = await createSkill(app, { name: 'Category Spread' });
    const agent = await createAgent(app, 'Category Agent');
    await linkSkills(app, agent.id, [skill.id]);
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const run = await insertRun(db, { workspaceId, prId: pr.id, agentId: agent.id });
    const review = await insertReview(db, { workspaceId, prId: pr.id, agentId: agent.id, runId: run.id });
    await insertFinding(db, { reviewId: review.id, category: 'security' });
    await insertFinding(db, { reviewId: review.id, category: 'security' });
    await insertFinding(db, { reviewId: review.id, category: 'bug' });
    await insertFinding(db, { reviewId: review.id, category: 'test-quality' });

    const stats = await getStats(app, skill.id);
    expect(stats.findings_by_category).toEqual({ security: 2, bug: 1, 'test-quality': 1 });
    expect(stats.findings_30d).toBe(4);
    await app.close();
  });

  it('findings older than 30 days are excluded from findings_30d', async () => {
    const { app, workspaceId } = await makeApp();
    const { db } = pg.handle;
    const skill = await createSkill(app, { name: 'Stale Findings' });
    const agent = await createAgent(app, 'Stale Agent');
    await linkSkills(app, agent.id, [skill.id]);
    const { pr } = await setupRepoAndPr(db, workspaceId);

    const recentRun = await insertRun(db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      ranAt: new Date(),
    });
    const staleRun = await insertRun(db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      ranAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    });
    const recentReview = await insertReview(db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      runId: recentRun.id,
    });
    const staleReview = await insertReview(db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      runId: staleRun.id,
    });
    await insertFinding(db, { reviewId: recentReview.id, category: 'bug' });
    await insertFinding(db, { reviewId: staleReview.id, category: 'bug' });

    const stats = await getStats(app, skill.id);
    expect(stats.findings_30d).toBe(1);
    expect(stats.findings_by_category).toEqual({ bug: 1 });
    await app.close();
  });

  it("workspace scoping: another workspace's runs and findings never leak in", async () => {
    const { app, workspaceId } = await makeApp();
    const { db } = pg.handle;
    const skill = await createSkill(app, { name: 'Scoped Skill' });
    const agent = await createAgent(app, 'Scoped Agent');
    await linkSkills(app, agent.id, [skill.id]);
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const run = await insertRun(db, { workspaceId, prId: pr.id, agentId: agent.id });
    const review = await insertReview(db, { workspaceId, prId: pr.id, agentId: agent.id, runId: run.id });
    await insertFinding(db, { reviewId: review.id, category: 'bug', acceptedAt: new Date() });

    // A foreign workspace that (impossibly, but let's be defensive) reuses the
    // same linked agent id for its own run/review/finding.
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'stats-foreign-ws' }).returning();
    const { pr: foreignPr } = await setupRepoAndPr(db, otherWs!.id);
    const foreignRun = await insertRun(db, {
      workspaceId: otherWs!.id,
      prId: foreignPr.id,
      agentId: agent.id,
    });
    const foreignReview = await insertReview(db, {
      workspaceId: otherWs!.id,
      prId: foreignPr.id,
      agentId: agent.id,
      runId: foreignRun.id,
    });
    await insertFinding(db, { reviewId: foreignReview.id, category: 'bug', dismissedAt: new Date() });

    const stats = await getStats(app, skill.id);
    expect(stats.findings_30d).toBe(1);
    expect(stats.findings_by_category).toEqual({ bug: 1 });
    expect(stats.accept_rate).toBe(1);
    expect(stats.pull_frequency).toBe(1);
    await app.close();
  });
});
