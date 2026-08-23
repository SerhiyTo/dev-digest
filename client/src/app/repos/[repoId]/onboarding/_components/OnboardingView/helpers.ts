import type { Onboarding, OnboardingSection, OnboardingSectionKind } from "@devdigest/shared";

export function sectionByKind(
  tour: Onboarding | null | undefined,
  kind: OnboardingSectionKind,
): OnboardingSection | undefined {
  return tour?.sections.find((section) => section.kind === kind);
}

export function isStale(
  currentSha: string | null | undefined,
  generatedSha: string | null | undefined,
): boolean {
  return currentSha != null && generatedSha != null && currentSha !== generatedSha;
}
