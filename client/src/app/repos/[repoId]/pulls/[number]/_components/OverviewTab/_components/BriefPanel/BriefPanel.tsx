"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Modal, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBrief, PrBriefGenerationState } from "@devdigest/shared";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { formatCost } from "@/lib/cost";
import { relativeTime } from "@/lib/time";
import { shortSha } from "@/lib/brief";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { ReviewFocusCard } from "../ReviewFocusCard";
import { RiskList } from "../RiskList";
import { BriefEmptyState } from "../BriefEmptyState";
import { BriefVerdictStrip } from "../BriefVerdictStrip";
import { crossModelIds, degradedReasonKey, isNotFoundError, stripReviewFrom } from "./helpers";
import { DEFAULT_MERGE_RISK, REGENERATE_ICON, RISKS_ICON } from "./constants";
import { s } from "./styles";

interface BriefPanelProps {
  prId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}

function BriefFailureNotice({ generation }: { generation: PrBriefGenerationState }) {
  const t = useTranslations("brief");
  return (
    <div role="alert" style={s.failure}>
      <div style={s.failureTitle}>{t("failure.title")}</div>
      <p style={s.failureDetail}>{t("failure.detail", { error: generation.error ?? "" })}</p>
      {generation.cost_usd != null && (
        <p style={s.failureCost}>{t("failure.cost", { cost: formatCost(generation.cost_usd) })}</p>
      )}
    </div>
  );
}

function BriefBadges({ brief, stale }: { brief: PrBrief; stale: boolean }) {
  const t = useTranslations("brief");
  return (
    <div style={s.badges}>
      {brief.degraded_reason && (
        <Badge color="var(--warn)" bg="var(--warn-bg)">
          {t("badges.partial")} — {t(`degraded.reason.${degradedReasonKey(brief.degraded_reason)}`)}
        </Badge>
      )}
      {brief.truncated && (
        <Badge color="var(--warn)" bg="var(--warn-bg)">
          {t("badges.truncated")}
        </Badge>
      )}
      {stale && (
        <Badge color="var(--stale)" bg="var(--bg-hover)" dot>
          {t("badges.stale")}
        </Badge>
      )}
    </div>
  );
}

function BriefFooter({
  brief,
  generation,
}: {
  brief: PrBrief;
  generation: PrBriefGenerationState | null;
}) {
  const t = useTranslations("brief");
  const reviewModels = brief.review_models ?? [];

  return (
    <div style={s.footer}>
      <span>
        {t("footer.generatedFrom", {
          time: relativeTime(generation?.finished_at),
          sha: shortSha(brief.head_sha),
        })}
      </span>
      {brief.model && (
        <span>
          {reviewModels.length > 0
            ? t("crossModel.withReviews", {
                briefModel: brief.model,
                reviewModels: crossModelIds(reviewModels),
              })
            : t("crossModel.briefOnly", { briefModel: brief.model })}
        </span>
      )}
    </div>
  );
}

export function BriefPanel({ prId, repoFullName, headSha }: BriefPanelProps) {
  const t = useTranslations("brief");
  const tCommon = useTranslations("common");
  const { data, isLoading, error, refetch } = usePrBrief(prId);
  const generateBrief = useGenerateBrief(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: runs } = usePrRuns(prId);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const brief = data?.brief ?? null;
  const generation = data?.generation ?? null;
  const isRunning = generation?.status === "running";
  const isFailed = generation?.status === "failed";
  const controlDisabled = isRunning || generateBrief.isPending;
  const lastCost = brief?.cost_usd ?? null;
  const reviewProp = stripReviewFrom(reviews, runs);

  const openConfirm = () => setConfirmOpen(true);
  const closeConfirm = () => setConfirmOpen(false);
  const confirmGenerate = () => {
    setConfirmOpen(false);
    generateBrief.mutate();
  };

  const showSkeleton = isLoading && data == null;
  const showError = data == null && error != null && !isNotFoundError(error);

  let body: React.ReactNode = null;

  if (showSkeleton) {
    body = (
      <div style={s.loading}>
        <Skeleton height={20} width="50%" />
        <Skeleton height={14} width="90%" />
        <Skeleton height={14} width="70%" />
      </div>
    );
  } else if (showError) {
    body = (
      <ErrorState title={t("error.title")} body={(error as Error).message} onRetry={() => void refetch()} />
    );
  } else if (brief != null) {
    const regenerateControl = (
      <Button
        kind="secondary"
        icon={REGENERATE_ICON}
        loading={controlDisabled}
        disabled={controlDisabled}
        onClick={openConfirm}
      >
        {isRunning ? t("generating") : t("regenerate")}
      </Button>
    );
    body = (
      <div style={s.content}>
        <div style={s.header}>
          <SectionLabel icon="FileText">{t("block.brief")}</SectionLabel>
          <BriefBadges brief={brief} stale={data?.stale ?? false} />
        </div>

        <BriefVerdictStrip
          summary={brief.summary ?? ""}
          mergeRisk={brief.merge_risk ?? DEFAULT_MERGE_RISK}
          review={reviewProp}
          risks={brief.risks.risks}
          repoFullName={repoFullName}
          headSha={headSha}
          regenerate={regenerateControl}
          cost={{
            tokensIn: brief.tokens_in ?? 0,
            tokensOut: brief.tokens_out ?? 0,
            costUsd: brief.cost_usd ?? null,
          }}
        />

        {isFailed && generation && <BriefFailureNotice generation={generation} />}
      </div>
    );
  } else if (data != null) {
    body = (
      <div style={s.content}>
        <BriefEmptyState onGenerate={openConfirm} disabled={controlDisabled} running={isRunning} />
        {isFailed && generation && <BriefFailureNotice generation={generation} />}
      </div>
    );
  }

  const risksSlot =
    brief != null ? (
      <>
        <SectionLabel icon={RISKS_ICON}>{t("block.risks")}</SectionLabel>
        <RiskList risks={brief.risks.risks} repoFullName={repoFullName} headSha={headSha} />
      </>
    ) : undefined;

  return (
    <div style={s.root}>
      {body}

      <div style={s.cardGrid}>
        <IntentCard prId={prId} risksSlot={risksSlot} />
        <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      {brief != null && (
        <ReviewFocusCard rows={brief.review_focus} repoFullName={repoFullName} headSha={headSha} />
      )}

      {brief != null && <BriefFooter brief={brief} generation={generation} />}

      {confirmOpen && (
        <Modal
          title={t("confirm.title")}
          onClose={closeConfirm}
          footer={
            <div style={s.confirmFooter}>
              <Button kind="ghost" onClick={closeConfirm}>
                {tCommon("actions.cancel")}
              </Button>
              <Button kind="primary" onClick={confirmGenerate}>
                {t("confirm.cta")}
              </Button>
            </div>
          }
        >
          <div style={s.confirmBody}>
            <p style={s.confirmText}>{t("confirm.body")}</p>
            {lastCost != null && (
              <p style={s.confirmText}>{t("confirm.lastCost", { cost: formatCost(lastCost) })}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
