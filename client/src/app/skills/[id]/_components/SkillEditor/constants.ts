import type { IconName } from "@devdigest/ui";

export interface SkillEditorTabDescriptor {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly SkillEditorTabDescriptor[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];
