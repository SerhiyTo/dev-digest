import type { OnboardingSectionKind } from "@devdigest/shared";
import { ONBOARDING_SECTION_KINDS } from "@/lib/onboarding";
import { ACTIVE_THRESHOLD_PX } from "./constants";

export function onboardingSectionElementId(kind: OnboardingSectionKind): string {
  return `onboarding-section-${kind}`;
}

export function nearestActiveKind(threshold: number = ACTIVE_THRESHOLD_PX): OnboardingSectionKind {
  let active: OnboardingSectionKind = ONBOARDING_SECTION_KINDS[0] ?? "architecture";
  for (const kind of ONBOARDING_SECTION_KINDS) {
    const el = document.getElementById(onboardingSectionElementId(kind));
    if (el && el.getBoundingClientRect().top <= threshold) {
      active = kind;
    }
  }
  return active;
}
