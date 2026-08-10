import type { SmartDiffRole } from "@devdigest/shared";

/** Declared locally rather than via SmartDiffRole.options: a value import from
    @devdigest/shared drags the vendored barrel into the webpack build. */
export const ROLE_ORDER: readonly SmartDiffRole[] = ["core", "wiring", "boilerplate"] as const;

export const ROLE_DOT: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  wiring: "var(--warn)",
  boilerplate: "var(--text-muted)",
};

export const SCROLL_TO_TARGET_TRIES = 12;
export const SCROLL_TO_TARGET_STEP_MS = 120;
export const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown"] as const;
