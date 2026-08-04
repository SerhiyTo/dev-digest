/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import {
  KEY_TO_ACTION,
  SCROLL_TO_TARGET_STEP_MS,
  SCROLL_TO_TARGET_TRIES,
  USER_SCROLL_EVENTS,
} from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  severity = null,
  targetFindingId = null,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  severity?: Severity | null;
  targetFindingId?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );

  React.useEffect(() => setFocusIdx(0), [severity, hideLow]);

  React.useEffect(() => {
    if (!targetFindingId) return;
    const idx = shown.findIndex((f) => f.id === targetFindingId);
    if (idx < 0) return;
    setFocusIdx(idx);

    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      stopped = true;
    };

    const jump = () => {
      if (stopped) return;
      const el = document.querySelector(`[data-finding-id="${targetFindingId}"]`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        const { top, bottom } = el.getBoundingClientRect();
        if (top >= 0 && bottom <= window.innerHeight) return;
      }
      if (++tries < SCROLL_TO_TARGET_TRIES) timer = setTimeout(jump, SCROLL_TO_TARGET_STEP_MS);
    };

    const frame = requestAnimationFrame(jump);
    for (const ev of USER_SCROLL_EVENTS) window.addEventListener(ev, stop, { passive: true });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      for (const ev of USER_SCROLL_EVENTS) window.removeEventListener(ev, stop);
    };
  }, [targetFindingId, shown]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
