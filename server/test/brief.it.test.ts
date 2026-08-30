import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider, type MockLLMOptions } from '../src/adapters/mocks.js';
import { BRIEF_SCHEMA_NAME, STUCK_GENERATION_MS } from '../src/modules/brief/constants.js';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function briefFixture(titleTag: string) {
  return {
    summary: `Adds a token-bucket rate limiter to the public API (${titleTag}).`,
    risks: [
      {
        kind: 'security',
        title: 'Limiter may skip auth on health checks',
        explanation: 'The new middleware short-circuits before the auth guard runs.',
        severity: 'high',
        file_refs: ['src/middleware/ratelimit.ts'],
      },
    ],
    review_focus: [
      {
        file: 'src/middleware/ratelimit.ts',
        start_line: 10,
        end_line: 12,
        reason: 'Check the bucket refill math under concurrent requests.',
      },
    ],
    file_summaries: [
      { path: 'src/middleware/ratelimit.ts', summary: 'Implements a token-bucket limiter middleware.' },
    ],
  };
}

const ENGINE_RESULT: BlastResult = {
  changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' }],
  callers: [
    { file: 'src/api/public/index.ts', symbol: 'router', viaSymbol: 'rateLimit', line: 23, rank: 3 },
  ],
  impactedEndpoints: ['GET /api/public/items'],
  factsByFile: {
    'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
  },
};

function fakeRepoIntel(result: BlastResult = ENGINE_RESULT): RepoIntel {
  return {
    indexRepo: async () => {
      throw new Error('indexRepo is not exercised by brief tests');
    },
    refreshIndex: async () => {
      throw new Error('refreshIndex is not exercised by brief tests');
    },
    getIndexState: async () => {
      throw new Error('getIndexState is not exercised by brief tests');
    },
    getBlastRadius: async () => result,
    getRepoMap: async () => ({ text: '', tokens: 0, cached: false }),
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => [],
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
  } as never;
}

class DelayedLLM extends MockLLMProvider {
  constructor(
    private readonly delayMs: number,
    id: 'openai' | 'anthropic' = 'openai',
    opts: MockLLMOptions = {},
  ) {
    super(id, opts);
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await sleep(this.delayMs);
    return super.completeStructured(req);
  }
}

class HangingLLM extends MockLLMProvider {
  override async completeStructured<T>(): Promise<StructuredResult<T>> {
    return new Promise<StructuredResult<T>>(() => {});
  }
}

class ThrowingLLM extends MockLLMProvider {
  constructor(
    private readonly failure: string,
    id: 'openai' | 'anthropic' = 'openai',
  ) {
    super(id);
  }

  override async completeStructured<T>(): Promise<StructuredResult<T>> {
    throw new Error(this.failure);
  }
}

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  bucket: 5,\n   redisUrl: x,';

