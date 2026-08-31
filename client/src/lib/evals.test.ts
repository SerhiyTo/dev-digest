import { describe, it, expect } from "vitest";
import type { EvalRunRecord, EvalSuiteRunRecord } from "@devdigest/shared";
import {
  aggregateMetric,
  caseTally,
  currentAndPreviousSnapshots,
  fallenMetrics,
  deltaLabelDescriptor,
  formatMetricPercent,
  gotFindingCount,
  gotFindingCountByCase,
  isAnyRunActive,
  isCancellableRun,
  isCompareReady,
  isSelectableForCompare,
  metricDeltaFraction,
  metricDeltaPoints,
  metricPercentValue,
  toggleSelection,
} from "./evals";

function run(overrides: Partial<EvalSuiteRunRecord> = {}): EvalSuiteRunRecord {
  return {
    id: "suite-1",
    agent_id: "agent-1",
    agent_version: 3,
    status: "done",
    started_at: "2026-08-29T00:00:00Z",
    finished_at: "2026-08-29T00:01:00Z",
    cases_total: 20,
    cases_passed: 17,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    cost_usd: 0.23,
    duration_ms: 60_000,
    ...overrides,
  };
}

describe("metric formatting", () => {
  it("renders a computed metric as a rounded percentage", () => {
    expect(formatMetricPercent(0.824)).toBe("82%");
    expect(metricPercentValue(0.824)).toBe(82);
  });

  it("returns null rather than zero for a metric with no denominator", () => {
    expect(formatMetricPercent(null)).toBeNull();
    expect(metricPercentValue(null)).toBeNull();
  });
});

describe("metric deltas", () => {
  it("reports the delta in points and as a raw fraction", () => {
    expect(metricDeltaPoints(0.82, 0.78)).toBe(4);
    expect(metricDeltaFraction(0.82, 0.78)).toBeCloseTo(0.04, 5);
  });

  it("has no delta when either side is missing", () => {
    expect(metricDeltaPoints(0.82, null)).toBeNull();
    expect(metricDeltaFraction(null, 0.78)).toBeNull();
  });

  it("labels a flat delta explicitly rather than as an improvement", () => {
    expect(deltaLabelDescriptor(0)).toEqual({ key: "deltaFlat", amount: 0 });
    expect(deltaLabelDescriptor(3)).toEqual({ key: "deltaUp", amount: 3 });
    expect(deltaLabelDescriptor(-2)).toEqual({ key: "deltaDown", amount: 2 });
  });
});

describe("fallenMetrics", () => {
  it("names every metric that fell, with its magnitude", () => {
    const fallen = fallenMetrics(
      { recall: 0.8, precision: 0.89, citation_accuracy: 0.95 },
      { recall: 0.78, precision: 0.91, citation_accuracy: 0.95 },
    );
    expect(fallen).toEqual([{ field: "precision", amount: 2 }]);
  });

  it("reports nothing when there is no previous run to compare against", () => {
    expect(fallenMetrics({ recall: 0.8, precision: 0.9, citation_accuracy: 0.9 }, null)).toEqual([]);
  });
});

describe("currentAndPreviousSnapshots", () => {
  it("takes the two newest completed runs, ignoring running and cancelled ones", () => {
    const { current, previous } = currentAndPreviousSnapshots([
      run({ id: "r-running", status: "running", started_at: "2026-08-31T00:00:00Z" }),
      run({ id: "r-new", started_at: "2026-08-30T00:00:00Z", recall: 0.9 }),
      run({ id: "r-cancelled", status: "cancelled", started_at: "2026-08-29T12:00:00Z" }),
      run({ id: "r-old", started_at: "2026-08-28T00:00:00Z", recall: 0.7 }),
    ]);
    expect(current.recall).toBe(0.9);
    expect(previous?.recall).toBe(0.7);
  });

  it("has no previous snapshot when only one run has completed", () => {
    const { previous } = currentAndPreviousSnapshots([run()]);
    expect(previous).toBeNull();
  });
});

describe("run state predicates", () => {
  it("only offers a completed run for comparison", () => {
    expect(isSelectableForCompare(run())).toBe(true);
    expect(isSelectableForCompare(run({ status: "running" }))).toBe(false);
    expect(isSelectableForCompare(run({ status: "cancelled" }))).toBe(false);
  });

  it("only offers cancellation while a run is in flight", () => {
    expect(isCancellableRun(run({ status: "running" }))).toBe(true);
    expect(isCancellableRun(run())).toBe(false);
  });

  it("suppresses the aggregate metrics of a cancelled run", () => {
    expect(aggregateMetric(run(), "recall")).toBe(0.82);
    expect(aggregateMetric(run({ status: "cancelled" }), "recall")).toBeNull();
  });

  it("detects an in-flight run across the list", () => {
    expect(isAnyRunActive([run(), run({ id: "r2", status: "running" })])).toBe(true);
    expect(isAnyRunActive([run()])).toBe(false);
  });

  it("has no tally until both counts are recorded", () => {
    expect(caseTally(run())).toEqual({ passed: 17, total: 20 });
    expect(caseTally(run({ cases_passed: null }))).toBeNull();
  });
});

describe("compare selection", () => {
  it("is ready at exactly two selections", () => {
    expect(isCompareReady([])).toBe(false);
    expect(isCompareReady(["a"])).toBe(false);
    expect(isCompareReady(["a", "b"])).toBe(true);
    expect(isCompareReady(["a", "b", "c"])).toBe(false);
  });

  it("toggles a run in and out of the selection", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a")).toEqual(["b"]);
  });
});

function makeRun(overrides: Partial<EvalRunRecord>): EvalRunRecord {
  return {
    id: "run-1",
    case_id: "case-1",
    case_name: null,
    suite_run_id: "suite-1",
    agent_version: 1,
    ran_at: "2026-08-30T00:00:00Z",
    actual_output: null,
    pass: null,
    recall: null,
    precision: null,
    citation_accuracy: null,
    duration_ms: null,
    cost_usd: null,
    ...overrides,
  };
}

describe("gotFindingCount", () => {
  it("counts the findings a review returned", () => {
    expect(gotFindingCount({ findings: [{}, {}, {}] })).toBe(3);
    expect(gotFindingCount({ findings: [] })).toBe(0);
  });

  it("returns null for the error shape the runner writes on a failed case", () => {
    expect(gotFindingCount({ error: "provider credential missing" })).toBeNull();
  });

  it("returns null rather than zero for anything that is not a review", () => {
    expect(gotFindingCount(null)).toBeNull();
    expect(gotFindingCount(undefined)).toBeNull();
    expect(gotFindingCount("findings")).toBeNull();
    expect(gotFindingCount({ findings: "two" })).toBeNull();
  });
});

describe("gotFindingCountByCase", () => {
  it("maps each case to its finding count and leaves uncountable runs out of the map", () => {
    const map = gotFindingCountByCase([
      makeRun({ id: "r1", case_id: "case-a", actual_output: { findings: [{}] } }),
      makeRun({ id: "r2", case_id: "case-b", actual_output: { error: "boom" } }),
    ]);

    expect(map.get("case-a")).toBe(1);
    expect(map.has("case-b")).toBe(false);
  });

  it("keeps the first countable run when a case appears more than once", () => {
    const map = gotFindingCountByCase([
      makeRun({ id: "r1", case_id: "case-a", actual_output: { findings: [{}, {}] } }),
      makeRun({ id: "r2", case_id: "case-a", actual_output: { findings: [] } }),
    ]);

    expect(map.get("case-a")).toBe(2);
  });
});
