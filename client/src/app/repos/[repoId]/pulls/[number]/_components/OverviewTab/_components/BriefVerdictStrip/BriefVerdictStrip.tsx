"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, CircularScore, Icon, IconBtn } from "@devdigest/ui";
import type { CiFailOn, ReviewRecord, Risk, Verdict } from "@devdigest/shared";
import { VERDICT_META } from "../../../VerdictBanner/constants";
import { mergeRiskToken, type MergeRiskBand } from "@/lib/brief";
import { formatCost } from "@/lib/cost";
import { composeBlockingReasons, judgementsDisagree } from "./helpers";
import { BlockingReasonsCard } from "./_components/BlockingReasonsCard";
import { s } from "./styles";

export interface BriefVerdictStripReview {
  verdict: Verdict;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  review: ReviewRecord;
  ciFailOn: CiFailOn | null;
}

export interface BriefVerdictStripCost {
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

export interface BriefVerdictStripProps {
  summary: string;
  mergeRisk: MergeRiskBand;
  review?: BriefVerdictStripReview | null;
  risks: Risk[];
  repoFullName?: string | null;
  headSha?: string | null;
  regenerate?: React.ReactNode;
  cost?: BriefVerdictStripCost | null;
}

export function BriefVerdictStrip({
  summary,
  mergeRisk,
  review,
  risks,
  repoFullName,
  headSha,
  regenerate,
  cost,
}: BriefVerdictStripProps) {
  const t = useTranslations("brief");
  const tVerdict = useTranslations("prReview");

  const band = mergeRiskToken(mergeRisk);
  const BandIcon = Icon[band.icon];

  const blockingReasons = composeBlockingReasons({
    review: review?.review,
    run: { ci_fail_on: review?.ciFailOn ?? null },
    risks,
  });
  const liveBlockerCount = blockingReasons.length;

  const disagree = judgementsDisagree({
    verdict: review?.verdict,
    blockerCount: liveBlockerCount,
    mergeRisk,
  });

  const meta = review ? (VERDICT_META[review.verdict] ?? VERDICT_META.comment) : null;

  const costText = cost
    ? cost.costUsd != null
      ? t("cost.line", {
          tokensIn: cost.tokensIn.toLocaleString(),
          tokensOut: cost.tokensOut.toLocaleString(),
          cost: formatCost(cost.costUsd),
        })
      : t("cost.lineNoCost", {
          tokensIn: cost.tokensIn.toLocaleString(),
          tokensOut: cost.tokensOut.toLocaleString(),
        })
    : null;
  const score = review?.score ?? null;

  return (
    <div style={s.wrap}>
      <div style={s.iconBox(band.bg, band.c)}>
        <BandIcon size={22} />
      </div>
      <div style={s.main}>
        <span style={s.bandLabel(band.c)}>
          {t("mergeRisk.label")}: {t(`mergeRisk.${mergeRisk}`)}
        </span>
        <p style={s.summary}>{summary}</p>

        {review && meta && (
          <div style={s.reviewSection}>
            <div style={s.titleRow}>
              <span style={s.label(meta.c)}>{tVerdict(`verdict.${meta.labelKey}`)}</span>
              <Badge color="var(--text-secondary)">
                {tVerdict("verdict.findingsCount", { count: review.findingsCount })}
                {liveBlockerCount > 0 ? tVerdict("verdict.blockers", { count: liveBlockerCount }) : ""}
              </Badge>
              {blockingReasons.length > 0 && (
                <span style={s.infoWrap}>
                  <BlockingReasonsCard
                    reasons={blockingReasons}
                    repoFullName={repoFullName}
                    headSha={headSha}
                  >
                    <IconBtn icon="Info" label={t("blocking.control")} size={22} />
                  </BlockingReasonsCard>
                </span>
              )}
            </div>
            {review.summary && <p style={s.summary}>{review.summary}</p>}
          </div>
        )}

        {review && meta && disagree && (
          <p style={s.disagreement}>
            {t("disagreement", {
              verdict: tVerdict(`verdict.${meta.labelKey}`),
              band: t(`mergeRisk.${mergeRisk}`),
            })}
          </p>
        )}

        {score == null && costText != null && (
          <span className="mono" style={s.costLine}>
            {costText}
          </span>
        )}
      </div>

      {score != null && (
        <div style={s.scoreCol}>
          <CircularScore score={score} size={52} stroke={5} />
          <span style={s.scoreLabel}>{tVerdict("verdict.prScore")}</span>
          {costText != null && (
            <span className="mono" style={s.costLineUnderScore}>
              {costText}
            </span>
          )}
        </div>
      )}

      {regenerate && <div style={s.regenerateSlot}>{regenerate}</div>}
    </div>
  );
}
