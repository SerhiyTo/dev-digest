import {
  ENGINE_CALLER_CAP,
  MAX_CALLERS_PER_SYMBOL,
  MAX_CHANGED_SYMBOLS,
  MAX_DOWNSTREAM,
  MAX_FACTS_PER_SYMBOL,
  MAX_LOGGED_ORPHAN_SAMPLES,
  MAX_ROLLUP,
} from './constants.js';
import type {
  BlastEngineCaller,
  BlastEngineChangedSymbol,
  BlastEngineResult,
  Logger,
} from './ports.js';

export interface BlastModelSymbol {
  name: string;
  file: string;
  kind: string;
}

export interface BlastModelCaller {
  file: string;
  symbol: string;
  line: number;
  rank: number;
  kind?: 'call' | 'type';
}

export interface BlastModelDownstream {
  symbol: string;
  callers: BlastModelCaller[];
  endpointsAffected: string[];
  cronsAffected: string[];
}

export interface BlastModel {
  changedSymbols: BlastModelSymbol[];
  downstream: BlastModelDownstream[];
  summary: string;
  endpointsAffected: string[];
  cronsAffected: string[];
  truncated: boolean;
  degraded: boolean;
  reason: string;
}

function dedupChangedSymbols(
  symbols: readonly BlastEngineChangedSymbol[],
): BlastEngineChangedSymbol[] {
  const seen = new Set<string>();
  const out: BlastEngineChangedSymbol[] = [];
  for (const symbol of symbols) {
    const key = `${symbol.name}|${symbol.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(symbol);
  }
  return out;
}

function dedupCallers(callers: readonly BlastEngineCaller[]): BlastEngineCaller[] {
  const seen = new Set<string>();
  const out: BlastEngineCaller[] = [];
  for (const caller of callers) {
    const key = `${caller.file}|${caller.symbol}|${caller.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(caller);
  }
  return out;
}

function compareCallers(a: BlastEngineCaller, b: BlastEngineCaller): number {
  if (a.rank !== b.rank) return b.rank - a.rank;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.line - b.line;
}

function groupBySymbol(callers: readonly BlastEngineCaller[]): Map<string, BlastEngineCaller[]> {
  const groups = new Map<string, BlastEngineCaller[]>();
  for (const caller of callers) {
    const bucket = groups.get(caller.viaSymbol);
    if (bucket) bucket.push(caller);
    else groups.set(caller.viaSymbol, [caller]);
  }
  for (const bucket of groups.values()) bucket.sort(compareCallers);
  return groups;
}

function attributeFacts(
  files: readonly string[],
  factsByFile: Record<string, { endpoints: string[]; crons: string[] }> | undefined,
): { endpoints: string[]; crons: string[] } {
  if (!factsByFile) return { endpoints: [], crons: [] };
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const file of files) {
    const facts = factsByFile[file];
    if (!facts) continue;
    for (const endpoint of facts.endpoints) endpoints.add(endpoint);
    for (const cron of facts.crons) crons.add(cron);
  }
  return {
    endpoints: [...endpoints].sort().slice(0, MAX_FACTS_PER_SYMBOL),
    crons: [...crons].sort().slice(0, MAX_FACTS_PER_SYMBOL),
  };
}

function maxRank(callers: readonly BlastModelCaller[]): number {
  let max = 0;
  for (const caller of callers) if (caller.rank > max) max = caller.rank;
  return max;
}

