"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, ProgressBar, SectionLabel } from "@devdigest/ui";
import type { EvalRunRecord, EvalSuiteRunRecord } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { absoluteTime, relativeTime } from "@/lib/time";
import {
  METRIC_FIELDS,
  aggregateMetric,
  caseTally,
  casesForRun,
  formatMetricPercent,
  isCancellableRun,
  isCancelledRun,
  isCompareReady,
  isSelectableForCompare,
  metricPercentValue,
  type MetricField,
} from "@/lib/evals";
import { s } from "./styles";

const METRIC_COLUMN_KEYS: Record<MetricField, string> = {
  recall: "table.recall",
  precision: "table.precision",
  citation_accuracy: "table.citation",
};

const METRIC_COLORS: Record<MetricField, string> = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
};

const COLUMN_COUNT = 9;

export interface EvalRunTableProps {
  runs: EvalSuiteRunRecord[];
  caseRuns: EvalRunRecord[];
  selectedRunIds: string[];
  expandedRunId: string | null;
  pendingCancelRunId?: string | null;
  onToggleSelection: (runId: string) => void;
  onToggleExpanded: (runId: string) => void;
  onCancel: (runId: string) => void;
  onCompare: () => void;
  emptyMessage?: string;
}

export function EvalRunTable({
  runs,
  caseRuns,
  selectedRunIds,
  expandedRunId,
  pendingCancelRunId = null,
  onToggleSelection,
  onToggleExpanded,
  onCancel,
  onCompare,
  emptyMessage,
}: EvalRunTableProps) {
  const t = useTranslations("eval.runList");
  const tPage = useTranslations("eval.dashboardPage");
  const tDashboard = useTranslations("eval.dashboard");

  const heading = (
    <SectionLabel
      icon="History"
      right={
        <div style={s.headerRight}>
          <span style={s.selectedCount}>{tPage("selectedCount", { count: selectedRunIds.length })}</span>
          <Button
            kind="primary"
            size="sm"
            icon="Layers"
            aria-label={t("compare")}
            disabled={!isCompareReady(selectedRunIds)}
            onClick={onCompare}
          >
            {tPage("compare")}
          </Button>
        </div>
      }
    >
      {tDashboard("recentRuns")}
    </SectionLabel>
  );

  if (runs.length === 0) {
    return (
      <div style={s.container}>
        {heading}
        <p style={s.empty}>{emptyMessage ?? tDashboard("noRuns")}</p>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {heading}
      <div style={s.scroller}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th} />
              <th style={s.th}>{tDashboard("table.ranAt")}</th>
              <th style={s.th}>{tDashboard("table.version")}</th>
              {METRIC_FIELDS.map((field) => (
                <th key={field} style={s.thMetric}>
                  {tDashboard(METRIC_COLUMN_KEYS[field])}
                </th>
              ))}
              <th style={s.th}>{tDashboard("table.pass")}</th>
              <th style={s.th}>{tDashboard("table.cost")}</th>
              <th style={s.th} />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const cancelled = isCancelledRun(run);
              const open = expandedRunId === run.id;
              const tally = caseTally(run);
              const cancelling = pendingCancelRunId === run.id;

              return (
                <Fragment key={run.id}>
                  <tr style={s.tr}>
                    <td style={s.tdCheckbox}>
                      {isSelectableForCompare(run) && (
                        <Checkbox
                          hideLabel
                          checked={selectedRunIds.includes(run.id)}
                          onChange={() => onToggleSelection(run.id)}
                          label={t("selectRun", { time: relativeTime(run.started_at) })}
                        />
                      )}
                    </td>
                    <td style={s.td}>
                      <button
                        type="button"
                        className="mono"
                        style={s.timeButton}
                        aria-expanded={open}
                        onClick={() => onToggleExpanded(run.id)}
                      >
                        {absoluteTime(run.started_at)}
                      </button>
                    </td>
                    <td style={s.td}>
                      <span style={s.version}>{tDashboard("agentVersion", { version: run.agent_version })}</span>
                    </td>
                    {METRIC_FIELDS.map((field) => {
                      const value = aggregateMetric(run, field);
                      const percent = metricPercentValue(value);
                      return (
                        <td key={field} style={s.td}>
                          <div style={s.metricCell}>
                            <div style={s.metricBar} data-metric-bar={percent != null}>
                              {percent != null && (
                                <ProgressBar value={percent} color={METRIC_COLORS[field]} />
                              )}
                            </div>
                            <span className="tnum" style={s.metricValue}>
                              {formatMetricPercent(value) ?? "—"}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    <td style={s.td}>
                      {cancelled && <span style={s.cancelledBadge}>{t("cancelled")}</span>}
                      {!cancelled && tally && (
                        <>
                          <span className="tnum" style={s.pass} aria-hidden="true">
                            {tally.passed}/{tally.total}
                          </span>
                          <span style={s.srOnly}>
                            {tDashboard("passedOfTotal", { passed: tally.passed, total: tally.total })}
                          </span>
                        </>
                      )}
                      {!cancelled && !tally && "—"}
                    </td>
                    <td style={s.td}>
                      <span className="mono tnum" style={s.cost}>
                        {formatCost(cancelled ? null : run.cost_usd)}
                      </span>
                    </td>
                    <td style={s.td}>
                      {isCancellableRun(run) && (
                        <Button
                          kind="ghost"
                          size="sm"
                          disabled={cancelling}
                          onClick={() => onCancel(run.id)}
                        >
                          {cancelling ? t("cancelling") : t("cancel")}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td style={s.detailCell} colSpan={COLUMN_COUNT}>
                        <div style={s.detail}>
                          <h4 style={s.detailHeading}>{t("perCaseHeading")}</h4>
                          <ul style={s.caseList}>
                            {casesForRun(caseRuns, run.id).map((caseRun) => (
                              <li key={caseRun.id} style={s.caseRow}>
                                <span style={s.caseName}>{caseRun.case_name ?? caseRun.case_id}</span>
                                <span>
                                  {caseRun.pass === null
                                    ? "—"
                                    : caseRun.pass
                                      ? tDashboard("pass")
                                      : tDashboard("fail")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
