import { describe, it, expect } from "vitest";
import type { EvalSuiteRunRecord, EvalTrendPoint } from "@devdigest/shared";
import {
  DEFAULT_EVAL_RANGE,
  EVAL_RANGE_OPTIONS,
  filterRunsByRange,
  filterTrendByRange,
  rangeLabelKey,
  toCompareRunInput,
} from "./helpers";

const NOW = Date.parse("2026-08-31T00:00:00Z");

function run(id: string, startedAt: string): EvalSuiteRunRecord {
  return {
    id,
    agent_id: "agent-1",
    agent_version: 3,
    status: "done",
    started_at: startedAt,
    finished_at: startedAt,
    cases_total: 20,
    cases_passed: 17,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    cost_usd: 0.23,
    duration_ms: 1000,
  };
}

function point(ranAt: string): EvalTrendPoint {
  return { ran_at: ranAt, recall: 0.8, precision: 0.9, citation_accuracy: 0.95, pass_rate: 0.85, cost_usd: 0.2 };
}

describe("range options", () => {
  it("defaults to the 30-day window the header shows", () => {
    expect(DEFAULT_EVAL_RANGE).toBe(30);
    expect(EVAL_RANGE_OPTIONS).toEqual([7, 30, 90, null]);
  });

  it("maps every option to its own message key", () => {
    expect(EVAL_RANGE_OPTIONS.map(rangeLabelKey)).toEqual(["d7", "d30", "d90", "all"]);
  });
});

describe("filterRunsByRange", () => {
  it("keeps only the runs inside the window", () => {
    const runs = [run("recent", "2026-08-25T00:00:00Z"), run("old", "2026-06-01T00:00:00Z")];
    expect(filterRunsByRange(runs, 30, NOW).map((r) => r.id)).toEqual(["recent"]);
  });

  it("keeps every run when the range is all time", () => {
    const runs = [run("recent", "2026-08-25T00:00:00Z"), run("old", "2026-06-01T00:00:00Z")];
    expect(filterRunsByRange(runs, null, NOW)).toHaveLength(2);
  });

  it("keeps a run whose timestamp cannot be parsed rather than silently dropping it", () => {
    expect(filterRunsByRange([run("broken", "not-a-date")], 7, NOW)).toHaveLength(1);
  });
});

describe("filterTrendByRange", () => {
  it("filters the trend on the same window as the run list", () => {
    const trend = [point("2026-06-01T00:00:00Z"), point("2026-08-28T00:00:00Z")];
    expect(filterTrendByRange(trend, 30, NOW)).toHaveLength(1);
    expect(filterTrendByRange(trend, null, NOW)).toHaveLength(2);
  });
});

describe("toCompareRunInput", () => {
  it("maps a suite run onto the compare modal's input shape", () => {
    expect(toCompareRunInput(run("suite-1", "2026-08-29T00:00:00Z"))).toEqual({
      runId: "suite-1",
      ranAt: "2026-08-29T00:00:00Z",
      agentVersion: 3,
      recall: 0.82,
      precision: 0.91,
      citationAccuracy: 0.95,
      costUsd: 0.23,
    });
  });
});
