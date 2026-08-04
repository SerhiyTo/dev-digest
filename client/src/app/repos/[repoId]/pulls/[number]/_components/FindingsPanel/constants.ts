import type { FindingActionKind } from "@devdigest/shared";

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};

export const SCROLL_TO_TARGET_TRIES = 12;
export const SCROLL_TO_TARGET_STEP_MS = 120;
export const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown"] as const;
