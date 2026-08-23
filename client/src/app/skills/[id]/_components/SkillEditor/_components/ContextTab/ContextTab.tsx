"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { DocAttachPanel, type DocAttachLabels } from "@/components/doc-attach";
import { useActiveRepo } from "@/lib/repo-context";

export function ContextTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { repoId, activeRepo } = useActiveRepo();

  const labels: DocAttachLabels = {
    title: t("context.title"),
    attachedCount: (attached, total, repo) =>
      t("context.attachedCount", { attached, total, repo }),
    scopeNote: (repo) => t("context.scopeNote", { repo }),
    repoUnknown: t("context.repoUnknown"),
    filterPlaceholder: t("context.filterPlaceholder"),
    orderHint: t("context.orderHint"),
    missing: t("context.missing"),
    missingTitle: (repo) => t("context.missingTitle", { repo }),
    moveUp: t("context.moveUp"),
    moveDown: t("context.moveDown"),
    tokenEstimate: (tokens) => t("context.tokenEstimate", { tokens }),
    estimatePending: t("context.estimatePending"),
    estimateUnavailable: t("context.estimateUnavailable"),
    limitReached: (max) => t("context.limitReached", { max }),
    saveErrorLimit: (max) => t("context.saveErrorLimit", { max }),
    saveErrorInvalidPath: t("context.saveErrorInvalidPath"),
    saveErrorOwnerGone: t("context.saveErrorOwnerGone"),
    saveErrorServer: t("context.saveErrorServer"),
    saveErrorUnknown: (message) => t("context.saveErrorUnknown", { message }),
    loadError: t("context.loadError"),
    noRepo: t("context.noRepo"),
    noDocumentsTitle: t("context.noDocumentsTitle"),
    noDocumentsBody: t("context.noDocumentsBody"),
  };

  return (
    <DocAttachPanel
      ownerKind="skills"
      ownerId={skillId}
      repoId={repoId}
      repoName={activeRepo?.full_name ?? null}
      labels={labels}
    />
  );
}
