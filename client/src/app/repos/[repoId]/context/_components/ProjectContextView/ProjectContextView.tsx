"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useProjectDocs, useResyncProjectContext } from "@/lib/hooks/context";
import { relativeTime } from "@/lib/time";
import { DocumentList } from "./_components/DocumentList";
import { DocumentPreview } from "./_components/DocumentPreview";
import { SCANNED_ROOTS, SELECTED_PATH_PARAM } from "./constants";
import { repoLabel } from "./helpers";
import { s } from "./styles";

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const { data, isLoading, isError, refetch } = useProjectDocs(repoId);
  const resync = useResyncProjectContext(repoId);

  const repoName = repoLabel(activeRepo?.full_name, t("page.repoFallback"));
  const documents = data?.documents ?? [];
  const notCloned = data?.reason === "not_cloned";
  const selectedPath = search.get(SELECTED_PATH_PARAM);

  const selectPath = (path: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set(SELECTED_PATH_PARAM, path);
    router.replace(`/repos/${repoId}/context?${sp.toString()}`);
  };

  const crumb = [{ label: t("page.crumbWorkspace") }, { label: t("page.crumbContext") }];

  return (
    <AppShell crumb={crumb}>
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
            <span style={s.syncedAt}>{lastRefreshed()}</span>
            <Button
              kind="secondary"
              icon="RefreshCw"
              onClick={() => resync.mutate()}
              disabled={resync.isPending}
              loading={resync.isPending}
            >
              {resync.isPending ? t("resyncing") : t("resync")}
            </Button>
          </div>
        </div>

        {isLoading && <Skeleton height={160} />}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />}

        {!isLoading && !isError && notCloned && (
          <EmptyState
            icon="GitBranch"
            title={t("notCloned.title", { repo: repoName })}
            body={t("notCloned.body", { repo: repoName })}
          />
        )}

        {!isLoading && !isError && !notCloned && documents.length === 0 && (
          <EmptyState
            icon="FileText"
            title={t("noDocuments.title")}
            body={t("noDocuments.body", { roots: SCANNED_ROOTS.join(", ") })}
          />
        )}

        {!isLoading && !isError && documents.length > 0 && (
          <div style={s.split}>
            <DocumentList
              documents={documents}
              selectedPath={selectedPath}
              onSelect={selectPath}
            />
            <DocumentPreview repoId={repoId} path={selectedPath} />
          </div>
        )}
      </div>
    </AppShell>
  );

  function subtitle(): string {
    const counted = t("page.documentCount", { count: documents.length });
    const omitted = data?.omitted ?? 0;
    return omitted > 0 ? `${counted} · ${t("page.omitted", { count: omitted })}` : counted;
  }

  function lastRefreshed(): string {
    const at = data?.last_synced_at;
    return at ? t("page.lastSynced", { ago: relativeTime(at) }) : t("page.neverSynced");
  }
}
