"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ProgressBar } from "@devdigest/ui";
import {
  METRIC_COLORS,
  METRIC_FIELDS,
  aggregateMetric,
  caseTally,
  metricPercentValue,
  type MetricField,
} from "@/lib/evals";
import { absoluteTime } from "@/lib/time";
import type { RecentRunAcrossAgents } from "../../helpers";
import { s } from "./styles";

const NOT_COMPUTED = "—";

const METRIC_HEADER_KEYS: Record<MetricField, string> = {
  recall: "table.recall",
  precision: "table.precision",
  citation_accuracy: "table.citation",
};

export interface EvalRecentRunsTableProps {
  runs: RecentRunAcrossAgents[];
  agentNameFor: (agentId: string) => string;
}

export function EvalRecentRunsTable({ runs, agentNameFor }: EvalRecentRunsTableProps) {
  const t = useTranslations("eval.dashboard");

  if (runs.length === 0) return <p style={s.empty}>{t("noRuns")}</p>;

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>{t("table.agent")}</th>
          <th style={s.th}>{t("table.ranAt")}</th>
          <th style={s.th}>{t("table.version")}</th>
          {METRIC_FIELDS.map((field) => (
            <th key={field} style={s.th}>
              {t(METRIC_HEADER_KEYS[field])}
            </th>
          ))}
          <th style={s.th}>{t("table.pass")}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map(({ run, agentId }) => {
          const tally = caseTally(run);
          return (
            <tr key={run.id}>
              <td style={{ ...s.td, ...s.agent }}>{agentNameFor(agentId)}</td>
              <td style={{ ...s.td, ...s.time }} className="tnum">
                {absoluteTime(run.started_at)}
              </td>
              <td style={s.td}>
                <Link href={`/evals/${agentId}`} style={s.version} className="mono">
                  {t("agentVersion", { version: run.agent_version })}
                </Link>
              </td>
              {METRIC_FIELDS.map((field) => {
                const percent = metricPercentValue(aggregateMetric(run, field));
                return (
                  <td key={field} style={s.td}>
                    <span style={s.metricCell}>
                      <span style={s.bar} data-metric-bar={percent != null}>
                        {percent != null && (
                          <ProgressBar value={percent} color={METRIC_COLORS[field]} />
                        )}
                      </span>
                      <span style={s.metricValue} className="tnum">
                        {percent == null ? NOT_COMPUTED : `${percent}%`}
                      </span>
                    </span>
                  </td>
                );
              })}
              <td style={{ ...s.td, ...s.tally }} className="tnum">
                {tally == null ? NOT_COMPUTED : `${tally.passed}/${tally.total}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