d('brief module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  let repoSeq = 0;
  async function makeRepo(ws: string = workspaceId) {
    const name = `brief-repo-${repoSeq++}-${randomUUID().slice(0, 8)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  let prSeq = 900;
  async function makePr(
    ws: string,
    repoId: string,
    opts: { headSha?: string; withPatch?: boolean } = {},
  ) {
    const headSha = opts.headSha ?? `sha-${prSeq}`;
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId,
        number: prSeq++,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit',
        base: 'main',
        headSha,
        additions: 84,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: null,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/middleware/ratelimit.ts',
      additions: 84,
      deletions: 0,
      patch: opts.withPatch === false ? null : PATCH,
    });
    return pr!;
  }

  function makeApp(
    opts: {
      llmByProvider?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
      nodeEnv?: 'test' | 'development' | 'production';
    } = {},
  ) {
    const config = loadConfig({
      ...process.env,
      NODE_ENV: opts.nodeEnv ?? 'test',
      LOG_LEVEL: 'silent',
    } as NodeJS.ProcessEnv);
    const llmByProvider =
      opts.llmByProvider ??
      ({
        openai: new MockLLMProvider('openai', {
          structuredBySchema: { [BRIEF_SCHEMA_NAME]: briefFixture('default') },
        }),
      } as Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: {} }),
        github: new MockGitHubClient(),
        llm: llmByProvider,
        repoIntel: fakeRepoIntel(),
      },
    });
  }

  async function waitForGeneration(
    app: Awaited<ReturnType<typeof makeApp>>,
    prId: string,
    timeoutMs = 10_000,
  ): Promise<{ status: string | null }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const view = (await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json();
      if (view.generation?.status !== 'running') return view.generation ?? { status: null };
      if (Date.now() > deadline) throw new Error('generation did not finish in time');
      await sleep(25);
    }
  }

  it('returns a null brief with no generation state for a PR that never generated one (AC-67)', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const pr = await makePr(workspaceId, repo.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ brief: null, generation: null, stale: false });

    await app.close();
  });

  it('returns 404 for a pull request outside the caller workspace (AC-68)', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `brief-other-ws-${Date.now()}` })
      .returning();
    const otherRepo = await makeRepo(otherWs!.id);
    const otherPr = await makePr(otherWs!.id, otherRepo.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${otherPr.id}/brief` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('returns 422 for a non-uuid pull id (AC-69)', async () => {
    const app = await makeApp();

    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/brief' });
    expect(res.statusCode).toBe(422);

    await app.close();
  });

  it('writes the running row before the 202 reply, readable by the immediately following poll (AC-41)', async () => {
    const app = await makeApp({
      llmByProvider: {
        openai: new DelayedLLM(300, 'openai', {
          structuredBySchema: { [BRIEF_SCHEMA_NAME]: briefFixture('slow') },
        }),
      },
    });
    const repo = await makeRepo();
    const pr = await makePr(workspaceId, repo.id);

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(post.statusCode).toBe(202);

    const poll = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(poll.json().generation).toMatchObject({ status: 'running' });

    await waitForGeneration(app, pr.id);
    await app.close();
  });

  it('returns 409 on a second generate request while one is running (AC-42)', async () => {
    const app = await makeApp({
      llmByProvider: {
        openai: new DelayedLLM(300, 'openai', {
          structuredBySchema: { [BRIEF_SCHEMA_NAME]: briefFixture('busy') },
        }),
      },
    });
    const repo = await makeRepo();
    const pr = await makePr(workspaceId, repo.id);

    const first = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(first.statusCode).toBe(202);

    const second = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(second.statusCode).toBe(409);

    await waitForGeneration(app, pr.id);
    await app.close();
  });

  it('returns 202 rather than 409 against a running row aged past the stuck-generation timeout (AC-48)', async () => {
    const app = await makeApp({ llmByProvider: { openai: new HangingLLM('openai') } });
    const repo = await makeRepo();
    const pr = await makePr(workspaceId, repo.id);

    const first = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(first.statusCode).toBe(202);

    await pg.handle.db
      .update(t.prBriefGenerations)
      .set({ startedAt: new Date(Date.now() - STUCK_GENERATION_MS - 60_000) })
      .where(eq(t.prBriefGenerations.prId, pr.id));

    const second = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(second.statusCode).toBe(202);

    const [row] = await pg.handle.db
      .select()
      .from(t.prBriefGenerations)
      .where(eq(t.prBriefGenerations.prId, pr.id));
    expect(row!.status).toBe('running');
    expect(Date.now() - row!.startedAt.getTime()).toBeLessThan(60_000);

    await app.close();
  });

  it('rate-limits the sixth generate request within a minute for one workspace (AC-54)', async () => {
    const app = await makeApp({ nodeEnv: 'production' });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/pulls/${randomUUID()}/brief/generate`,
      });
      statuses.push(res.statusCode);
    }

    expect(statuses.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(statuses[5]).toBe(429);

    await app.close();
  });

  it('a successful generation replaces the stored brief, records provenance and keeps one row per PR (AC-34, AC-35, AC-46, AC-49)', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const pr = await makePr(workspaceId, repo.id, { headSha: 'sha-success-1' });

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(post.statusCode).toBe(202);
    await waitForGeneration(app, pr.id);

    const briefRows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(briefRows).toHaveLength(1);
    const briefRow = briefRows[0]!;
    expect(briefRow.headSha).toBe('sha-success-1');
    expect(typeof briefRow.provider).toBe('string');
    expect(typeof briefRow.model).toBe('string');
    expect(typeof briefRow.tokensIn).toBe('number');
    expect(typeof briefRow.tokensOut).toBe('number');
    expect(typeof briefRow.costUsd).toBe('number');
    expect((briefRow.json as { summary?: string }).summary).toContain('default');

    const [genRow] = await pg.handle.db
      .select()
      .from(t.prBriefGenerations)
      .where(eq(t.prBriefGenerations.prId, pr.id));
    expect(genRow!.status).toBe('done');
    expect(typeof genRow!.provider).toBe('string');
    expect(typeof genRow!.model).toBe('string');
    expect(typeof genRow!.tokensIn).toBe('number');
    expect(typeof genRow!.tokensOut).toBe('number');
    expect(typeof genRow!.costUsd).toBe('number');

    const generations = await pg.handle.db
      .select()
      .from(t.prBriefGenerations)
      .where(eq(t.prBriefGenerations.prId, pr.id));
    expect(generations).toHaveLength(1);

    await app.close();
  });

  it('a failed generation leaves the stored document byte-identical and records the error (AC-47, AC-49)', async () => {
    const goodApp = await makeApp();
    const repo = await makeRepo();
    const pr = await makePr(workspaceId, repo.id, { headSha: 'sha-fail-1' });

    const post = await goodApp.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(post.statusCode).toBe(202);
    await waitForGeneration(goodApp, pr.id);
    await goodApp.close();

    const [before] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(before).toBeDefined();

    const failingApp = await makeApp({
      llmByProvider: { openai: new ThrowingLLM('provider timed out') },
    });
    const retry = await failingApp.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(retry.statusCode).toBe(202);
    const generation = await waitForGeneration(failingApp, pr.id);
    expect(generation.status).toBe('failed');

    const [after] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(JSON.stringify(after!.json)).toBe(JSON.stringify(before!.json));
    expect(after!.generatedAt.getTime()).toBe(before!.generatedAt.getTime());

    const [genRow] = await pg.handle.db
      .select()
      .from(t.prBriefGenerations)
      .where(eq(t.prBriefGenerations.prId, pr.id));
    expect(genRow!.status).toBe('failed');
    expect(genRow!.error).toBe('provider timed out');
    expect(typeof genRow!.provider).toBe('string');
    expect(typeof genRow!.model).toBe('string');
    expect(genRow!.tokensIn).toBeNull();
    expect(genRow!.tokensOut).toBeNull();
    expect(genRow!.costUsd).toBeNull();

    await failingApp.close();
  });

  it('never writes pr_intent.computed_at, reviews.score or agent_runs.cost_usd during a generation (AC-3, AC-9, AC-50)', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const pr = await makePr(workspaceId, repo.id);

    const computedAt = new Date('2026-01-01T00:00:00Z');
    await pg.handle.db.insert(t.prIntent).values({
      prId: pr.id,
      intent: 'Adds rate limiting.',
      inScope: [],
      outOfScope: [],
      riskAreas: [],
      evidence: [],
      confidence: null,
      computedAt,
    });

    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        kind: 'review',
        verdict: 'approve',
        summary: 'looks fine',
        score: 77,
        model: 'seed',
      })
      .returning();

    await pg.handle.db.insert(t.agentRuns).values({
      workspaceId,
      prId: pr.id,
      provider: 'openai',
      model: 'gpt-4.1',
      status: 'completed',
      costUsd: 12.34,
    });

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(post.statusCode).toBe(202);
    await waitForGeneration(app, pr.id);

    const [intentAfter] = await pg.handle.db
      .select()
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, pr.id));
    expect(intentAfter!.computedAt.getTime()).toBe(computedAt.getTime());

    const [reviewAfter] = await pg.handle.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.id, review!.id));
    expect(reviewAfter!.score).toBe(77);

    const costRows = await pg.handle.db
      .select({ costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.prId, pr.id));
    const sum = costRows.reduce((acc, row) => acc + (row.costUsd ?? 0), 0);
    expect(sum).toBe(12.34);

    await app.close();
  });

  it('produces a brief for a pull request with zero review rows (AC-5)', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const pr = await makePr(workspaceId, repo.id);

    const existingReviews = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id));
    expect(existingReviews).toHaveLength(0);

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/generate` });
    expect(post.statusCode).toBe(202);
    const generation = await waitForGeneration(app, pr.id);
    expect(generation.status).toBe('done');

    const [briefRow] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(briefRow).toBeDefined();

    await app.close();
  });

  it('adds zero generation rows across an import, a re-index and ten reads (AC-39)', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const pr = await makePr(workspaceId, repo.id);

    const importRes = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(importRes.statusCode).toBe(200);

    const resyncRes = await app.inject({ method: 'POST', url: `/repos/${repo.id}/resync` });
    expect(resyncRes.statusCode).toBe(202);
    await app.container.jobs.onIdle();

    for (let i = 0; i < 10; i++) {
      const readRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
      expect(readRes.statusCode).toBe(200);
    }

    const generations = await pg.handle.db
      .select()
      .from(t.prBriefGenerations)
      .where(eq(t.prBriefGenerations.prId, pr.id));
    expect(generations).toHaveLength(0);

    await app.close();
  });
});
