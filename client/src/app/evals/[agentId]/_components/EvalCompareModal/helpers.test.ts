import { describe, it, expect } from "vitest";
import {
  diffMetric,
  isSameAgentVersion,
  orderRunsByAge,
  promptDiffState,
  type EvalCompareRunInput,
} from "./helpers";

function run(overrides: Partial<EvalCompareRunInput> = {}): EvalCompareRunInput {
  return {
    runId: "run-1",
    ranAt: "2026-08-01T00:00:00.000Z",
    agentVersion: 1,
    recall: 0.5,
    precision: 0.5,
    citationAccuracy: 0.5,
    costUsd: 0.1,
    ...overrides,
  };
}

describe("orderRunsByAge", () => {
  it("puts the earlier ranAt on the left regardless of argument order", () => {
    const earlier = run({ runId: "a", ranAt: "2026-08-01T00:00:00.000Z" });
    const later = run({ runId: "b", ranAt: "2026-08-05T00:00:00.000Z" });

    expect(orderRunsByAge(earlier, later)).toEqual({ older: earlier, newer: later });
    expect(orderRunsByAge(later, earlier)).toEqual({ older: earlier, newer: later });
  });
});

describe("diffMetric", () => {
  it("computes older, newer and their difference", () => {
    expect(diffMetric(0.5, 0.75)).toEqual({ older: 0.5, newer: 0.75, diff: 0.25 });
  });

  it("reports no difference when either side is not computed", () => {
    expect(diffMetric(null, 0.75)).toEqual({ older: null, newer: 0.75, diff: null });
    expect(diffMetric(0.5, null)).toEqual({ older: 0.5, newer: null, diff: null });
  });
});

describe("isSameAgentVersion", () => {
  it("is true only when both runs carry the same agent version", () => {
    expect(isSameAgentVersion(run({ agentVersion: 3 }), run({ agentVersion: 3 }))).toBe(true);
    expect(isSameAgentVersion(run({ agentVersion: 3 }), run({ agentVersion: 4 }))).toBe(false);
  });
});

describe("promptDiffState", () => {
  it("reports the patch as unavailable when the server could not read both snapshots", () => {
    expect(promptDiffState(null, false)).toBe("unavailable");
    expect(promptDiffState(null, true)).toBe("unavailable");
  });

  it("reports two runs at the same agent version as an unchanged configuration", () => {
    expect(promptDiffState("@@ -1 +1 @@", true)).toBe("same_version");
  });

  it("distinguishes an empty patch from one with content", () => {
    expect(promptDiffState("", false)).toBe("unchanged");
    expect(promptDiffState("@@ -1 +1 @@\n-old\n+new", false)).toBe("patch");
  });
});
