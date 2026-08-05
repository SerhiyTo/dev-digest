"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const untrusted = skill.source !== "manual";

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <p style={s.caption}>{t("preview.caption")}</p>
        {untrusted && <Badge color="var(--warn)">{t("preview.untrustedBadge")}</Badge>}
      </div>
      {untrusted && <div style={s.notice}>{t("preview.untrustedNotice")}</div>}
      <div style={s.markdown}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
