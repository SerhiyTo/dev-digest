"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import {
  useCancelEvalSuiteRun,
  useEvalCompare,
  useEvalDashboard,
  useEvalSuiteRun,
  useEvalSuiteRuns,
  useStartEvalSuiteRun,
} from "@/lib/hooks/evals";
import {
  currentAndPreviousSnapshots,
  findRunById,
  isAnyRunActive,
  toggleSelection,
} from "@/lib/evals";
import { EvalDashboardHeader } from "./_components/EvalDashboardHeader";
import { EvalAlertBanner } from "./_components/EvalAlertBanner";
import { EvalMetricCards } from "./_components/EvalMetricCards";
import { EvalTrendPanel } from "./_components/EvalTrendPanel";
import { EvalRunTable } from "./_components/EvalRunTable";
import { EvalCompareModal } from "./_components/EvalCompareModal";
import {
  DEFAULT_EVAL_RANGE,
  filterRunsByRange,
  filterTrendByRange,
  toCompareRunInput,
  type EvalRangeDays,
} from "./helpers";
import { s } from "./styles";

export default function AgentEvalDashboardPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const router = useRouter();
  const t = useTranslations("eval");

  const [range, setRange] = useState<EvalRangeDays>(DEFAULT_EVAL_RANGE);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const agentQuery = useAgent(agentId);
  const agentsQuery = useAgents();
  const dashboardQuery = useEvalDashboard(agentId);
  const suiteRunsQuery = useEvalSuiteRuns(agentId);
  const expandedRunQuery = useEvalSuiteRun(expandedRunId);

  const startSuite = useStartEvalSuiteRun();
  const cancelSuite = useCancelEvalSuiteRun();

  const allRuns = useMemo(() => suiteRunsQuery.data?.runs ?? [], [suiteRunsQuery.data]);
  const runs = useMemo(() => filterRunsByRange(allRuns, range), [allRuns, range]);
  const trend = useMemo(
    () => filterTrendByRange(dashboardQuery.data?.trend ?? [], range),
    [dashboardQuery.data, range],
  );
  const caseRuns = useMemo(() => expandedRunQuery.data?.runs ?? [], [expandedRunQuery.data]);
  const { current, previous } = useMemo(() => currentAndPreviousSnapshots(runs), [runs]);

  const compareRunIds = selectedRunIds.length === 2 ? selectedRunIds : null;
  const compareQuery = useEvalCompare(agentId, compareRunIds?.[0] ?? null, compareRunIds?.[1] ?? null);
  const compareRunA = compareRunIds ? findRunById(runs, compareRunIds[0]!) : undefined;
  const compareRunB = compareRunIds ? findRunById(runs, compareRunIds[1]!) : undefined;
  const comparePromptUnavailable = compareQuery.data?.prompt_diff_unavailable ?? true;
  const comparePrompt = comparePromptUnavailable ? null : (compareQuery.data?.prompt_diff ?? null);

  const agent = agentQuery.data;
  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/evals" },
    { label: agent?.name ?? "" },
  ];

  if (agentQuery.isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("dashboardPage.agentLoadError")}
          body={agentQuery.error instanceof ApiError ? agentQuery.error.message : undefined}
          onRetry={() => agentQuery.refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/evals" style={s.backLink}>
          <Icon.ChevronLeft size={14} />
          {t("dashboardPage.backToEvals")}
        </Link>

        {!agent ? (
          <div style={s.loadingStack}>
            <Skeleton height={64} />
            <div style={s.loadingRow}>
              <Skeleton height={110} />
              <Skeleton height={110} />
              <Skeleton height={110} />
            </div>
            <Skeleton height={280} />
          </div>
        ) : (
          <>
            <EvalDashboardHeader
              agent={agent}
              agents={agentsQuery.data ?? []}
              runCount={runs.length}
              caseCount={dashboardQuery.data?.cases_total ?? 0}
              range={range}
              onRangeChange={setRange}
              onSelectAgent={(id) => router.push(`/evals/${id}`)}
              onRunEval={() => startSuite.mutate(agentId)}
              runActive={isAnyRunActive(allRuns)}
              startPending={startSuite.isPending}
            />

            <EvalAlertBanner
              current={current}
              previous={previous}
              alert={dashboardQuery.data?.alert ?? null}
            />

            {dashboardQuery.isError || suiteRunsQuery.isError ? (
              <ErrorState
                title={t("evalsTab.metricsTitle")}
                onRetry={() => {
                  dashboardQuery.refetch();
                  suiteRunsQuery.refetch();
                }}
              />
            ) : dashboardQuery.isLoading || suiteRunsQuery.isLoading ? (
              <div style={s.loadingStack}>
                <Skeleton height={110} />
                <Skeleton height={280} />
                <Skeleton height={220} />
              </div>
            ) : (
              <>
                <EvalMetricCards
                  current={current}
                  previous={previous}
                  trend={trend}
                  hasCompletedRun={runs.some((run) => run.status === "done")}
                />
                <EvalTrendPanel trend={trend} />
                <EvalRunTable
                  runs={runs}
                  caseRuns={caseRuns}
                  selectedRunIds={selectedRunIds}
                  expandedRunId={expandedRunId}
                  pendingCancelRunId={cancelSuite.isPending ? (cancelSuite.variables ?? null) : null}
                  onToggleSelection={(runId) => {
                    setSelectedRunIds((prev) => toggleSelection(prev, runId));
                    setCompareOpen(false);
                  }}
                  onToggleExpanded={(runId) =>
                    setExpandedRunId((prev) => (prev === runId ? null : runId))
                  }
                  onCancel={(runId) => cancelSuite.mutate(runId)}
                  onCompare={() => setCompareOpen(true)}
                  emptyMessage={
                    allRuns.length > 0 ? t("dashboardPage.noRunsInRange") : undefined
                  }
                />
              </>
            )}
          </>
        )}
      </div>

      {compareOpen && compareRunA && compareRunB && (
        <EvalCompareModal
          runA={toCompareRunInput(compareRunA)}
          runB={toCompareRunInput(compareRunB)}
          promptDiff={comparePrompt}
          onClose={() => {
            setCompareOpen(false);
            setSelectedRunIds([]);
          }}
        />
      )}
    </AppShell>
  );
}
