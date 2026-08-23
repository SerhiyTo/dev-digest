"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { s } from "./styles";

export function ReadingPathSection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");
  const steps = section.reading_path;

  if (steps != null) {
    if (steps.length === 0) {
      return <p style={s.empty}>{t("sections.reading_path.empty")}</p>;
    }
    return (
      <ol style={s.list}>
        {steps.map((step, index) => (
          <li key={step.path} style={s.row}>
            <span style={s.index}>{index + 1}</span>
            <div>
              <div className="mono" style={s.path}>
                {step.path}
              </div>
              <p style={s.rationale}>{step.rationale}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (section.body) {
    return <Markdown>{section.body}</Markdown>;
  }

  return <p style={s.empty}>{t("sections.reading_path.empty")}</p>;
}

export default ReadingPathSection;
