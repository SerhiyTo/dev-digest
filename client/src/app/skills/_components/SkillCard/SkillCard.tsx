"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { SkillListItem } from "../../../../lib/hooks/skills";
import { VETTING_BADGE_COLOR } from "./constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: SkillListItem;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const needsVetting = skill.source !== "manual";

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("listItem.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge>{t(`listItem.source.${skill.source}`)}</Badge>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color={VETTING_BADGE_COLOR}>{t("listItem.needsVetting")}</Badge>
          </span>
        )}
      </div>
      <div style={s.footer}>{t("listItem.footer", { agents: skill.used_by })}</div>
    </div>
  );
}
