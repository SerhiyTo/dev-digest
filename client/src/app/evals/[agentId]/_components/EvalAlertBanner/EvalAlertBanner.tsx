"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { fallenMetrics, type EvalMetricSnapshot, type MetricField } from "@/lib/evals";
import { s } from "./styles";

const METRIC_NAME_KEYS: Record<MetricField, string> = {
  recall: "legend.recall",
  precision: "legend.precision",
  citation_accuracy: "legend.citation",
};

export interface EvalAlertBannerProps {
  current: EvalMetricSnapshot;
  previous: EvalMetricSnapshot | null;
  alert: string | null;
}

export function EvalAlertBanner({ current, previous, alert }: EvalAlertBannerProps) {
  const t = useTranslations("eval.metricStrip");
  const tDashboard = useTranslations("eval.dashboard");
  const fallen = fallenMetrics(current, previous);

  if (fallen.length === 0 && !alert) return null;

  return (
    <div role="status" style={s.banner}>
      <Icon.AlertTriangle size={16} style={s.icon} />
      <div style={s.body}>
        {fallen.length > 0 && (
          <>
            <p style={s.title}>{t("regressionBannerTitle")}</p>
            <ul style={s.list}>
              {fallen.map((item) => (
                <li key={item.field} style={s.item}>
                  {t("regressionItem", {
                    metric: tDashboard(METRIC_NAME_KEYS[item.field]),
                    amount: item.amount,
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
        {alert && <p style={s.note}>{alert}</p>}
      </div>
    </div>
  );
}
