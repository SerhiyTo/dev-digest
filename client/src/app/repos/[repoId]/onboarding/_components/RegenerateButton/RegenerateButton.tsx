"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useGenerateOnboarding } from "@/lib/hooks/onboarding";
import { s } from "./styles";

export function RegenerateButton({
  repoId,
  model,
  disabled,
}: {
  repoId: string;
  model: string;
  disabled?: boolean;
}) {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const generate = useGenerateOnboarding(repoId);
  const [confirming, setConfirming] = React.useState(false);

  return (
    <>
      <Button
        kind="secondary"
        icon="RefreshCw"
        disabled={disabled || generate.isPending}
        loading={generate.isPending}
        onClick={() => setConfirming(true)}
      >
        {generate.isPending ? t("regenerating") : t("regenerate")}
      </Button>
      {confirming && (
        <Modal
          title={t("regenerateConfirm.title")}
          onClose={() => setConfirming(false)}
          footer={
            <div style={s.footer}>
              <Button kind="ghost" onClick={() => setConfirming(false)}>
                {tCommon("actions.cancel")}
              </Button>
              <Button
                kind="primary"
                onClick={() => {
                  setConfirming(false);
                  generate.mutate();
                }}
              >
                {t("regenerateConfirm.confirm")}
              </Button>
            </div>
          }
        >
          {t("regenerateConfirm.body", { model })}
        </Modal>
      )}
    </>
  );
}
