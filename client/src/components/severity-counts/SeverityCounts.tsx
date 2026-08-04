"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITIES, isEmptyCounts, type SeverityCounts as Counts } from "@/lib/severity";
import { s } from "./styles";

export function SeverityCounts({
  counts,
  active = null,
  onSelect,
  size = "md",
}: {
  counts: Counts | null | undefined;
  active?: Severity | null;
  onSelect?: (severity: Severity | null) => void;
  size?: "sm" | "md";
}) {
  const t = useTranslations("prReview");

  if (counts == null) return <span style={s.muted(size)}>—</span>;
  if (isEmptyCounts(counts)) return <span style={s.muted(size)}>0</span>;

  const nonZero = SEVERITIES.filter((sev) => counts[sev] > 0);

  return (
    <span style={s.group}>
      {nonZero.map((sev) => {
        const meta = SEV[sev];
        const I = Icon[meta.icon];
        const label = t(`panel.severity.${sev}`);
        const isActive = active === sev;
        const a11y = t("panel.severityFilterTitle", { severity: label, count: counts[sev] });

        if (!onSelect) {
          return (
            <span key={sev} style={s.item(meta.c, isActive, size)} title={a11y} aria-label={a11y}>
              <I size={size === "sm" ? 12 : 13} />
              <span className="tnum">{counts[sev]}</span>
            </span>
          );
        }
        return (
          <button
            key={sev}
            type="button"
            title={a11y}
            aria-label={a11y}
            aria-pressed={isActive}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(isActive ? null : sev);
            }}
            style={{ ...s.item(meta.c, isActive, size), ...s.button }}
          >
            <I size={size === "sm" ? 12 : 13} />
            <span className="tnum">{counts[sev]}</span>
          </button>
        );
      })}
    </span>
  );
}

export default SeverityCounts;
