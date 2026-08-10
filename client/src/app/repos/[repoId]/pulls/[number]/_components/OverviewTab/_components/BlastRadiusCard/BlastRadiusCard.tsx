"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, SectionLabel } from "@devdigest/ui";
import { s } from "./styles";

export function BlastRadiusCard() {
  const t = useTranslations("brief");

  return (
    <section style={s.card}>
      <SectionLabel icon="Workflow">{t("block.blast")}</SectionLabel>
      <div style={s.body}>
        <EmptyState icon="Workflow" title={t("blast.comingSoon")} body={t("blast.comingSoonHint")} />
      </div>
    </section>
  );
}
