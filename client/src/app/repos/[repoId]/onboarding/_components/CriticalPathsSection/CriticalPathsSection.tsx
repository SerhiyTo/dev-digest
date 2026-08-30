"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { s } from "./styles";

export function CriticalPathsSection({
  section,
  repoId,
}: {
  section: OnboardingSection;
  repoId: string;
}) {
  const t = useTranslations("onboarding");
  const entries = section.critical_paths;

  if (entries != null) {
    if (entries.length === 0) {
      return <p style={s.empty}>{t("sections.critical_paths.empty")}</p>;
    }
    return (
      <ul style={s.list}>
        {entries.map((entry) => (
          <li key={entry.path} style={s.row}>
            <div style={s.rowHeader}>
              <span className="mono" style={s.path}>
                {entry.path}
              </span>
              <Link
                href={`/repos/${repoId}/files?path=${encodeURIComponent(entry.path)}`}
                style={s.open}
              >
                {t("open")}
              </Link>
            </div>
            <p style={s.reason}>{entry.reason}</p>
          </li>
        ))}
      </ul>
    );
  }

  if (section.body) {
    return <Markdown>{section.body}</Markdown>;
  }

  return <p style={s.empty}>{t("sections.critical_paths.empty")}</p>;
}

export default CriticalPathsSection;
