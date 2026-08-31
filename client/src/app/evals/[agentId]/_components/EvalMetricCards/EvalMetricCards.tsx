"use client";

import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { EvalTrendPoint } from "@devdigest/shared";
import {
  METRIC_COLORS,
  METRIC_FIELDS,
  METRIC_LABEL_KEYS,
  deltaLabelDescriptor,
  metricDeltaPoints,
  metricPercentValue,
  metricTrendSeries,
  type EvalMetricSnapshot,
} from "@/lib/evals";
import { s } from "./styles";

export interface EvalMetricCardsProps {
  current: EvalMetricSnapshot;
  previous: EvalMetricSnapshot | null;
  trend: EvalTrendPoint[];
  hasCompletedRun: boolean;
}

export function EvalMetricCards({ current, previous, trend, hasCompletedRun }: EvalMetricCardsProps) {
  const t = useTranslations("eval.metricStrip");
  const tDashboard = useTranslations("eval.dashboard");

  if (!hasCompletedRun) {
    return <p style={s.neverRun}>{tDashboard("neverRun")}</p>;
  }

  return (
    <div style={s.container}>
      <div style={s.row}>
        {METRIC_FIELDS.map((field) => {
          const percent = metricPercentValue(current[field]);
          const deltaPoints = previous ? metricDeltaPoints(current[field], previous[field]) : null;
          const deltaLabel = deltaLabelDescriptor(deltaPoints);
          const sparkline = metricTrendSeries(trend, field);
          return (
            <MetricCard
              key={field}
              label={tDashboard(METRIC_LABEL_KEYS[field])}
              value={percent ?? t("notComputed")}
              suffix={percent == null ? undefined : "%"}
              delta={deltaPoints ?? undefined}
              deltaLabel={deltaLabel ? t(deltaLabel.key, { amount: deltaLabel.amount }) : undefined}
              color={METRIC_COLORS[field]}
              trend={sparkline.length > 1 ? sparkline : undefined}
            />
          );
        })}
      </div>
      {previous === null && <p style={s.note}>{t("noPreviousRun")}</p>}
    </div>
  );
}
