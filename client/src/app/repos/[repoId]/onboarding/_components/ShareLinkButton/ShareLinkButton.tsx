"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { COPIED_RESET_MS } from "./constants";
import { copyCurrentPageUrl } from "./helpers";
import { s } from "./styles";

type ShareStatus = "idle" | "copied" | "failed";

export function ShareLinkButton() {
  const t = useTranslations("onboarding");
  const [status, setStatus] = React.useState<ShareStatus>("idle");

  React.useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const share = async () => {
    setStatus((await copyCurrentPageUrl()) ? "copied" : "failed");
  };

  return (
    <div style={s.wrap}>
      <Button kind="secondary" icon="Link" onClick={() => void share()}>
        {t("share.label")}
      </Button>
      {status === "copied" && (
        <span role="status" style={s.confirm}>
          {t("share.copied")}
        </span>
      )}
      {status === "failed" && (
        <div style={s.failure}>
          <span role="alert" style={s.failureText}>
            {t("share.failed")}
          </span>
          <input
            readOnly
            aria-label={t("share.label")}
            value={typeof window === "undefined" ? "" : window.location.href}
            onFocus={(event) => event.currentTarget.select()}
            style={s.urlInput}
          />
        </div>
      )}
    </div>
  );
}
