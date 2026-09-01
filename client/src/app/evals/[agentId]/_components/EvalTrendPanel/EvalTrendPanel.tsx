"use client";

import { useTranslations } from "next-intl";
import { LineChart, SectionLabel, type ChartSeries } from "@devdigest/ui";
import type { EvalTrendPoint } from "@devdigest/shared";
import { relativeTime } from "@/lib/time";
import type { MetricField } from "@/lib/evals";
import { formatTrendMetric, trendSeries } from "./helpers";
import { s } from "./styles";

const SERIES: ReadonlyArray<{ field: MetricField; nameKey: string; color: string }> = [
  { field: "recall", nameKey: "legend.recall", color: "var(--accent)" },
  { field: "precision", nameKey: "legend.precision", color: "var(--ok)" },
  { field: "citation_accuracy", nameKey: "legend.citation", color: "var(--warn)" },
];

export interface EvalTrendPanelProps {
  trend: EvalTrendPoint[];
}

export function EvalTrendPanel({ trend }: EvalTrendPanelProps) {
  const t = useTranslations("eval.trendChart");
  const tDashboard = useTranslations("eval.dashboard");

  const legend = (
    <div style={s.legend}>
      {SERIES.map((metric) => (
        <span key={metric.field} style={s.legendItem}>
          <span style={s.legendSwatch(metric.color)} />
          {tDashboard(metric.nameKey)}
        </span>
      ))}
    </div>
  );

  const chartSeries: ChartSeries[] = SERIES.map((metric) => ({
    name: tDashboard(metric.nameKey),
    color: metric.color,
    data: trendSeries(trend, metric.field),
  }));

  return (
    <section style={s.panel} aria-label={tDashboard("metricTrend")}>
      <SectionLabel icon="TrendingUp" right={trend.length > 0 ? legend : undefined}>
        {tDashboard("metricTrend")}
      </SectionLabel>

      {trend.length === 0 ? (
        <p style={s.empty}>{t("empty")}</p>
      ) : (
        <>
          <LineChart series={chartSeries} w={1400} h={260} yMin={0.6} yMax={1} />
          <div style={s.srOnly}>
            <p>{t("summary", { count: trend.length })}</p>
            <ul style={s.pointList}>
              {trend.map((point, index) => (
                <li key={`${point.ran_at}-${index}`}>
                  <span>{relativeTime(point.ran_at)}</span>{" "}
                  <span>
                    {tDashboard("legend.recall")} {formatTrendMetric(point.recall)}
                  </span>{" "}
                  <span>
                    {tDashboard("legend.precision")} {formatTrendMetric(point.precision)}
                  </span>{" "}
                  <span>
                    {tDashboard("legend.citation")} {formatTrendMetric(point.citation_accuracy)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
