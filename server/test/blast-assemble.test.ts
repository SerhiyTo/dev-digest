import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import {
  assembleBlastModel,
  type BlastModel,
} from '../src/modules/blast/assemble.js';
import { toBlastRadiusDto } from '../src/modules/blast/helpers.js';
import type {
  BlastEngineCaller,
  BlastEngineChangedSymbol,
  BlastEngineResult,
  BlastHistoryRow,
  Logger,
} from '../src/modules/blast/ports.js';
import {
  ENGINE_CALLER_CAP,
  MAX_CALLERS_PER_SYMBOL,
  MAX_DOWNSTREAM,
} from '../src/modules/blast/constants.js';
import { MAX_CALLERS_PER_SYMBOL as REPO_INTEL_MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';

interface LogLine {
  level: 'info' | 'warn' | 'error';
  obj: Record<string, unknown>;
  msg?: string;
}

function spyLogger(): { logger: Logger; lines: LogLine[] } {
  const lines: LogLine[] = [];
  const push = (level: LogLine['level']) => (obj: unknown, msg?: string) =>
    lines.push({ level, obj: obj as Record<string, unknown>, msg });
  return {
    lines,
    logger: { info: push('info'), warn: push('warn'), error: push('error') },
  };
}

function symbol(name: string, file = `${name}.ts`, kind = 'function'): BlastEngineChangedSymbol {
  return { name, file, kind };
}

function caller(
  file: string,
  symbolName: string,
  viaSymbol: string,
  line: number,
  rank: number,
  kind?: 'call' | 'type',
): BlastEngineCaller {
  return { file, symbol: symbolName, viaSymbol, line, rank, kind };
}

/**
 * Locks down `assembleBlastModel`'s mapping contract — grouping, dedup, order,
 * per-symbol vs. degraded attribution, caps, and the four summary shapes —
 * because it is the only place that logic lives and nothing else in the slice
 * re-derives it.
 */
describe('assembleBlastModel', () => {
  it('groups callers by viaSymbol, dedups on file|symbol|line, and orders rank desc, file asc, line asc', () => {
    const engine: BlastEngineResult = {
      changedSymbols: [symbol('rateLimit'), symbol('bucketKey')],
      callers: [
        caller('b.ts', 'handler', 'rateLimit', 10, 1),
        caller('a.ts', 'handler', 'rateLimit', 10, 3),
        caller('a.ts', 'handler', 'rateLimit', 5, 3),
        caller('a.ts', 'handler', 'rateLimit', 10, 3),
        caller('c.ts', 'other', 'bucketKey', 1, 1),
      ],
      impactedEndpoints: [],
    };

    const model = assembleBlastModel(engine);

    const rateLimit = model.downstream.find((d) => d.symbol === 'rateLimit');
    expect(rateLimit?.callers).toEqual([
      { file: 'a.ts', symbol: 'handler', line: 5, rank: 3 },
      { file: 'a.ts', symbol: 'handler', line: 10, rank: 3 },
      { file: 'b.ts', symbol: 'handler', line: 10, rank: 1 },
    ]);

    const bucketKey = model.downstream.find((d) => d.symbol === 'bucketKey');
    expect(bucketKey?.callers).toEqual([{ file: 'c.ts', symbol: 'other', line: 1, rank: 1 }]);
  });

  it('attributes endpoints/crons per symbol from factsByFile keyed by caller file, and rolls up the union', () => {
    const engine: BlastEngineResult = {
      changedSymbols: [symbol('rateLimit'), symbol('bucketKey')],
      callers: [
        caller('routes/a.ts', 'h1', 'rateLimit', 10, 1),
        caller('routes/b.ts', 'h2', 'bucketKey', 20, 1),
      ],
      impactedEndpoints: ['GET /x'],
      factsByFile: {
        'routes/a.ts': { endpoints: ['GET /api/items', 'POST /api/items'], crons: [] },
        'routes/b.ts': { endpoints: ['GET /api/health'], crons: ['reset-buckets'] },
      },
    };

    const model = assembleBlastModel(engine);

    const rateLimit = model.downstream.find((d) => d.symbol === 'rateLimit');
    expect(rateLimit?.endpointsAffected).toEqual(['GET /api/items', 'POST /api/items']);
    expect(rateLimit?.cronsAffected).toEqual([]);

    const bucketKey = model.downstream.find((d) => d.symbol === 'bucketKey');
    expect(bucketKey?.endpointsAffected).toEqual(['GET /api/health']);
    expect(bucketKey?.cronsAffected).toEqual(['reset-buckets']);

    expect(model.endpointsAffected).toEqual(['GET /api/health', 'GET /api/items', 'POST /api/items']);
    expect(model.cronsAffected).toEqual(['reset-buckets']);
  });

  it('leaves per-symbol endpoints/crons empty and rolls up impactedEndpoints verbatim on the degraded path', () => {
    const engine: BlastEngineResult = {
      changedSymbols: [symbol('rateLimit')],
      callers: [caller('routes/a.ts', 'h1', 'rateLimit', 10, 0)],
      impactedEndpoints: ['GET /api/items', 'POST /api/webhooks'],
      degraded: true,
      reason: 'index_partial',
    };

    const model = assembleBlastModel(engine);

    expect(model.downstream[0]?.endpointsAffected).toEqual([]);
    expect(model.downstream[0]?.cronsAffected).toEqual([]);
    expect(model.endpointsAffected).toEqual(engine.impactedEndpoints);
    expect(model.cronsAffected).toEqual([]);
    expect(model.degraded).toBe(true);
    expect(model.reason).toBe('index_partial');
  });

  it('caps callers at MAX_CALLERS_PER_SYMBOL (30 -> 20) per symbol and warns once', () => {
    const { logger, lines } = spyLogger();
    const callers = Array.from({ length: 30 }, (_, i) => caller(`f${i}.ts`, 'h', 'rateLimit', i, i));
    const engine: BlastEngineResult = {
      changedSymbols: [symbol('rateLimit')],
      callers,
      impactedEndpoints: [],
    };

    const model = assembleBlastModel(engine, logger);

    expect(model.downstream[0]?.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(model.downstream[0]?.callers.map((c) => c.rank)).toEqual(
      Array.from({ length: MAX_CALLERS_PER_SYMBOL }, (_, i) => 29 - i),
    );
    const warned = lines.filter((l) => l.msg === 'blast: callers truncated to per-symbol cap');
    expect(warned).toHaveLength(1);
  });

  it('caps downstream at MAX_DOWNSTREAM, and symbols that have callers survive the slice', () => {
    const changedSymbols = Array.from({ length: 30 }, (_, i) => symbol(`sym${i}`));
    const callers = [caller('a.ts', 'h', 'sym0', 1, 1), caller('b.ts', 'h', 'sym29', 1, 1)];
    const engine: BlastEngineResult = { changedSymbols, callers, impactedEndpoints: [] };

    const model = assembleBlastModel(engine);

    expect(model.downstream).toHaveLength(MAX_DOWNSTREAM);
    const names = model.downstream.map((d) => d.symbol);
    expect(names).toContain('sym0');
    expect(names).toContain('sym29');
  });

  it('still produces a downstream entry with callers: [] for a changed symbol with zero callers', () => {
    const engine: BlastEngineResult = {
      changedSymbols: [symbol('lonely')],
      callers: [],
      impactedEndpoints: [],
    };

    const model = assembleBlastModel(engine);

    expect(model.downstream).toEqual([
      { symbol: 'lonely', callers: [], endpointsAffected: [], cronsAffected: [] },
    ]);
  });

  it('flips truncated exactly at ENGINE_CALLER_CAP raw engine callers', () => {
    const changedSymbols = [symbol('rateLimit')];
    const below = Array.from({ length: ENGINE_CALLER_CAP - 1 }, (_, i) =>
      caller(`f${i}.ts`, 'h', 'rateLimit', i, 1),
    );
    const atCap = Array.from({ length: ENGINE_CALLER_CAP }, (_, i) =>
      caller(`f${i}.ts`, 'h', 'rateLimit', i, 1),
    );

    expect(
      assembleBlastModel({ changedSymbols, callers: below, impactedEndpoints: [] }).truncated,
    ).toBe(false);
    expect(
      assembleBlastModel({ changedSymbols, callers: atCap, impactedEndpoints: [] }).truncated,
    ).toBe(true);
  });

  it('builds all four summary shapes: normal, no-callers, truncated, degraded', () => {
    const normal = assembleBlastModel({
      changedSymbols: [symbol('rateLimit'), symbol('bucketKey')],
      callers: [caller('a.ts', 'h1', 'rateLimit', 1, 1), caller('b.ts', 'h2', 'bucketKey', 2, 1)],
      impactedEndpoints: [],
      factsByFile: {
        'a.ts': { endpoints: ['GET /x'], crons: [] },
        'b.ts': { endpoints: [], crons: ['job:reset'] },
      },
    });
    expect(normal.summary).toBe('2 changed symbols, 2 callers across 2 files, 1 endpoint, 1 cron job.');

    const noCallers = assembleBlastModel({
      changedSymbols: [symbol('rateLimit')],
      callers: [],
      impactedEndpoints: [],
    });
    expect(noCallers.summary).toBe('1 changed symbol, no downstream callers found.');

    const manyCallers = Array.from({ length: ENGINE_CALLER_CAP }, (_, i) =>
      caller(`f${i}.ts`, 'h', 'rateLimit', i, 1),
    );
    const truncated = assembleBlastModel({
      changedSymbols: [symbol('rateLimit')],
      callers: manyCallers,
      impactedEndpoints: [],
    });
    expect(truncated.summary).toBe(
      `1 changed symbol, ${ENGINE_CALLER_CAP}+ callers across 20 files, 0 endpoints, 0 cron jobs.`,
    );

    const degraded = assembleBlastModel({
      changedSymbols: [symbol('rateLimit')],
      callers: [caller('a.ts', 'h1', 'rateLimit', 1, 1)],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    });
    expect(degraded.summary).toBe(
      'Best-effort (repository not fully indexed): 1 changed symbol, 1 caller across 1 file, 0 endpoints, 0 cron jobs.',
    );
  });

  it('drops a caller whose viaSymbol matches no changed symbol and warns', () => {
    const { logger, lines } = spyLogger();
    const engine: BlastEngineResult = {
      changedSymbols: [symbol('rateLimit')],
      callers: [
        caller('a.ts', 'h1', 'rateLimit', 1, 1),
        caller('b.ts', 'h2', 'ghostSymbol', 2, 1),
      ],
      impactedEndpoints: [],
    };

    const model = assembleBlastModel(engine, logger);

    expect(model.downstream[0]?.callers).toHaveLength(1);
    expect(model.downstream.flatMap((d) => d.callers).some((c) => c.symbol === 'h2')).toBe(false);

    const warned = lines.filter(
      (l) => l.msg === 'blast: caller references an unknown viaSymbol, dropped',
    );
    expect(warned).toHaveLength(1);
    expect(warned[0]?.obj.count).toBe(1);
  });

  it('assembles a DTO via toBlastRadiusDto that safeParses clean against BlastRadiusResponse', () => {
    const engine: BlastEngineResult = {
      changedSymbols: [symbol('rateLimit'), symbol('bucketKey')],
      callers: [
        caller('routes/a.ts', 'h1', 'rateLimit', 10, 3),
        caller('routes/b.ts', 'h2', 'bucketKey', 20, 1),
      ],
      impactedEndpoints: ['GET /api/items'],
      factsByFile: {
        'routes/a.ts': { endpoints: ['GET /api/items'], crons: [] },
        'routes/b.ts': { endpoints: ['GET /api/health'], crons: ['reset-buckets'] },
      },
    };
    const model: BlastModel = assembleBlastModel(engine);
    const history: BlastHistoryRow[] = [
      {
        prNumber: 415,
        title: 'tighten rate limiting',
        author: 'octocat',
        status: 'merged',
        updatedAt: new Date('2026-08-01T00:00:00Z'),
        openedAt: new Date('2026-07-30T00:00:00Z'),
        overlapCount: 2,
        overlapPaths: ['routes/a.ts', 'routes/b.ts'],
      },
    ];

    const dto = toBlastRadiusDto(model, history);
    const parsed = BlastRadiusResponse.safeParse(dto);
    expect(parsed.success).toBe(true);
  });

  it('pins ENGINE_CALLER_CAP against repo-intel MAX_CALLERS_PER_SYMBOL (drift guard)', () => {
    expect(ENGINE_CALLER_CAP).toBe(REPO_INTEL_MAX_CALLERS_PER_SYMBOL);
  });

  it('T3.5 — threads caller.kind through assembleBlastModel and toBlastRadiusDto', () => {
    const engine: BlastEngineResult = {
      changedSymbols: [symbol('DebtItem', 'types.ts', 'interface')],
      callers: [
        caller('a.ts', 'useDebt', 'DebtItem', 10, 3, 'type'),
        caller('b.ts', 'compute', 'DebtItem', 20, 1, 'call'),
        caller('c.ts', 'legacy', 'DebtItem', 30, 0), // no kind — degraded/ripgrep path
      ],
      impactedEndpoints: [],
    };

    const model = assembleBlastModel(engine);
    const downstream = model.downstream.find((d) => d.symbol === 'DebtItem');
    expect(downstream?.callers.find((c) => c.file === 'a.ts')?.kind).toBe('type');
    expect(downstream?.callers.find((c) => c.file === 'b.ts')?.kind).toBe('call');
    expect(downstream?.callers.find((c) => c.file === 'c.ts')?.kind).toBeUndefined();

    const dto = toBlastRadiusDto(model, []);
    const dtoCallers = dto.downstream[0]?.callers ?? [];
    expect(dtoCallers.find((c) => c.file === 'a.ts')?.kind).toBe('type');
    expect(dtoCallers.find((c) => c.file === 'b.ts')?.kind).toBe('call');

    const parsed = BlastRadiusResponse.safeParse(dto);
    expect(parsed.success).toBe(true);
  });
});
