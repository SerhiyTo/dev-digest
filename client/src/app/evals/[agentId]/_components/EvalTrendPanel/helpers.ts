import type { EvalTrendPoint } from "@devdigest/shared";
import type { MetricField } from "@/lib/evals";

export function trendSeries(trend: EvalTrendPoint[], field: MetricField): (number | null)[] {
  return trend.map((point) => point[field]);
}

export function formatTrendMetric(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}
