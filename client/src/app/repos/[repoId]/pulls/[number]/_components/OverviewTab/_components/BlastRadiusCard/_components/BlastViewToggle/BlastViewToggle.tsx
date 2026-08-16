"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s, tabFor } from "./styles";

export type BlastView = "tree" | "graph";

export function BlastViewToggle({
  value,
  onChange,
}: {
  value: BlastView;
  onChange: (value: BlastView) => void;
}) {
  const t = useTranslations("blast");

  const options: { key: BlastView; label: string }[] = [
    { key: "tree", label: t("view.tree") },
    { key: "graph", label: t("view.graph") },
  ];

  return (
    <div role="tablist" aria-label={t("view.ariaLabel")} style={s.list}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          onClick={() => onChange(option.key)}
          style={tabFor(value === option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
