"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Icon,
  Skeleton,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  type Severity as UiSeverity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { sortBySeverity } from "@/lib/severity";
import { githubBlobUrl } from "@/lib/github-urls";
import { OPEN_DELAY_MS, CLOSE_DELAY_MS, CARD_WIDTH } from "./constants";
import { placeCard, lineLabel, type CardPosition } from "./helpers";
import { s } from "./styles";

export function FindingsHoverCard({
  prId,
  repoId,
  prNumber,
  repoFullName,
  headSha,
  disabled,
  children,
}: {
  prId: string | null | undefined;
  repoId: string;
  prNumber: number;
  repoFullName?: string | null;
  headSha?: string | null;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const anchorRef = React.useRef<HTMLSpanElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<CardPosition | null>(null);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const show = React.useCallback(() => {
    if (disabled || !prId) return;
    clearTimers();
    openTimer.current = setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos(placeCard(rect));
      setOpen(true);
    }, OPEN_DELAY_MS);
  }, [disabled, prId, clearTimers]);

  const hide = React.useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clearTimers]);

  React.useEffect(() => clearTimers, [clearTimers]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
      const node = e.target instanceof Node ? e.target : null;
      if (node && cardRef.current?.contains(node)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const { data: reviews, isLoading, isError } = usePrReviews(prId, { enabled: open });
  const findings = React.useMemo(
    () => sortBySeverity((reviews ?? []).flatMap((r) => r.findings)),
    [reviews],
  );

  return (
    <span
      ref={anchorRef}
      style={s.anchor}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {open &&
        pos != null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={cardRef}
            role="tooltip"
            style={s.card(pos, CARD_WIDTH)}
            onMouseEnter={clearTimers}
            onMouseLeave={hide}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={s.header}>
              <Icon.Info size={13} />
              <span>
                {isLoading || isError
                  ? t("list.hoverCard.title")
                  : t("list.hoverCard.count", { count: findings.length })}
              </span>
            </div>

            {isLoading ? (
              <div style={s.loading}>
                <Skeleton height={14} width={260} />
                <Skeleton height={12} width={180} />
                <Skeleton height={30} />
              </div>
            ) : isError ? (
              <div style={s.message}>{t("list.hoverCard.error")}</div>
            ) : findings.length === 0 ? (
              <div style={s.message}>{t("list.hoverCard.empty")}</div>
            ) : (
              <div style={s.list}>
                {findings.map((f, i) => (
                  <FindingRow
                    key={f.id}
                    f={f}
                    first={i === 0}
                    repoFullName={repoFullName}
                    headSha={headSha}
                    onOpen={() => {
                      setOpen(false);
                      router.push(
                        `/repos/${repoId}/pulls/${prNumber}?tab=findings&finding=${f.id}`,
                        { scroll: false },
                      );
                    }}
                  />
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

function FindingRow({
  f,
  first,
  repoFullName,
  headSha,
  onOpen,
}: {
  f: FindingRecord;
  first: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  onOpen: () => void;
}) {
  const t = useTranslations("prReview");
  const [hover, setHover] = React.useState(false);
  const href =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const muted = !!f.accepted_at || !!f.dismissed_at;

  return (
    <div
      role="button"
      tabIndex={0}
      title={t("list.hoverCard.openFinding")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={s.row(muted, first, hover)}
    >
      <div style={s.rowHead}>
        <span style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as UiSeverity} compact />
        </span>
        <span style={s.titleWrap}>
          <span style={s.title}>{f.title}</span>{" "}
          <CategoryTag category={f.category as Category} />
        </span>
      </div>
      <div style={s.meta}>
        <MonoLink href={href}>
          {f.file}:{lineLabel(f.start_line, f.end_line)}
        </MonoLink>
        <ConfidenceNum value={f.confidence} />
      </div>
      <div style={s.rationale}>{f.rationale}</div>
    </div>
  );
}

export default FindingsHoverCard;
