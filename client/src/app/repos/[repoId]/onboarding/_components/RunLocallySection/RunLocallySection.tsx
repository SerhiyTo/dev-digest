"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Markdown } from "@devdigest/ui";
import type { OnboardingRunLocallyStep, OnboardingSection } from "@devdigest/shared";
import { s } from "./styles";

type CopyStatus = "idle" | "copied" | "failed";

function CommandRow({
  step,
  t,
}: {
  step: OnboardingRunLocallyStep;
  t: ReturnType<typeof useTranslations>;
}) {
  const [status, setStatus] = React.useState<CopyStatus>("idle");

  const copy = () => {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      setStatus("failed");
      return;
    }
    clipboard.writeText(step.command).then(
      () => {
        setStatus("copied");
        setTimeout(() => setStatus("idle"), 1500);
      },
      () => setStatus("failed"),
    );
  };

  return (
    <li style={s.item}>
      <div style={s.row}>
        <div style={s.commandBlock}>
          <code className="mono" style={s.command}>
            {step.command}
          </code>
          {step.note && <p style={s.note}>{step.note}</p>}
        </div>
        <Button
          kind="secondary"
          size="sm"
          icon={status === "copied" ? "Check" : "Copy"}
          onClick={copy}
        >
          {status === "copied" ? t("copy.copied") : t("copy.action")}
        </Button>
      </div>
      {status === "failed" && (
        <p role="alert" style={s.copyFailed}>
          {t("copy.failed")}
        </p>
      )}
    </li>
  );
}

export function RunLocallySection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");
  const steps = section.run_locally;

  if (steps == null) {
    return <Markdown>{section.body}</Markdown>;
  }

  if (steps.length === 0) {
    return <p style={s.empty}>{t("sections.run_locally.empty")}</p>;
  }

  return (
    <ul style={s.list}>
      {steps.map((step, index) => (
        <CommandRow key={`${index}-${step.command}`} step={step} t={t} />
      ))}
    </ul>
  );
}
