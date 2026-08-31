import type { EvalSuiteRunRecord, EvalTrendPoint } from "@devdigest/shared";
import type { EvalCompareRunInput } from "./_components/EvalCompareModal";

export type EvalRangeDays = 7 | 30 | 90 | null;

export const EVAL_RANGE_OPTIONS: readonly EvalRangeDays[] = [7, 30, 90, null];

export const DEFAULT_EVAL_RANGE: EvalRangeDays = 30;

const DAY_MS = 86_400_000;

export function rangeLabelKey(days: EvalRangeDays): "d7" | "d30" | "d90" | "all" {
  if (days === 7) return "d7";
  if (days === 30) return "d30";
  if (days === 90) return "d90";
  return "all";
}

function withinRange(iso: string, days: EvalRangeDays, now: number): boolean {
  if (days == null) return true;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return true;
  return now - at <= days * DAY_MS;
}

export function filterRunsByRange(
  runs: EvalSuiteRunRecord[],
  days: EvalRangeDays,
  now: number = Date.now(),
): EvalSuiteRunRecord[] {
  if (days == null) return runs;
  return runs.filter((run) => withinRange(run.started_at, days, now));
}

export function filterTrendByRange(
  trend: EvalTrendPoint[],
  days: EvalRangeDays,
  now: number = Date.now(),
): EvalTrendPoint[] {
  if (days == null) return trend;
  return trend.filter((point) => withinRange(point.ran_at, days, now));
}

export function toCompareRunInput(run: EvalSuiteRunRecord): EvalCompareRunInput {
  return {
    runId: run.id,
    ranAt: run.started_at,
    agentVersion: run.agent_version,
    recall: run.recall,
    precision: run.precision,
    citationAccuracy: run.citation_accuracy,
    costUsd: run.cost_usd,
  };
}