function compareDownstream(a: BlastModelDownstream, b: BlastModelDownstream): number {
  if (a.callers.length !== b.callers.length) return b.callers.length - a.callers.length;
  const rankDiff = maxRank(b.callers) - maxRank(a.callers);
  if (rankDiff !== 0) return rankDiff;
  return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function buildSummary(input: {
  changedSymbolCount: number;
  callerCount: number;
  fileCount: number;
  endpointCount: number;
  cronCount: number;
  truncated: boolean;
  degraded: boolean;
}): string {
  const prefix = input.degraded ? 'Best-effort (repository not fully indexed): ' : '';
  const symbolsPart = plural(input.changedSymbolCount, 'changed symbol');

  if (input.callerCount === 0) {
    return `${prefix}${symbolsPart}, no downstream callers found.`;
  }

  const callersPart = input.truncated
    ? `${ENGINE_CALLER_CAP}+ callers`
    : plural(input.callerCount, 'caller');
  const filesPart = plural(input.fileCount, 'file');
  const endpointsPart = plural(input.endpointCount, 'endpoint');
  const cronsPart = plural(input.cronCount, 'cron job');

  return `${prefix}${symbolsPart}, ${callersPart} across ${filesPart}, ${endpointsPart}, ${cronsPart}.`;
}

export function assembleBlastModel(engine: BlastEngineResult, log?: Logger): BlastModel {
  const dedupedSymbols = dedupChangedSymbols(engine.changedSymbols);
  const changedSymbols = dedupedSymbols.slice(0, MAX_CHANGED_SYMBOLS);
  if (dedupedSymbols.length > MAX_CHANGED_SYMBOLS) {
    log?.warn(
      { total: dedupedSymbols.length, cap: MAX_CHANGED_SYMBOLS },
      'blast: changed symbols truncated to cap',
    );
  }
  const symbolNames = new Set(changedSymbols.map((symbol) => symbol.name));

  const dedupedCallers = dedupCallers(engine.callers);
  const orphanCallers = dedupedCallers.filter((caller) => !symbolNames.has(caller.viaSymbol));
  if (orphanCallers.length > 0) {
    log?.warn(
      { count: orphanCallers.length, sample: orphanCallers.slice(0, MAX_LOGGED_ORPHAN_SAMPLES) },
      'blast: caller references an unknown viaSymbol, dropped',
    );
  }
  const attributedCallers = dedupedCallers.filter((caller) => symbolNames.has(caller.viaSymbol));
  const groups = groupBySymbol(attributedCallers);

  const allFiles = new Set<string>();
  for (const caller of attributedCallers) allFiles.add(caller.file);

  const downstream: BlastModelDownstream[] = changedSymbols.map((symbol) => {
    const group = groups.get(symbol.name) ?? [];
    if (group.length > MAX_CALLERS_PER_SYMBOL) {
      log?.warn(
        {
          symbol: symbol.name,
          total: group.length,
          cap: MAX_CALLERS_PER_SYMBOL,
          sample: group.slice(0, MAX_LOGGED_ORPHAN_SAMPLES),
        },
        'blast: callers truncated to per-symbol cap',
      );
    }
    const capped = group.slice(0, MAX_CALLERS_PER_SYMBOL);
    const facts = attributeFacts([...new Set(group.map((caller) => caller.file))], engine.factsByFile);

    return {
      symbol: symbol.name,
      callers: capped.map((caller) => ({
        file: caller.file,
        symbol: caller.symbol,
        line: caller.line,
        rank: caller.rank,
        kind: caller.kind,
      })),
      endpointsAffected: facts.endpoints,
      cronsAffected: facts.crons,
    };
  });

  downstream.sort(compareDownstream);
  if (downstream.length > MAX_DOWNSTREAM) {
    log?.warn(
      { total: downstream.length, cap: MAX_DOWNSTREAM },
      'blast: downstream symbols truncated to cap',
    );
  }
  const cappedDownstream = downstream.slice(0, MAX_DOWNSTREAM);

  const degraded = engine.degraded === true;
  const reason = engine.reason ?? '';

  let endpointsAffected: string[];
  let cronsAffected: string[];
  if (engine.factsByFile) {
    const endpointSet = new Set<string>();
    const cronSet = new Set<string>();
    for (const symbol of downstream) {
      for (const endpoint of symbol.endpointsAffected) endpointSet.add(endpoint);
      for (const cron of symbol.cronsAffected) cronSet.add(cron);
    }
    const sortedEndpoints = [...endpointSet].sort();
    const sortedCrons = [...cronSet].sort();
    if (sortedEndpoints.length > MAX_ROLLUP) {
      log?.warn(
        { total: sortedEndpoints.length, cap: MAX_ROLLUP },
        'blast: endpoints_affected truncated to cap',
      );
    }
    if (sortedCrons.length > MAX_ROLLUP) {
      log?.warn(
        { total: sortedCrons.length, cap: MAX_ROLLUP },
        'blast: crons_affected truncated to cap',
      );
    }
    endpointsAffected = sortedEndpoints.slice(0, MAX_ROLLUP);
    cronsAffected = sortedCrons.slice(0, MAX_ROLLUP);
  } else {
    endpointsAffected = [...engine.impactedEndpoints];
    cronsAffected = [];
  }

  const truncated = engine.callers.length >= ENGINE_CALLER_CAP;

  const summary = buildSummary({
    changedSymbolCount: changedSymbols.length,
    callerCount: attributedCallers.length,
    fileCount: allFiles.size,
    endpointCount: endpointsAffected.length,
    cronCount: cronsAffected.length,
    truncated,
    degraded,
  });

  return {
    changedSymbols: changedSymbols.map((symbol) => ({
      name: symbol.name,
      file: symbol.file,
      kind: symbol.kind,
    })),
    downstream: cappedDownstream,
    summary,
    endpointsAffected,
    cronsAffected,
    truncated,
    degraded,
    reason,
  };
}
