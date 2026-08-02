"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITIES, type SeverityCounts } from "@/lib/severity";
import { s } from "./styles";

export function SeverityFilterBar({
  counts,
  active,
  onSelect,
}: {
  counts: SeverityCounts;
  active: Severity | null;
  onSelect: (severity: Severity | null) => void;
}) {
  const t = useTranslations("prReview");

  return (
    <div style={s.bar}>
      {SEVERITIES.map((sev) => {
        const meta = SEV[sev];
        const isActive = active === sev;
        const empty = counts[sev] === 0;
        return (
          <span key={sev} style={empty ? s.emptyChip : undefined}>
            <Chip
              active={isActive}
              icon={meta.icon}
              color={meta.c}
              count={counts[sev]}
              title={
                isActive
                  ? t("panel.severityFilterClear", { severity: t(`panel.severity.${sev}`) })
                  : t("panel.severityFilterTitle", {
                      severity: t(`panel.severity.${sev}`),
                      count: counts[sev],
                    })
              }
              onClick={empty ? undefined : () => onSelect(isActive ? null : sev)}
            >
              {t(`panel.severity.${sev}`)}
            </Chip>
          </span>
        );
      })}
      <span style={s.hint}>{t("panel.severityCountsHint")}</span>
    </div>
  );
}

export default SeverityFilterBar;
