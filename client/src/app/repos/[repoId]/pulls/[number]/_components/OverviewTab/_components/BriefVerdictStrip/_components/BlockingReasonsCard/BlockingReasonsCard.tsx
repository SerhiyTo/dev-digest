"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, MonoLink } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import { visibleBlockingReasons, type BlockingReason } from "../../helpers";
import { OPEN_DELAY_MS, CLOSE_DELAY_MS, CARD_WIDTH } from "./constants";
import { placeCard, refLabel, type CardPosition } from "./helpers";
import { s } from "./styles";

export function BlockingReasonsCard({
  reasons,
  repoFullName,
  headSha,
  children,
}: {
  reasons: BlockingReason[];
  repoFullName?: string | null;
  headSha?: string | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("brief");
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
    clearTimers();
    openTimer.current = setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos(placeCard(rect));
      setOpen(true);
    }, OPEN_DELAY_MS);
  }, [clearTimers]);

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

  const { rows, hiddenCount } = visibleBlockingReasons(reasons);

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
              <span>{t("blocking.title")}</span>
            </div>

            {rows.length === 0 ? (
              <div style={s.message}>{t("blocking.empty")}</div>
            ) : (
              <div style={s.list}>
                {rows.map((reason, i) => (
                  <BlockingReasonRow
                    key={`${reason.ref.path}:${reason.ref.startLine ?? ""}:${reason.title}`}
                    reason={reason}
                    first={i === 0}
                    repoFullName={repoFullName}
                    headSha={headSha}
                  />
                ))}
              </div>
            )}

            {hiddenCount > 0 && (
              <div style={s.overflow}>{t("blocking.overflow", { count: hiddenCount })}</div>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

function BlockingReasonRow({
  reason,
  first,
  repoFullName,
  headSha,
}: {
  reason: BlockingReason;
  first: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const href =
    repoFullName && headSha
      ? githubBlobUrl(
          repoFullName,
          headSha,
          reason.ref.path,
          reason.ref.startLine ?? undefined,
          reason.ref.endLine ?? undefined,
        )
      : undefined;

  return (
    <div style={s.row(first)}>
      <div style={s.rowHead}>
        <span style={s.badgeWrap}>
          <SeverityBadge severity={reason.severity} compact />
        </span>
        <span style={s.title}>{reason.title}</span>
      </div>
      <MonoLink href={href}>{refLabel(reason.ref)}</MonoLink>
    </div>
  );
}

export default BlockingReasonsCard;
