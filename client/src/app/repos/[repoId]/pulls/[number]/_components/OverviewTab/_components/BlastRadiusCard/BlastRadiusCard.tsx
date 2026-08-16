"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrBlastRadius } from "@/lib/hooks/blast";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { DEGRADED_REASONS } from "./constants";
import { BlastStatsRow } from "./_components/BlastStatsRow";
import { BlastSymbolList } from "./_components/BlastSymbolList";
import { BlastGraph } from "./_components/BlastGraph";
import { PriorPrsSection } from "./_components/PriorPrsSection";
import type { BlastView } from "./_components/BlastViewToggle";
import { s } from "./styles";

function reasonKey(reason: string): string {
  return DEGRADED_REASONS.has(reason) ? reason : "unknown";
}

function BlastBody({
  data,
  repoFullName,
  headSha,
}: {
  data: BlastRadiusResponse;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const [view, setView] = React.useState<BlastView>("tree");

  const symbolCount = data.changed_symbols.length;
  const callerCount = data.downstream.reduce((sum, item) => sum + item.callers.length, 0);

  return (
    <>
      <BlastStatsRow
        symbolCount={symbolCount}
        callerCount={callerCount}
        endpointCount={data.endpoints_affected.length}
        cronCount={data.crons_affected.length}
        truncated={data.truncated}
        view={view}
        onViewChange={setView}
      />

      {callerCount === 0 && <div style={s.noDownstream}>{t("noDownstream", { count: symbolCount })}</div>}

      {view === "tree" ? (
        <BlastSymbolList
          changedSymbols={data.changed_symbols}
          downstream={data.downstream}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      ) : (
        <BlastGraph downstream={data.downstream} summary={data.summary} />
      )}

      <PriorPrsSection history={data.history} />
    </>
  );
}

export function BlastRadiusCard({
  prId,
  repoFullName,
  headSha,
}: {
  prId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const { data, isLoading, error, refetch } = usePrBlastRadius(prId);

  const degradedBadge = data?.degraded ? (
    <span title={t(`degraded.reason.${reasonKey(data.reason)}`)}>
      <Badge color="var(--warn)" bg="var(--warn-bg)">
        {t("degraded.badge")}
      </Badge>
    </span>
  ) : undefined;

  return (
    <section style={s.card}>
      <SectionLabel icon="Workflow" right={degradedBadge}>
        {t("title")}
      </SectionLabel>

      {isLoading && (
        <div style={s.loading}>
          <Skeleton height={16} width="60%" />
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="75%" />
        </div>
      )}

      {!isLoading && data && data.changed_symbols.length === 0 && (
        <EmptyState icon="Workflow" title={t("empty.title")} body={t("empty.body")} />
      )}

      {!isLoading && data && data.changed_symbols.length > 0 && (
        <BlastBody data={data} repoFullName={repoFullName} headSha={headSha} />
      )}

      {!isLoading && !data && error && (
        <ErrorState title={t("error.title")} body={(error as Error).message} onRetry={() => void refetch()} />
      )}
    </section>
  );
}
