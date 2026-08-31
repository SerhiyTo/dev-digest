import type { EvalMetricDiff } from "@devdigest/shared";

export interface EvalCompareRunInput {
  runId: string;
  ranAt: string;
  agentVersion: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
}

export interface OrderedCompareRuns {
  older: EvalCompareRunInput;
  newer: EvalCompareRunInput;
}

export function orderRunsByAge(
  runA: EvalCompareRunInput,
  runB: EvalCompareRunInput,
): OrderedCompareRuns {
  const timeA = Date.parse(runA.ranAt);
  const timeB = Date.parse(runB.ranAt);
  return timeA <= timeB ? { older: runA, newer: runB } : { older: runB, newer: runA };
}

export function diffMetric(older: number | null, newer: number | null): EvalMetricDiff {
  return {
    older,
    newer,
    diff: older != null && newer != null ? newer - older : null,
  };
}

export function isSameAgentVersion(older: EvalCompareRunInput, newer: EvalCompareRunInput): boolean {
  return older.agentVersion === newer.agentVersion;
}

export type PromptDiffState = "unavailable" | "same_version" | "unchanged" | "patch";

export function promptDiffState(promptDiff: string | null, sameVersion: boolean): PromptDiffState {
  if (promptDiff === null) return "unavailable";
  if (sameVersion) return "same_version";
  if (promptDiff.trim() === "") return "unchanged";
  return "patch";
}
