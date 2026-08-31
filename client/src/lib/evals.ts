import type { EvalRunRecord, EvalSuiteRunRecord, EvalTrendPoint } from "@devdigest/shared";

export type MetricField = "recall" | "precision" | "citation_accuracy";

export const METRIC_FIELDS: MetricField[] = ["recall", "precision", "citation_accuracy"];

export const METRIC_COLORS: Record<MetricField, string> = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
};

export const METRIC_LABEL_KEYS: Record<MetricField, string> = {
  recall: "metrics.recall",
  precision: "metrics.precision",
  citation_accuracy: "metrics.citationAccuracy",
};

export interface EvalMetricSnapshot {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

export function formatMetricPercent(value: number | null): string | null {
  if (value == null) return null;
  return `${Math.round(value * 100)}%`;
}

export function metricPercentValue(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 100);
}

export function metricTrendSeries(trend: EvalTrendPoint[], field: MetricField): number[] {
  return trend.map((point) => point[field]).filter((value): value is number => value != null);
}

export function metricDeltaPoints(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 100);
}

export function metricDeltaFraction(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

export type DeltaLabelKey = "deltaUp" | "deltaDown" | "deltaFlat";

export interface DeltaLabelDescriptor {
  key: DeltaLabelKey;
  amount: number;
}

export function deltaLabelDescriptor(points: number | null): DeltaLabelDescriptor | null {
  if (points == null) return null;
  if (points === 0) return { key: "deltaFlat", amount: 0 };
  return { key: points > 0 ? "deltaUp" : "deltaDown", amount: Math.abs(points) };
}

export interface FallenMetric {
  field: MetricField;
  amount: number;
}

export function fallenMetrics(
  current: EvalMetricSnapshot,
  previous: EvalMetricSnapshot | null,
): FallenMetric[] {
  if (previous == null) return [];
  return METRIC_FIELDS.reduce<FallenMetric[]>((acc, field) => {
    const delta = metricDeltaPoints(current[field], previous[field]);
    if (delta != null && delta < 0) acc.push({ field, amount: Math.abs(delta) });
    return acc;
  }, []);
}

export function completedRunsNewestFirst(runs: EvalSuiteRunRecord[]): EvalSuiteRunRecord[] {
  return runs
    .filter((run) => run.status === "done")
    .slice()
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

const EMPTY_SNAPSHOT: EvalMetricSnapshot = { recall: null, precision: null, citation_accuracy: null };

function metricSnapshotFor(run: EvalSuiteRunRecord | undefined): EvalMetricSnapshot | null {
  if (!run) return null;
  return { recall: run.recall, precision: run.precision, citation_accuracy: run.citation_accuracy };
}

export function currentAndPreviousSnapshots(runs: EvalSuiteRunRecord[]): {
  current: EvalMetricSnapshot;
  previous: EvalMetricSnapshot | null;
} {
  const completed = completedRunsNewestFirst(runs);
  return {
    current: metricSnapshotFor(completed[0]) ?? EMPTY_SNAPSHOT,
    previous: metricSnapshotFor(completed[1]),
  };
}

export function isAnyRunActive(runs: EvalSuiteRunRecord[]): boolean {
  return runs.some((run) => run.status === "running");
}

export function findRunById(runs: EvalSuiteRunRecord[], id: string): EvalSuiteRunRecord | undefined {
  return runs.find((run) => run.id === id);
}

export function isCancelledRun(run: EvalSuiteRunRecord): boolean {
  return run.status === "cancelled";
}

export function isCancellableRun(run: EvalSuiteRunRecord): boolean {
  return run.status === "running";
}

export function isSelectableForCompare(run: EvalSuiteRunRecord): boolean {
  return run.status === "done";
}

export function aggregateMetric(run: EvalSuiteRunRecord, field: MetricField): number | null {
  return isCancelledRun(run) ? null : run[field];
}

export function casesForRun(caseRuns: EvalRunRecord[], suiteRunId: string): EvalRunRecord[] {
  return caseRuns.filter((caseRun) => caseRun.suite_run_id === suiteRunId);
}

export function gotFindingCount(actualOutput: unknown): number | null {
  if (typeof actualOutput !== "object" || actualOutput === null) return null;
  const findings = (actualOutput as { findings?: unknown }).findings;
  return Array.isArray(findings) ? findings.length : null;
}

export function gotFindingCountByCase(caseRuns: EvalRunRecord[]): Map<string, number> {
  return caseRuns.reduce<Map<string, number>>((acc, run) => {
    const count = gotFindingCount(run.actual_output);
    if (count !== null && !acc.has(run.case_id)) acc.set(run.case_id, count);
    return acc;
  }, new Map());
}

export interface RunCaseTally {
  passed: number;
  total: number;
}

export function caseTally(run: EvalSuiteRunRecord): RunCaseTally | null {
  if (run.cases_passed === null || run.cases_total === null) return null;
  return { passed: run.cases_passed, total: run.cases_total };
}

export function isCompareReady(selectedRunIds: readonly string[]): boolean {
  return selectedRunIds.length === 2;
}

export function toggleSelection(selected: string[], runId: string): string[] {
  return selected.includes(runId) ? selected.filter((id) => id !== runId) : [...selected, runId];
}
