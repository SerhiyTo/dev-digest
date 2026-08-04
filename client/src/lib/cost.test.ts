/* Unit tests for formatCost — the adaptive-precision USD formatter used by the
   PR list Cost column, the run timeline, and the trace drawer COST stat.
   Spec: specs/2026-07-29-run-cost.md */
import { describe, it, expect } from "vitest";
import { formatCost } from "./cost";

describe("formatCost", () => {
  it("renders missing data as a dash, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("renders a genuine zero cost as $0.00 (free models)", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it.each([
    [0.0013, "$0.0013"],
    [0.00134, "$0.0013"],
    [0.014, "$0.014"],
    [0.0139, "$0.014"],
    [0.06, "$0.06"],
    [0.0999, "$0.10"],
    [0.123, "$0.12"],
    [0.5, "$0.50"],
  ])("sub-dollar %f → %s (2 significant digits, min 2 decimals)", (usd, out) => {
    expect(formatCost(usd)).toBe(out);
  });

  it.each([
    [1, "$1.00"],
    [1.238, "$1.24"],
    [12.5, "$12.50"],
  ])("dollar-plus %f → %s (2 decimals)", (usd, out) => {
    expect(formatCost(usd)).toBe(out);
  });

  it("floors vanishingly small costs at <$0.0001", () => {
    expect(formatCost(0.00005)).toBe("<$0.0001");
  });
});
