import type { SkillListItem } from "../../../../lib/hooks/skills";

export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function filterSkills(skills: SkillListItem[], search: string): SkillListItem[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}
