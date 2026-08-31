"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import { Badge, Icon, Sparkline } from "@devdigest/ui";
import {
  METRIC_COLORS,
  METRIC_FIELDS,
  formatMetricPercent,
  metricTrendSeries,
  type MetricField,
} from "@/lib/evals";
import { absoluteTime } from "@/lib/time";
import type { EvalAgentRowRun } from "../../helpers";
import { s } from "./styles";

const NOT_COMPUTED = "—";

const METRIC_LABEL_KEYS: Record<MetricField, string> = {
  recall: "dashboard.legend.recall",
  precision: "dashboard.legend.precision",
  citation_accuracy: "dashboard.legend.citation",
};

export interface EvalAgentRowProps {
  agentId: string;
  agentName: string;
  model?: string;
  caseCount: number;
  latestRun: EvalAgentRowRun | null;
  trend: EvalTrendPoint[];
}

function metricValue(run: EvalAgentRowRun, field: MetricField): number | null {
  if (field === "recall") return run.recall;
  if (field === "precision") return run.precision;
  return run.citationAccuracy;
}

export function EvalAgentRow({
  agentId,
  agentName,
  model,
  caseCount,
  latestRun,
  trend,
}: EvalAgentRowProps) {
  const t = useTranslations("eval");
  const ownsNoCases = caseCount === 0;
  const sparkline = metricTrendSeries(trend, "recall");

  return (
    <li style={s.row} data-agent-id={agentId}>
      <span style={s.avatar} aria-hidden="true">
        <Icon.Cpu size={17} />
      </span>

      <div style={s.identity}>
        <div style={s.nameRow}>
          <Link href={`/evals/${agentId}`} style={s.name}>
            {agentName}
          </Link>
          {model && <Badge mono>{model}</Badge>}
        </div>
        {ownsNoCases ? (
          <span style={s.meta}>
            {t("dashboard.noRuns")}{" "}
            <Link href={`/agents/${agentId}?tab=evals`} style={s.configure}>
              {t("dashboard.configure")}
            </Link>
          </span>
        ) : latestRun == null ? (
          <span style={s.meta}>{t("dashboard.neverRun")}</span>
        ) : (
          <span style={s.meta}>
            {t("dashboard.lastRun")}{" "}
            {latestRun.agentVersion == null
              ? NOT_COMPUTED
              : t("dashboard.agentVersion", { version: latestRun.agentVersion })}{" "}
            · {absoluteTime(latestRun.ranAt)} ·{" "}
            {latestRun.casesPassed == null
              ? NOT_COMPUTED
              : t("dashboard.passedOfTotal", {
                  passed: latestRun.casesPassed,
                  total: latestRun.casesTotal,
                })}
          </span>
        )}
      </div>

      {latestRun != null && sparkline.length > 1 && (
        <span style={s.sparkline} aria-hidden="true">
          <Sparkline data={sparkline} color="var(--accent)" w={92} h={26} />
        </span>
      )}

      {latestRun != null && (
        <div style={s.metrics}>
          {METRIC_FIELDS.map((field) => (
            <div key={field} style={s.metric}>
              <span style={s.metricLabel}>{t(METRIC_LABEL_KEYS[field])}</span>
              <span style={{ ...s.metricValue, color: METRIC_COLORS[field] }}>
                {formatMetricPercent(metricValue(latestRun, field)) ?? NOT_COMPUTED}
              </span>
            </div>
          ))}
        </div>
      )}

      <span style={s.chevron} aria-hidden="true">
        <Icon.ChevronRight size={17} />
      </span>
    </li>
  );
}
