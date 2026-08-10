import type { AgentSkillLink } from "@devdigest/shared";

export function orderedLinkedIds(links: readonly AgentSkillLink[]): string[] {
  return [...links].sort((a, b) => a.order - b.order).map((link) => link.skill_id);
}

export function matchesFilter(name: string, description: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${name} ${description}`.toLowerCase().includes(q);
}

export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) {
    return [...list];
  }
  const next = [...list];
  const item = next.splice(from, 1)[0] as T;
  next.splice(to, 0, item);
  return next;
}
