import type { ConventionCandidate, ConventionScanState } from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from './repository.js';
import type { DroppedConvention } from './grounding.js';

/**
 * Row → DTO mappers. Nullable metrics are passed through untouched: `null`
 * means "not measured" and the UI omits the chip, where a `0` would claim a
 * measurement that never happened.
 */

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence: row.evidence ?? [],
    occurrence_files: row.occurrenceFiles,
    confidence: row.confidence ?? 0,
    status: row.status,
  };
}

export function toScanStateDto(row: ConventionScanRow | undefined): ConventionScanState {
  if (!row) {
    return {
      status: 'never',
      sampled_files: 0,
      selected_files: 0,
      candidate_count: 0,
      dropped_count: 0,
      dropped_reasons: {},
    };
  }
  return {
    status: row.status,
    sampled_files: row.sampledFiles,
    selected_files: row.selectedFiles?.length ?? 0,
    candidate_count: row.candidateCount,
    dropped_count: row.droppedCount,
    dropped_reasons: row.droppedReasons ?? {},
    path_prefix: row.pathPrefix,
    cost_usd: row.costUsd,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    model: row.model,
    last_scan_at: (row.finishedAt ?? row.startedAt).toISOString(),
    degraded_reason: row.degradedReason,
    error: row.error,
  };
}

export function countDropReasons(dropped: readonly DroppedConvention[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of dropped) counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
  return counts;
}

/** Sum a metric across the pipeline's model calls, staying null when nothing reported one. */
export function sumNullable(values: readonly (number | null | undefined)[]): number | null {
  const present = values.filter((value): value is number => typeof value === 'number');
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}
