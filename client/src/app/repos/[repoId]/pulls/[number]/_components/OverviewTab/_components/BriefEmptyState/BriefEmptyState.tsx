"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { s } from "./styles";

interface BriefEmptyStateProps {
  onGenerate: () => void;
  disabled?: boolean;
  running?: boolean;
}

export function BriefEmptyState({ onGenerate, disabled, running }: BriefEmptyStateProps) {
  const t = useTranslations("brief");
  const Sparkles = Icon.Sparkles;

  return (
    <div style={s.wrap}>
      <div style={s.iconWrap}>
        <Sparkles size={22} />
      </div>
      <div style={s.title}>{t("unavailable")}</div>
      <div style={s.body}>{t("unavailableHint")}</div>
      <div style={s.action}>
        <Button
          kind="secondary"
          icon="RefreshCw"
          loading={running}
          disabled={disabled}
          onClick={onGenerate}
        >
          {running ? t("generating") : t("generate")}
        </Button>
      </div>
    </div>
  );
}
