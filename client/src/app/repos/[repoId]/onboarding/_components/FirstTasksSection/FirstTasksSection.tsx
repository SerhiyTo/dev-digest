"use client";

import { useTranslations } from "next-intl";
import { Badge, Markdown } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { complexityStyle } from "@/lib/onboarding";
import { s } from "./styles";

export function FirstTasksSection({ section }: { section: OnboardingSection }) {
  const t = useTranslations("onboarding");
  const tasks = section.first_tasks;

  if (tasks == null) {
    return <Markdown>{section.body}</Markdown>;
  }

  if (tasks.length === 0) {
    return <p style={s.empty}>{t("sections.first_tasks.empty")}</p>;
  }

  return (
    <ul style={s.list}>
      {tasks.map((task, index) => {
        const complexity = complexityStyle(task.complexity);
        return (
          <li key={`${index}-${task.title}`} style={s.item}>
            <div style={s.row}>
              <div style={s.taskBlock}>
                <p style={s.title}>{task.title}</p>
                <code className="mono" style={s.hintPath}>
                  {task.hint_path}
                </code>
              </div>
              <Badge color={complexity.c} bg={complexity.bg}>
                {t(`complexity.${task.complexity}`)}
              </Badge>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
