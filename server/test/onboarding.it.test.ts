import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider, type MockLLMOptions } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

const GHOST_ID = '00000000-0000-0000-0000-000000000000';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function tourFixture(bodyTag: string) {
  return {
    sections: [
      { kind: 'architecture', title: 'Architecture', body: `Architecture ${bodyTag}`, links: [] },
      {
        kind: 'critical_paths',
        title: 'Critical Paths',
        body: 'body',
        links: [],
        critical_paths: [{ path: 'src/index.ts', reason: 'entry point' }],
      },
      {
        kind: 'run_locally',
        title: 'Run locally',
        body: 'body',
        links: [],
        run_locally: [{ command: 'pnpm dev' }],
      },
      {
        kind: 'reading_path',
        title: 'Reading path',
        body: 'body',
        links: [],
        reading_path: [{ path: 'src/index.ts', rationale: 'start here' }],
      },
      {
        kind: 'first_tasks',
        title: 'First tasks',
        body: 'body',
        links: [],
        first_tasks: [{ title: 'Fix a bug', hint_path: 'src/index.ts', complexity: 'low' }],
      },
    ],
  };
}

const MISSING_KIND_TOUR = { sections: tourFixture('missing-kind').sections.slice(0, 4) };
const INVALID_SCHEMA_TOUR = { sections: [{ kind: 'not_a_kind', title: 't', body: 'b', links: [] }] };

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

const DEFAULT_INDEX_STATE = { status: 'full' as const, lastIndexedSha: 'sha-abc123', filesIndexed: 42 };

function makeRepoIntel(
  opts: {
    indexState?: Partial<typeof DEFAULT_INDEX_STATE>;
    indexedPaths?: string[];
  } = {},
): RepoIntel {
  const indexState = { ...DEFAULT_INDEX_STATE, ...opts.indexState };
  const indexedPaths = opts.indexedPaths ?? ['src/index.ts', 'package.json'];
  return {
    getIndexState: async () => indexState,
    getRepoMap: async () => ({ text: 'repo map', tokens: 10 }),
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
    getIndexedPaths: async () => indexedPaths,
    getFileRank: async () => [],
  } as never;
}

