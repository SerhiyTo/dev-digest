"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Donut, ErrorState, MetricCard, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { formatPercentMetric } from "../../../../../_components/SkillCard/helpers";
import { toNonZeroDonutSegments } from "./helpers";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  return (
    <div style={s.wrap}>
      <div style={s.heading}>
        <h2 style={s.h2}>{t("editor.tabs.stats")}</h2>
        <p style={s.disclaimer}>{t("stats.disclaimer")}</p>
      </div>

      {isLoading && <Skeleton height={140} />}
      {isError && <ErrorState title={t("stats.loadError")} onRetry={() => refetch()} />}

      {stats && (
        <>
          <div style={s.metricsRow}>
            <MetricCard label={t("stats.usedBy")} value={stats.used_by} />
            <MetricCard label={t("stats.pullFrequency")} value={formatPercentMetric(stats.pull_frequency)} />
            <MetricCard label={t("stats.acceptRate")} value={formatPercentMetric(stats.accept_rate)} />
            <MetricCard label={t("stats.findings30d")} value={stats.findings_30d} />
          </div>

          <div style={s.section}>
            <h3 style={s.h3}>{t("stats.agentsUsing")}</h3>
            {stats.agents.length === 0 ? (
              <span style={s.empty}>{t("stats.empty")}</span>
            ) : (
              <div style={s.agentsList}>
                {stats.agents.map((a) => (
                  <Link key={a.id} href={`/agents/${a.id}`} style={s.agentLink}>
                    {a.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div style={s.section}>
            <h3 style={s.h3}>{t("stats.byCategory")}</h3>
            {Object.values(stats.findings_by_category).every((count) => count === 0) ? (
              <span style={s.empty}>{t("stats.empty")}</span>
            ) : (
              <Donut
                segments={toNonZeroDonutSegments(stats.findings_by_category)}
                formatValue={(v) => `${v}`}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
