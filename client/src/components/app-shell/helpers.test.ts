import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("matches the per-repo onboarding tour route", () => {
    expect(activeKeyFor("/repos/123/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/123/onboarding/")).toBe("onboarding-tour");
  });

  it("does not match the top-level Add Repository route", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
  });

  it("still matches the other per-repo routes", () => {
    expect(activeKeyFor("/repos/123/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/123/context")).toBe("context");
    expect(activeKeyFor("/repos/123/conventions")).toBe("conventions");
  });
});
