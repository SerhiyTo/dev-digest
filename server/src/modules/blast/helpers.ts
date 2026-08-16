import type { BlastModel } from './assemble.js';
import type { BlastHistoryRow } from './ports.js';
import { MAX_OVERLAP_PATHS_PER_PR } from './constants.js';

export interface BlastRadiusDto {
  changed_symbols: { name: string; file: string; kind: string }[];
  downstream: {
    symbol: string;
    callers: { name: string; file: string; line: number; kind?: 'call' | 'type' }[];
    endpoints_affected: string[];
    crons_affected: string[];
  }[];
  summary: string;
  endpoints_affected: string[];
  crons_affected: string[];
  history: {
    pr_number: number;
    title: string;
    merged_at: string;
    author: string;
    files_overlap: string[];
    notes: string;
  }[];
  truncated: boolean;
  degraded: boolean;
  reason: string;
}

function toHistoryItem(row: BlastHistoryRow): BlastRadiusDto['history'][number] {
  const mergedAt = row.updatedAt ?? row.openedAt ?? new Date(0);
  return {
    pr_number: row.prNumber,
    title: row.title,
    merged_at: mergedAt.toISOString(),
    author: row.author,
    files_overlap: row.overlapPaths.slice(0, MAX_OVERLAP_PATHS_PER_PR),
    notes: row.status,
  };
}

export function toBlastRadiusDto(
  model: BlastModel,
  history: readonly BlastHistoryRow[],
): BlastRadiusDto {
  return {
    changed_symbols: model.changedSymbols,
    downstream: model.downstream.map((symbol) => ({
      symbol: symbol.symbol,
      callers: symbol.callers.map((caller) => ({
        name: caller.symbol,
        file: caller.file,
        line: caller.line,
        kind: caller.kind,
      })),
      endpoints_affected: symbol.endpointsAffected,
      crons_affected: symbol.cronsAffected,
    })),
    summary: model.summary,
    endpoints_affected: model.endpointsAffected,
    crons_affected: model.cronsAffected,
    history: history.map(toHistoryItem),
    truncated: model.truncated,
    degraded: model.degraded,
    reason: model.reason,
  };
}
