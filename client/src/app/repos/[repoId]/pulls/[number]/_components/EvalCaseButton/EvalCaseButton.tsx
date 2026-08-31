"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export interface EvalCaseButtonCreated {
  id: string;
  name: string;
}

export interface EvalCaseButtonProps {
  acceptedAt: string | null;
  dismissedAt: string | null;
  onCreate: () => Promise<EvalCaseButtonCreated>;
  onOpen?: (caseId: string) => void;
}

export function EvalCaseButton({
  acceptedAt,
  dismissedAt,
  onCreate,
  onOpen,
}: EvalCaseButtonProps) {
  const t = useTranslations("prReview");
  const [pending, setPending] = React.useState(false);
  const [created, setCreated] = React.useState<EvalCaseButtonCreated | null>(null);
  const decided = !!acceptedAt || !!dismissedAt;

  async function handleClick() {
    setPending(true);
    try {
      const result = await onCreate();
      setCreated(result);
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <div style={s.confirmation}>
        <span style={s.confirmationText}>
          {t("finding.evalCaseCreated", { name: created.name })}
        </span>
        {onOpen && (
          <Button kind="tertiary" size="sm" onClick={() => onOpen(created.id)}>
            {t("finding.openEvalCase")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!decided || pending}
        onClick={handleClick}
      >
        {t("finding.turnIntoEvalCase")}
      </Button>
      {!decided && <span style={s.hint}>{t("finding.turnIntoEvalCaseDisabled")}</span>}
    </div>
  );
}
