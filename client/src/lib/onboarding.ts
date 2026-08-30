import type { OnboardingSectionKind, OnboardingTaskComplexity } from "@devdigest/shared";

export const ONBOARDING_SECTION_KINDS: readonly OnboardingSectionKind[] = [
  "architecture",
  "critical_paths",
  "run_locally",
  "reading_path",
  "first_tasks",
] as const;

export const COMPLEXITY: Record<
  OnboardingTaskComplexity,
  { c: string; bg: string; label: string }
> = {
  low: { c: "var(--ok)", bg: "var(--ok-bg)", label: "Low" },
  medium: { c: "var(--warn)", bg: "var(--warn-bg)", label: "Medium" },
  high: { c: "var(--crit)", bg: "var(--crit-bg)", label: "High" },
};

export function complexityStyle(
  complexity: OnboardingTaskComplexity,
): { c: string; bg: string; label: string } {
  return COMPLEXITY[complexity];
}