d('onboarding module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  beforeEach(async () => {
    await pg.handle.db.delete(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    await pg.handle.db.delete(t.onboardingGenerations).where(eq(t.onboardingGenerations.repoId, repoId));
    await pg.handle.db
      .delete(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
  });

  function makeApp(
    opts: {
      llmByProvider?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
      repoIntel?: RepoIntel;
    } = {},
  ) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llmByProvider =
      opts.llmByProvider ??
      ({
        openrouter: new MockLLMProvider('openai', {
          structuredBySchema: { onboarding_tour: tourFixture('default') },
        }),
      } as Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: {} }),
        github: new MockGitHubClient(),
        llm: llmByProvider,
        repoIntel: opts.repoIntel ?? makeRepoIntel(),
      },
    });
  }

  async function waitForGeneration(
    app: Awaited<ReturnType<typeof makeApp>>,
    timeoutMs = 10_000,
  ): Promise<{ status: string | null; failure_reason: string | null }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const view = (await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json();
      if (view.status !== 'running') return view;
      if (Date.now() > deadline) throw new Error('generation did not finish in time');
      await sleep(25);
    }
  }

  async function generate(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(202);
    await waitForGeneration(app);
    return res;
  }

  it('writes the running row before the 202 reply, readable by the immediately following poll, and never touches jobs (AC-15, AC-16)', async () => {
    const llm = new DelayedLLM(300, 'openai', { structuredBySchema: { onboarding_tour: tourFixture('slow') } });
    const app = await makeApp({ llmByProvider: { openrouter: llm } });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(202);

    const poll = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(poll.json().status).toBe('running');

    await waitForGeneration(app);

    const jobs = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.workspaceId, workspaceId));
    expect(jobs).toEqual([]);

    await app.close();
  });

  it('returns 409 on a second generate while one is running, leaving the start timestamp unchanged (AC-19)', async () => {
    const llm = new DelayedLLM(300, 'openai', { structuredBySchema: { onboarding_tour: tourFixture('busy') } });
    const app = await makeApp({ llmByProvider: { openrouter: llm } });

    const first = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(first.statusCode).toBe(202);

    const [before] = await pg.handle.db
      .select({ startedAt: t.onboardingGenerations.startedAt })
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId));

    const second = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(second.statusCode).toBe(409);

    const [after] = await pg.handle.db
      .select({ startedAt: t.onboardingGenerations.startedAt })
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId));
    expect(after!.startedAt.getTime()).toBe(before!.startedAt.getTime());

    await waitForGeneration(app);
    await app.close();
  });

  it('returns 409 for an unindexed repository, calling the provider zero times (AC-44)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: {} });
    const app = await makeApp({
      llmByProvider: { openrouter: llm },
      repoIntel: makeRepoIntel({ indexState: { lastIndexedSha: '' } }),
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(409);
    expect(llm.calls).toHaveLength(0);

    const rows = await pg.handle.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId));
    expect(rows).toHaveLength(0);

    await app.close();
  });

  it("leaves the state row failed with a reason and the tour row's generated_at unchanged on failure (AC-20)", async () => {
    const app = await makeApp({
      llmByProvider: {
        openrouter: new MockLLMProvider('openai', {
          structuredBySchema: { onboarding_tour: tourFixture('kept') },
        }),
      },
    });
    await generate(app);

    const [before] = await pg.handle.db
      .select({ generatedAt: t.onboarding.generatedAt })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    expect(before).toBeDefined();

    const appTwo = await makeApp({
      llmByProvider: {
        openrouter: new MockLLMProvider('openai', {
          structuredBySchema: { onboarding_tour: INVALID_SCHEMA_TOUR },
        }),
      },
    });
    const res = await appTwo.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(202);
    const view = await waitForGeneration(appTwo);
    expect(view.status).toBe('failed');
    expect(view.failure_reason).toBeTruthy();

    const [after] = await pg.handle.db
      .select({ generatedAt: t.onboarding.generatedAt })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    expect(after!.generatedAt.getTime()).toBe(before!.generatedAt.getTime());

    await app.close();
    await appTwo.close();
  });

  it(
    'marks the state failed after a schema failure, with exactly one pipeline execution and null usage, ' +
      'never zeros (AC-48, AC-67)',
    async () => {
      const llm = new MockLLMProvider('openai', { structuredBySchema: { onboarding_tour: INVALID_SCHEMA_TOUR } });
      const app = await makeApp({ llmByProvider: { openrouter: llm } });

      const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
      expect(res.statusCode).toBe(202);
      const view = await waitForGeneration(app);
      expect(view.status).toBe('failed');

      expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

      const [state] = await pg.handle.db
        .select()
        .from(t.onboardingGenerations)
        .where(eq(t.onboardingGenerations.repoId, repoId));
      expect(state!.status).toBe('failed');
      expect(state!.provider).toBe('openrouter');
      expect(state!.model).toBe('deepseek/deepseek-v4-flash');
      expect(state!.tokensIn).toBeNull();
      expect(state!.tokensOut).toBeNull();
      expect(state!.costUsd).toBeNull();
      expect(state!.error).toBeTruthy();

      await app.close();
    },
  );

  it('records provider, model, tokens and cost on a failed row (AC-49)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { onboarding_tour: MISSING_KIND_TOUR } });
    const app = await makeApp({ llmByProvider: { openrouter: llm } });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(202);
    const view = await waitForGeneration(app);
    expect(view.status).toBe('failed');

    const [state] = await pg.handle.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId));
    expect(state!.status).toBe('failed');
    expect(state!.provider).toBe('openrouter');
    expect(state!.model).toBe('deepseek/deepseek-v4-flash');
    expect(state!.tokensIn).toBe(100);
    expect(state!.tokensOut).toBe(50);
    expect(state!.costUsd).toBe(0.001);
    expect(state!.error).toBeTruthy();

    await app.close();
  });

  it('resolves the model through the onboarding feature-model entry, default when unset (AC-50)', async () => {
    const defaultLlm = new MockLLMProvider('openai', {
      structuredBySchema: { onboarding_tour: tourFixture('default-model') },
    });
    const overrideLlm = new MockLLMProvider('openai', {
      structuredBySchema: { onboarding_tour: tourFixture('override-model') },
    });
    const app = await makeApp({ llmByProvider: { openrouter: defaultLlm, openai: overrideLlm } });

    const before = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(before.json().model).toBe('deepseek/deepseek-v4-flash');

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { onboarding: { provider: 'openai', model: 'gpt-4.1' } } },
    });
    expect(put.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(after.json().model).toBe('gpt-4.1');

    await generate(app);

    expect(overrideLlm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(defaultLlm.calls).toHaveLength(0);
    const call = overrideLlm.calls.find((c) => c.method === 'completeStructured')!;
    expect((call.req as { model: string }).model).toBe('gpt-4.1');

    await app.close();
  });

  it(
    'replaces the single stored row on a successful regeneration, persisting files_indexed and the indexed sha ' +
      '(AC-36, AC-31)',
    async () => {
      const app = await makeApp({
        llmByProvider: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { onboarding_tour: tourFixture('first') },
          }),
        },
        repoIntel: makeRepoIntel({ indexState: { lastIndexedSha: 'sha-one', filesIndexed: 7 } }),
      });
      await generate(app);

      const firstRows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
      expect(firstRows).toHaveLength(1);
      expect(firstRows[0]!.filesIndexed).toBe(7);
      expect(firstRows[0]!.indexedSha).toBe('sha-one');
      expect((firstRows[0]!.json as { sections: { body: string }[] }).sections[0]!.body).toContain('first');

      const appTwo = await makeApp({
        llmByProvider: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { onboarding_tour: tourFixture('second') },
          }),
        },
        repoIntel: makeRepoIntel({ indexState: { lastIndexedSha: 'sha-two', filesIndexed: 9 } }),
      });
      await generate(appTwo);

      const secondRows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
      expect(secondRows).toHaveLength(1);
      expect(secondRows[0]!.filesIndexed).toBe(9);
      expect(secondRows[0]!.indexedSha).toBe('sha-two');
      expect((secondRows[0]!.json as { sections: { body: string }[] }).sections[0]!.body).toContain('second');

      await app.close();
      await appTwo.close();
    },
  );

  it('closes a running row left by a simulated restart before requests are served (AC-22)', async () => {
    await pg.handle.db
      .insert(t.onboardingGenerations)
      .values({ repoId, workspaceId, status: 'running' })
      .onConflictDoUpdate({
        target: t.onboardingGenerations.repoId,
        set: { status: 'running', finishedAt: null, error: null },
      });

    const app = await makeApp();
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    const view = res.json();
    expect(view.status).toBe('failed');
    expect(view.failure_reason).toContain('restarted');

    await app.close();
  });

  it('returns an identical 404 body for an unknown id and a foreign-workspace id (AC-42)', async () => {
    const app = await makeApp();

    const [otherWorkspace] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-onboarding-${Date.now()}` })
      .returning();
    const [otherRepo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: otherWorkspace!.id,
        owner: 'other',
        name: 'repo',
        fullName: 'other/repo',
      })
      .returning();

    const unknown = await app.inject({ method: 'GET', url: `/repos/${GHOST_ID}/onboarding` });
    const foreign = await app.inject({ method: 'GET', url: `/repos/${otherRepo!.id}/onboarding` });

    expect(unknown.statusCode).toBe(404);
    expect(foreign.statusCode).toBe(404);
    expect(unknown.json()).toEqual(foreign.json());

    await app.close();
  });

  it('never creates a generation row from reading the tour (AC-35)', async () => {
    const app = await makeApp();

    await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });

    const rows = await pg.handle.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId));
    expect(rows).toHaveLength(0);

    await app.close();
  });
});
