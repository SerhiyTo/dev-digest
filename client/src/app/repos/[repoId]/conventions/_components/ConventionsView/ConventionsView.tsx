"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, TextInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useConventionAction,
  useConventions,
  useScanConventions,
  useSetConventionStatuses,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "./_components/ConventionCard";
import { ConventionToolbar } from "./_components/ConventionToolbar";
import { CreateSkillFromConventionsModal } from "./_components/CreateSkillFromConventionsModal";
import { NOT_INDEXED_REASON } from "./constants";
import { acceptedIds, subtitleChips } from "./helpers";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const { activeRepo } = useActiveRepo();
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const scan = useScanConventions(repoId);
  const action = useConventionAction(repoId);
  const updateRule = useUpdateConvention(repoId);
  const setStatuses = useSetConventionStatuses(repoId);

  const [scope, setScope] = React.useState("");
  const [merging, setMerging] = React.useState(false);

  const repoName = activeRepo?.full_name?.split("/").pop() ?? t("page.repoFallback");
  const state = data?.state;
  const candidates = data?.candidates ?? [];
  const accepted = acceptedIds(candidates);
  const scanning = state?.status === "running" || scan.isPending;

  const runScan = () => {
    const prefix = scope.trim();
    scan.mutate(prefix ? { path_prefix: prefix } : {});
  };

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  return (
    <AppShell crumb={crumb}>
      {merging && (
        <CreateSkillFromConventionsModal
          repoId={repoId}
          repoName={repoName}
          onClose={() => setMerging(false)}
        />
      )}
      <div style={s.wrap}>
        <div style={s.headerRow}>
          <div style={s.headerMain}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repoName}>{repoName}</span>
            </h1>
            <div style={s.subtitle}>{subtitle()}</div>
          </div>
          <div style={s.headerActions}>
            <div style={s.scopeField}>
              <TextInput
                value={scope}
                onChange={setScope}
                placeholder={t("page.scopePlaceholder")}
              />
            </div>
            <Button kind="secondary" icon="RefreshCw" onClick={runScan} disabled={scanning}>
              {scanning ? t("page.scanning") : t("page.rescan")}
            </Button>
          </div>
        </div>

        {isLoading && <Skeleton height={120} />}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />}

        {!isLoading && !isError && candidates.length === 0 && (
          <EmptyState
            icon="ListChecks"
            title={notIndexed() ? t("page.notIndexedTitle") : t("page.empty.title")}
            body={notIndexed() ? t("page.notIndexed") : t("page.empty.body")}
            cta={scanning ? t("page.scanning") : t("page.empty.cta")}
            onCta={runScan}
            ctaLoading={scanning}
          />
        )}

        {candidates.length > 0 && (
          <>
            <div style={s.toolbarSpacing}>
              <ConventionToolbar
                accepted={accepted.length}
                total={candidates.length}
                busy={setStatuses.isPending}
                onDeselectAll={() => setStatuses.mutate({ ids: accepted, status: "pending" })}
                onCreateSkill={() => setMerging(true)}
              />
            </div>
            <div style={s.list}>
              {candidates.map((convention) => (
                <ConventionCard
                  key={convention.id}
                  convention={convention}
                  busy={action.isPending}
                  onAction={(kind) => action.mutate({ id: convention.id, action: kind })}
                  onEdit={(rule) => updateRule.mutate({ id: convention.id, rule })}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );

  function notIndexed(): boolean {
    return state?.degraded_reason === NOT_INDEXED_REASON;
  }

  function subtitle(): string {
    if (!state || state.status === "never") return t("page.subtitleNever");
    if (state.status === "running") return t("page.subtitleScanning");
    const chips = subtitleChips({
      state,
      sampleLabel: (count) => t("page.sampleCount", { count }),
      droppedLabel: (kept, dropped) => t("page.droppedCount", { kept, dropped }),
      costLabel: (cost, tokens) => t("page.cost", { cost, tokens }),
      lastScanLabel: (ago) => t("page.lastScan", { ago }),
    });
    return chips.length > 0 ? chips.join(" · ") : t("page.subtitle");
  }
}
