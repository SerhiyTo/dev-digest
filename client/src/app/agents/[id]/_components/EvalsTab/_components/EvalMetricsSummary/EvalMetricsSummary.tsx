"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MetricCard, SectionLabel } from "@devdigest/ui";
import {
  METRIC_COLORS,
  METRIC_FIELDS,
  METRIC_LABEL_KEYS,
  deltaLabelDescriptor,
  metricDeltaPoints,
  metricPercentValue,
  type EvalMetricSnapshot,
  type RunCaseTally,
} from "@/lib/evals";
import { s } from "./styles";

export interface EvalMetricsSummaryProps {
  agentId: string;
  current: EvalMetricSnapshot;
  previous: EvalMetricSnapshot | null;
  tally: RunCaseTally | null;
  hasCompletedRun: boolean;
}

export function EvalMetricsSummary({
  agentId,
  current,
  previous,
  tally,
  hasCompletedRun,
}: EvalMetricsSummaryProps) {
  const t = useTranslations("eval.metricStrip");
  const tDashboard = useTranslations("eval.dashboard");
  const tTab = useTranslations("eval.evalsTab");

  return (
    <div style={s.container}>
      <SectionLabel
        icon="Gauge"
        right={
          <Link href={`/evals/${agentId}`} style={s.dashboardLink}>
            {tDashboard("openDashboard")}
          </Link>
        }
      >
        {tTab("metricsTitle")}
      </SectionLabel>

      {!hasCompletedRun && <p style={s.neverRun}>{tDashboard("neverRun")}</p>}

      {hasCompletedRun && (
        <>
          <div style={s.row}>
            {METRIC_FIELDS.map((field) => {
              const percent = metricPercentValue(current[field]);
              const deltaPoints = previous ? metricDeltaPoints(current[field], previous[field]) : null;
              const deltaLabel = deltaLabelDescriptor(deltaPoints);
              return (
                <MetricCard
                  key={field}
                  label={tDashboard(METRIC_LABEL_KEYS[field])}
                  value={percent ?? t("notComputed")}
                  suffix={percent == null ? undefined : "%"}
                  delta={deltaPoints ?? undefined}
                  deltaLabel={deltaLabel ? t(deltaLabel.key, { amount: deltaLabel.amount }) : undefined}
                  color={METRIC_COLORS[field]}
                />
              );
            })}
            <MetricCard
              label={tDashboard("metrics.tracesPassed")}
              value={tally == null ? t("notComputed") : `${tally.passed}/${tally.total}`}
            />
          </div>
          {previous === null && <p style={s.note}>{t("noPreviousRun")}</p>}
        </>
      )}
    </div>
  );
}
