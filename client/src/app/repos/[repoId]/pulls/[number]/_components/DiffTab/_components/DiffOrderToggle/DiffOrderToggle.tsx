"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s, tabFor } from "./styles";

export type DiffOrder = "smart" | "original";

export function DiffOrderToggle({
  value,
  onChange,
}: {
  value: DiffOrder;
  onChange: (value: DiffOrder) => void;
}) {
  const t = useTranslations("prReview");

  const options: { key: DiffOrder; label: string }[] = [
    { key: "smart", label: t("smartDiff.orderSmart") },
    { key: "original", label: t("smartDiff.orderOriginal") },
  ];

  return (
    <div role="tablist" aria-label={t("smartDiff.orderAriaLabel")} style={s.list}>
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
