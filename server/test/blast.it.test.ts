import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type {
  BlastResult,
  FileRankRow,
  IndexResult,
  IndexState,
  RefRow,
  RepoIntel,
  RepoMapResult,
  SignatureRow,
  SymbolRow,
} from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function fakeRepoIntel(result: BlastResult): RepoIntel {
  return {
    indexRepo: async (): Promise<IndexResult> => {
      throw new Error('indexRepo is not exercised by blast tests');
    },
    refreshIndex: async (): Promise<IndexResult> => {
      throw new Error('refreshIndex is not exercised by blast tests');
    },
    getIndexState: async (): Promise<IndexState> => {
      throw new Error('getIndexState is not exercised by blast tests');
    },
    getBlastRadius: async (): Promise<BlastResult> => result,
    getRepoMap: async (): Promise<RepoMapResult> => ({ text: '', tokens: 0, cached: false }),
    getFileRank: async (): Promise<FileRankRow[]> => [],
    getSymbolsInFiles: async (): Promise<SymbolRow[]> => [],
    getCallerSignatures: async (): Promise<SignatureRow[]> => [],
    getUnresolvedReferences: async (): Promise<RefRow[]> => [],
    getConventionSamples: async (): Promise<string[]> => [],
    getTopFilesByRank: async (): Promise<string[]> => [],
    getCriticalPaths: async (): Promise<string[][]> => [],
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

let repoSeq = 0;
async function makeRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

async function makePr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  repoId: string,
  opts: { number: number; paths: string[]; status?: string },
) {
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number: opts.number,
      title: `pr #${opts.number}`,
      author: 'octocat',
      branch: `feat/${opts.number}`,
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 10,
      deletions: 2,
      filesCount: opts.paths.length,
      status: opts.status ?? 'needs_review',
      body: null,
    })
    .returning();
  if (opts.paths.length > 0) {
    await db
      .insert(t.prFiles)
      .values(opts.paths.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0, patch: null })));
  }
  return pr!;
}

d('Blast Radius (Testcontainers pg)', () => {
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

  function app(engineResult: BlastResult = ENGINE_RESULT) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { repoIntel: fakeRepoIntel(engineResult) },
    });
  }

  it('200s with the blast radius shape for a seeded PR', async () => {
    const server = await app();
    const repo = await makeRepo(pg.handle.db, workspaceId);
    const pr = await makePr(pg.handle.db, workspaceId, repo.id, {
      number: 900,
      paths: ['src/middleware/ratelimit.ts'],
    });

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/blast-radius` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(() => BlastRadiusResponse.parse(body)).not.toThrow();
    expect(body.degraded).toBe(false);
    expect(body.downstream[0]?.symbol).toBe('rateLimit');
    expect(body.downstream[0]?.callers[0]).toMatchObject({
      file: 'src/api/public/index.ts',
      name: 'router',
    });
    expect(body.endpoints_affected).toEqual(['GET /api/public/items']);
    await server.close();
  });

  it('orders history by overlap count desc and excludes the current PR', async () => {
    const server = await app();
    const repo = await makeRepo(pg.handle.db, workspaceId);
    const pr = await makePr(pg.handle.db, workspaceId, repo.id, {
      number: 901,
      paths: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    });
    await makePr(pg.handle.db, workspaceId, repo.id, {
      number: 902,
      paths: ['src/a.ts', 'src/b.ts'],
      status: 'merged',
    });
    await makePr(pg.handle.db, workspaceId, repo.id, {
      number: 903,
      paths: ['src/a.ts'],
      status: 'open',
    });

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/blast-radius` });
    const body = res.json();

    expect(body.history.map((h: { pr_number: number }) => h.pr_number)).toEqual([902, 903]);
    expect(body.history.some((h: { pr_number: number }) => h.pr_number === 901)).toBe(false);
    await server.close();
  });

  it('excludes a PR in a different repo from history even on the same overlapping path', async () => {
    const server = await app();
    const repoA = await makeRepo(pg.handle.db, workspaceId);
    const repoB = await makeRepo(pg.handle.db, workspaceId);
    const pr = await makePr(pg.handle.db, workspaceId, repoA.id, {
      number: 910,
      paths: ['src/shared.ts'],
    });
    await makePr(pg.handle.db, workspaceId, repoB.id, { number: 911, paths: ['src/shared.ts'] });

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/blast-radius` });
    expect(res.json().history).toEqual([]);
    await server.close();
  });

  it('excludes a PR in a different workspace from history', async () => {
    const server = await app();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${Date.now()}` })
      .returning();
    const repo = await makeRepo(pg.handle.db, workspaceId);
    const otherRepo = await makeRepo(pg.handle.db, otherWs!.id);
    const pr = await makePr(pg.handle.db, workspaceId, repo.id, { number: 920, paths: ['src/x.ts'] });
    await makePr(pg.handle.db, otherWs!.id, otherRepo.id, { number: 921, paths: ['src/x.ts'] });

    const res = await server.inject({ method: 'GET', url: `/pulls/${pr.id}/blast-radius` });
    expect(res.json().history).toEqual([]);
    await server.close();
  });

  it('404s for an unknown pull request and 422s for a non-uuid', async () => {
    const server = await app();

    const missing = await server.inject({
      method: 'GET',
      url: '/pulls/11111111-1111-4111-8111-111111111111/blast-radius',
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');

    const bad = await server.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast-radius' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('validation_error');
    await server.close();
  });
});
