"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { BlastViewToggle, type BlastView } from "../BlastViewToggle";
import { s } from "./styles";

export function BlastStatsRow({
  symbolCount,
  callerCount,
  endpointCount,
  cronCount,
  truncated,
  view,
  onViewChange,
}: {
  symbolCount: number;
  callerCount: number;
  endpointCount: number;
  cronCount: number;
  truncated: boolean;
  view: BlastView;
  onViewChange: (view: BlastView) => void;
}) {
  const t = useTranslations("blast");

  const callerText = truncated
    ? t("statTruncated.callers", { count: callerCount })
    : t("stat.callers", { count: callerCount });

  return (
    <div style={s.row}>
      <span className="mono tnum" style={s.text}>
        {t("stat.symbols", { count: symbolCount })} · {callerText} ·{" "}
        {t("stat.endpoints", { count: endpointCount })} · {t("stat.crons", { count: cronCount })}
      </span>
      <BlastViewToggle value={view} onChange={onViewChange} />
    </div>
  );
}
