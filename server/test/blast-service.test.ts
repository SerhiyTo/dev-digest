import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { BlastService } from '../src/modules/blast/service.js';
import { AppError } from '../src/platform/errors.js';
import { MAX_OVERLAP_PATHS_PER_PR } from '../src/modules/blast/constants.js';
import type {
  BlastEngine,
  BlastEngineResult,
  BlastHistoryRow,
  BlastPullSummary,
  BlastStore,
} from '../src/modules/blast/ports.js';

function fakeStore(opts: {
  pull?: BlastPullSummary;
  paths?: string[];
  history?: BlastHistoryRow[];
} = {}): BlastStore {
  return {
    getPullSummary: async () => opts.pull,
    getChangedPaths: async () => opts.paths ?? [],
    getPriorPrs: async () => opts.history ?? [],
  };
}

function fakeEngine(result: BlastEngineResult): { engine: BlastEngine; calls: [string, string[]][] } {
  const calls: [string, string[]][] = [];
  return {
    calls,
    engine: {
      getBlastRadius: async (repoId, changedFiles) => {
        calls.push([repoId, changedFiles]);
        return result;
      },
    },
  };
}

const EMPTY_ENGINE_RESULT: BlastEngineResult = {
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
};

/**
 * Locks down `BlastService.get`'s orchestration — the no-pull 404 signal, the
 * no-files short-circuit that never calls the engine, verbatim wiring of
 * changed paths into the engine call, history field mapping, and the
 * safeParse-not-.parse contract guard that keeps a broken DTO from being
 * misreported as a client error.
 */
describe('BlastService.get', () => {
  it('returns undefined when the pull has no row in this workspace (the route turns this into 404)', async () => {
    const service = new BlastService({
      store: fakeStore({ pull: undefined }),
      engine: fakeEngine(EMPTY_ENGINE_RESULT).engine,
    });

    expect(await service.get('ws-1', 'pr-1')).toBeUndefined();
  });

  it('passes getChangedPaths output to engine.getBlastRadius verbatim', async () => {
    const paths = ['src/a.ts', 'src/b.ts'];
    const { engine, calls } = fakeEngine(EMPTY_ENGINE_RESULT);
    const service = new BlastService({
      store: fakeStore({ pull: { id: 'pr-1', repoId: 'repo-9' }, paths }),
      engine,
    });

    await service.get('ws-1', 'pr-1');

    expect(calls).toEqual([['repo-9', paths]]);
  });

  it('does not call the engine and returns degraded:no_files for zero changed paths', async () => {
    const { engine, calls } = fakeEngine(EMPTY_ENGINE_RESULT);
    const service = new BlastService({
      store: fakeStore({ pull: { id: 'pr-1', repoId: 'repo-9' }, paths: [] }),
      engine,
    });

    const dto = await service.get('ws-1', 'pr-1');

    expect(calls).toHaveLength(0);
    expect(dto?.degraded).toBe(true);
    expect(dto?.reason).toBe('no_files');
  });

  it('maps history: merged_at from updatedAt falling back to openedAt, notes from status, files_overlap capped', async () => {
    const overlapPaths = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'];
    const history: BlastHistoryRow[] = [
      {
        prNumber: 415,
        title: 'tighten rate limiting',
        author: 'octocat',
        status: 'merged',
        updatedAt: new Date('2026-08-01T00:00:00Z'),
        openedAt: new Date('2026-07-30T00:00:00Z'),
        overlapCount: overlapPaths.length,
        overlapPaths,
      },
      {
        prNumber: 400,
        title: 'earlier open PR',
        author: 'nova',
        status: 'open',
        updatedAt: null,
        openedAt: new Date('2026-06-01T00:00:00Z'),
        overlapCount: 1,
        overlapPaths: ['x.ts'],
      },
    ];
    const service = new BlastService({
      store: fakeStore({ pull: { id: 'pr-1', repoId: 'repo-9' }, paths: ['a.ts'], history }),
      engine: fakeEngine(EMPTY_ENGINE_RESULT).engine,
    });

    const dto = await service.get('ws-1', 'pr-1');

    expect(dto?.history[0]).toMatchObject({
      pr_number: 415,
      merged_at: '2026-08-01T00:00:00.000Z',
      notes: 'merged',
    });
    expect(dto?.history[0]?.files_overlap).toHaveLength(MAX_OVERLAP_PATHS_PER_PR);
    expect(dto?.history[1]).toMatchObject({
      pr_number: 400,
      merged_at: '2026-06-01T00:00:00.000Z',
      notes: 'open',
    });
  });

  it('throws AppError(500, internal_error) — never a ZodError — when the assembled DTO fails its own contract', async () => {
    const contractBreakingResult: BlastEngineResult = {
      changedSymbols: [{ file: 'a.ts', name: 'rateLimit', kind: 'function' }],
      callers: [{ file: 'b.ts', symbol: 'h', viaSymbol: 'rateLimit', line: 1.5, rank: 1 }],
      impactedEndpoints: [],
    };
    const service = new BlastService({
      store: fakeStore({ pull: { id: 'pr-1', repoId: 'repo-9' }, paths: ['a.ts'] }),
      engine: fakeEngine(contractBreakingResult).engine,
    });

    let caught: unknown;
    try {
      await service.get('ws-1', 'pr-1');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect(caught).not.toBeInstanceOf(ZodError);
    expect((caught as AppError).statusCode).toBe(500);
    expect((caught as AppError).code).toBe('internal_error');
  });
});
