"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents, useEvalDashboards, useEvalSuiteRunsForAgents } from "@/lib/hooks";
import { EvalAgentRow } from "./_components/EvalAgentRow";
import { EvalRecentRunsTable } from "./_components/EvalRecentRunsTable";
import { latestRunFromDashboard, recentRunsAcrossAgents } from "./helpers";
import { s } from "./styles";

export default function EvalsPage() {
  const t = useTranslations("eval");
  const tCommon = useTranslations("common");

  const {
    data: dashboardsData,
    isLoading: dashboardsLoading,
    isError: dashboardsError,
    refetch: refetchDashboards,
  } = useEvalDashboards();
  const {
    data: agents,
    isLoading: agentsLoading,
    isError: agentsError,
    refetch: refetchAgents,
  } = useAgents();

  const dashboards = useMemo(
    () => (dashboardsData?.dashboards ?? []).filter((dashboard) => dashboard.owner_id !== null),
    [dashboardsData],
  );
  const agentIds = useMemo(() => dashboards.map((dashboard) => dashboard.owner_id!), [dashboards]);
  const suiteRuns = useEvalSuiteRunsForAgents(agentIds);
  const recentRuns = useMemo(() => recentRunsAcrossAgents(suiteRuns.data), [suiteRuns.data]);

  const isLoading = dashboardsLoading || agentsLoading;
  const isError = dashboardsError || agentsError;

  const agentNameFor = (agentId: string) => agents?.find((a) => a.id === agentId)?.name ?? agentId;
  const agentModelFor = (agentId: string) => agents?.find((a) => a.id === agentId)?.model;

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvals") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
          <p style={s.subtitle}>{t("dashboard.agentsSubtitle")}</p>
        </div>

        {isLoading && (
          <div style={s.skeletons}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        )}
        {!isLoading && isError && (
          <ErrorState
            onRetry={() => {
              refetchDashboards();
              refetchAgents();
              suiteRuns.refetch();
            }}
          />
        )}
        {!isLoading && !isError && dashboards.length === 0 && (
          <EmptyState icon="FlaskConical" title={tCommon("states.empty")} />
        )}
        {!isLoading && !isError && dashboards.length > 0 && (
          <>
            <section style={s.section}>
              <SectionLabel icon="Cpu">{t("dashboard.agentsSection")}</SectionLabel>
              <ul style={s.list}>
                {dashboards.map((dashboard) => {
                  const agentId = dashboard.owner_id!;
                  return (
                    <EvalAgentRow
                      key={agentId}
                      agentId={agentId}
                      agentName={agentNameFor(agentId)}
                      model={agentModelFor(agentId)}
                      caseCount={dashboard.cases_total}
                      latestRun={latestRunFromDashboard(dashboard)}
                      trend={dashboard.trend}
                    />
                  );
                })}
              </ul>
            </section>

            <section style={s.section}>
              <SectionLabel icon="History">{t("dashboard.recentRunsAllAgents")}</SectionLabel>
              {suiteRuns.isLoading && <Skeleton height={220} />}
              {!suiteRuns.isLoading && suiteRuns.isError && (
                <ErrorState onRetry={() => suiteRuns.refetch()} />
              )}
              {!suiteRuns.isLoading && !suiteRuns.isError && (
                <EvalRecentRunsTable runs={recentRuns} agentNameFor={agentNameFor} />
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
