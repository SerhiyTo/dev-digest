"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { s } from "./styles";

export function ArchitectureSection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");

  if (!section.body) {
    return <p style={s.empty}>{t("sections.architecture.empty")}</p>;
  }

  return (
    <div>
      <Markdown>{section.body}</Markdown>
      {section.diagram && (
        <div style={s.diagram}>
          <MermaidDiagram chart={section.diagram} />
        </div>
      )}
    </div>
  );
}

export default ArchitectureSection;
