import type { SmartDiffRole } from "@devdigest/shared";

export const ROLE_ORDER: readonly SmartDiffRole[] = ["core", "wiring", "boilerplate"] as const;

export const ROLE_DOT: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  wiring: "var(--warn)",
  boilerplate: "var(--text-muted)",
};
