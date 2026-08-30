import { describe, it, expect } from "vitest";
import type { OnboardingTaskComplexity } from "@devdigest/shared";
import { COMPLEXITY, complexityStyle, ONBOARDING_SECTION_KINDS } from "./onboarding";

describe("ONBOARDING_SECTION_KINDS", () => {
  it("lists the five sections in AC-1 order", () => {
    expect(ONBOARDING_SECTION_KINDS).toEqual([
      "architecture",
      "critical_paths",
      "run_locally",
      "reading_path",
      "first_tasks",
    ]);
  });
});

describe("complexityStyle", () => {
  const complexities: OnboardingTaskComplexity[] = ["low", "medium", "high"];

  it("resolves all three complexity values", () => {
    for (const complexity of complexities) {
      expect(complexityStyle(complexity)).toBe(COMPLEXITY[complexity]);
    }
  });

  it("carries a distinct colour and accessible label per complexity", () => {
    expect(complexityStyle("low")).toEqual({ c: "var(--ok)", bg: "var(--ok-bg)", label: "Low" });
    expect(complexityStyle("medium")).toEqual({
      c: "var(--warn)",
      bg: "var(--warn-bg)",
      label: "Medium",
    });
    expect(complexityStyle("high")).toEqual({
      c: "var(--crit)",
      bg: "var(--crit-bg)",
      label: "High",
    });
    const colors = complexities.map((c) => complexityStyle(c).c);
    expect(new Set(colors).size).toBe(3);
  });
});
