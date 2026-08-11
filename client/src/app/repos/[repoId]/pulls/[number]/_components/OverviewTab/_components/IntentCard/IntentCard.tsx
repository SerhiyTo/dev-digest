"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useComputeIntent, isNotComputed } from "@/lib/hooks/intent";
import { formatCost } from "@/lib/cost";
import { relativeTime } from "@/lib/time";
import type { PrIntentRecord } from "@devdigest/shared";
import { riskToken } from "./constants";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null;
}

function ScopeList({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <div>
      <div style={s.scopeHead(color)}>{title}</div>
      <ul style={s.list}>
        {items.length === 0 && <li style={s.item}>—</li>}
        {items.map((item) => (
          <li key={item} style={s.item}>
            <span style={s.bullet}>·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IntentBody({ record }: { record: PrIntentRecord }) {
  const t = useTranslations("brief.intent");

  return (
    <>
      <div style={s.statement}>{`“${record.intent}”`}</div>

      <div style={s.scopeGrid}>
        <ScopeList title={t("inScope")} color="var(--ok)" items={record.in_scope} />
        <ScopeList title={t("outOfScope")} color="var(--text-muted)" items={record.out_of_scope} />
      </div>

      {record.risk_areas.length > 0 && (
        <div style={s.divider}>
          <div style={s.scopeHead("var(--text-muted)")}>{t("riskAreas")}</div>
          <div style={s.chips}>
            {record.risk_areas.map((risk) => {
              const token = riskToken(risk.severity);
              return (
                <Badge key={risk.label} icon={token.icon} color={token.c} bg={token.bg}>
                  {risk.label}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      <div style={s.footer}>
        <span style={s.coverage} title={record.evidence.map((e) => e.detail).join("\n")}>
          <span style={s.coverageDot(record.confidence)} />
          {record.confidence == null
            ? t("coverageUnknown")
            : t("coverage", { pct: Math.round(record.confidence * 100) })}
        </span>
        {record.model && <span className="mono">{record.model}</span>}
        {record.cost_usd != null && <span className="mono">{formatCost(record.cost_usd)}</span>}
        {record.computed_at && <span>{relativeTime(record.computed_at)}</span>}
        {record.stale && (
          <Badge color="var(--stale)" bg="var(--bg-hover)" dot>
            {t("stale")}
          </Badge>
        )}
      </div>
    </>
  );
}

export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("brief.intent");
  const { data, isLoading, error, refetch } = usePrIntent(prId);
  const compute = useComputeIntent(prId);

  const notComputed = isNotComputed(error);
  const action = (
    <Button
      kind="secondary"
      size="sm"
      icon="RefreshCw"
      loading={compute.isPending}
      disabled={prId == null || compute.isPending}
      onClick={() => compute.mutate()}
    >
      {data ? t("recompute") : t("compute")}
    </Button>
  );

  return (
    <section style={s.card}>
      <SectionLabel icon="Target" right={data ? action : undefined}>
        {t("title")}
      </SectionLabel>

      {isLoading && (
        <div style={s.loading}>
          <Skeleton height={16} width="80%" />
          <Skeleton height={14} width="55%" />
          <Skeleton height={14} width="65%" />
        </div>
      )}

      {!isLoading && data && <IntentBody record={data} />}

      {!isLoading && !data && notComputed && (
        <EmptyState
          icon="Target"
          title={t("empty.title")}
          body={t("empty.body")}
          cta={compute.isPending ? t("computing") : t("compute")}
          onCta={() => compute.mutate()}
          ctaLoading={compute.isPending}
        />
      )}

      {!isLoading && !data && !notComputed && error && (
        <ErrorState title={t("error.title")} body={(error as Error).message} onRetry={() => void refetch()} />
      )}
    </section>
  );
}
