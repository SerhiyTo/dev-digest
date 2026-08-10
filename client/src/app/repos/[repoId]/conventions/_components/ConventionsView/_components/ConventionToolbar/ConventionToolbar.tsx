"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export function ConventionToolbar({
  accepted,
  total,
  onDeselectAll,
  onCreateSkill,
  busy,
}: {
  accepted: number;
  total: number;
  onDeselectAll: () => void;
  onCreateSkill: () => void;
  busy: boolean;
}) {
  const t = useTranslations("conventions");
  const hasAccepted = accepted > 0;

  return (
    <div style={s.bar}>
      <Button kind="ghost" size="sm" icon="X" onClick={onDeselectAll} disabled={!hasAccepted || busy}>
        {t("toolbar.deselectAll")}
      </Button>
      <span style={s.counter}>{t("toolbar.counter", { accepted, total })}</span>
      <div style={s.spacer} />
      <Button
        kind="primary"
        size="sm"
        icon="Sparkles"
        onClick={onCreateSkill}
        disabled={!hasAccepted}
        title={hasAccepted ? undefined : t("toolbar.createSkillHint")}
      >
        {t("toolbar.createSkill")}
      </Button>
    </div>
  );
}
