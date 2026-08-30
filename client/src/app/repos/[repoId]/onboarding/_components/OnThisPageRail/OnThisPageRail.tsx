"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSectionKind } from "@devdigest/shared";
import { ONBOARDING_SECTION_KINDS } from "@/lib/onboarding";
import { SCROLL_CONTAINER_SELECTOR } from "./constants";
import { nearestActiveKind, onboardingSectionElementId } from "./helpers";
import { s } from "./styles";

export function OnThisPageRail() {
  const t = useTranslations("onboarding");
  const [active, setActive] = React.useState<OnboardingSectionKind>(
    () => ONBOARDING_SECTION_KINDS[0] ?? "architecture",
  );

  React.useEffect(() => {
    const container: Element | Window = document.querySelector(SCROLL_CONTAINER_SELECTOR) ?? window;
    const update = () => setActive(nearestActiveKind());
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, []);

  const activate = React.useCallback((kind: OnboardingSectionKind) => {
    document.getElementById(onboardingSectionElementId(kind))?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <nav aria-label={t("onThisPage")} style={s.rail}>
      <div style={s.label}>{t("onThisPage")}</div>
      <ul style={s.list}>
        {ONBOARDING_SECTION_KINDS.map((kind) => (
          <li key={kind} style={s.listItem}>
            <a
              href={`#${onboardingSectionElementId(kind)}`}
              aria-current={active === kind ? "true" : undefined}
              style={s.item(active === kind)}
              onClick={(event) => {
                event.preventDefault();
                activate(kind);
              }}
            >
              {t(`sections.${kind}.title`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
