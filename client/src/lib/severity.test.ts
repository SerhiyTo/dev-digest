/* Severity counting + `?severity=` parsing. The counting rule ("active
   findings only") is the contract between the counters and the server's
   rollupSeverities, so it gets its own coverage.
   Spec: app specs/2026-08-01-findings-by-severity.md */
import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import {
  countActiveBySeverity,
  countsByRunId,
  emptySeverityCounts,
  hasFindingAtSeverity,
  isEmptyCounts,
  parseSeverity,
  runsMatchingSeverity,
} from "./severity";

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "CRITICAL",
    category: "bug",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "why",
    confidence: 0.9,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

describe("parseSeverity", () => {
  it("accepts the three contract severities", () => {
    expect(parseSeverity("CRITICAL")).toBe("CRITICAL");
    expect(parseSeverity("WARNING")).toBe("WARNING");
    expect(parseSeverity("SUGGESTION")).toBe("SUGGESTION");
  });

  it("degrades to no filter for anything else", () => {
    // A hand-typed or stale URL must show everything, not nothing.
    expect(parseSeverity("critical")).toBeNull();
    expect(parseSeverity("INFO")).toBeNull();
    expect(parseSeverity("")).toBeNull();
    expect(parseSeverity(null)).toBeNull();
    expect(parseSeverity(undefined)).toBeNull();
  });
});

describe("countActiveBySeverity", () => {
  it("tallies per severity", () => {
    expect(
      countActiveBySeverity([
        finding({ id: "a", severity: "CRITICAL" }),
        finding({ id: "b", severity: "CRITICAL" }),
        finding({ id: "c", severity: "WARNING" }),
        finding({ id: "d", severity: "SUGGESTION" }),
      ]),
    ).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it("excludes dismissed findings — they stay readable but stop counting", () => {
    expect(
      countActiveBySeverity([
        finding({ id: "a", severity: "CRITICAL" }),
        finding({ id: "b", severity: "CRITICAL", dismissed_at: "2026-08-01T00:00:00.000Z" }),
      ]),
    ).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });

  it("still counts accepted findings — accepting is not resolving", () => {
    expect(
      countActiveBySeverity([
        finding({ severity: "WARNING", accepted_at: "2026-08-01T00:00:00.000Z" }),
      ]).WARNING,
    ).toBe(1);
  });

  it("ignores unknown severities instead of leaking a stray key", () => {
    const counts = countActiveBySeverity([
      finding({ severity: "INFO" as FindingRecord["severity"] }),
    ]);
    expect(counts).toEqual(emptySeverityCounts());
    expect(Object.keys(counts)).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });

  it("is all-zero for no findings", () => {
    expect(countActiveBySeverity([])).toEqual(emptySeverityCounts());
    expect(isEmptyCounts(countActiveBySeverity([]))).toBe(true);
  });
});

describe("countsByRunId", () => {
  const review = (o: Partial<ReviewRecord>): ReviewRecord =>
    ({
      id: "rev",
      pr_id: "pr",
      agent_id: "ag",
      run_id: "run-1",
      agent_name: "Security Reviewer",
      kind: "review",
      verdict: "request_changes",
      summary: "s",
      score: 38,
      model: "gpt-4.1",
      created_at: "2026-08-01T00:00:00.000Z",
      findings: [],
      ...o,
    }) as ReviewRecord;

  it("keys counts by run_id", () => {
    const byRun = countsByRunId([
      review({ run_id: "run-1", findings: [finding({ severity: "CRITICAL" })] }),
      review({ id: "rev2", run_id: "run-2", findings: [finding({ severity: "WARNING" })] }),
    ]);
    expect(byRun["run-1"]).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
    expect(byRun["run-2"]).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
  });

  it("skips reviews with no run_id", () => {
    expect(countsByRunId([review({ run_id: null as unknown as string })])).toEqual({});
  });
});

describe("runsMatchingSeverity", () => {
  const review = (id: string, sevs: FindingRecord["severity"][]): ReviewRecord =>
    ({
      id,
      pr_id: "pr",
      agent_id: "ag",
      run_id: `run-${id}`,
      agent_name: id,
      kind: "review",
      verdict: "comment",
      summary: "s",
      score: 50,
      model: "gpt-4.1",
      created_at: "2026-08-02T00:00:00.000Z",
      findings: sevs.map((severity, i) => finding({ id: `${id}-${i}`, severity })),
    }) as ReviewRecord;

  const RUNS = [
    review("sec", ["CRITICAL", "WARNING"]),
    review("perf", ["SUGGESTION"]),
    review("clean", []),
  ];

  it("returns every run when no filter is set", () => {
    expect(runsMatchingSeverity(RUNS, null)).toHaveLength(3);
  });

  it("keeps only runs that have a finding at that severity", () => {
    expect(runsMatchingSeverity(RUNS, "CRITICAL").map((r) => r.id)).toEqual(["sec"]);
    expect(runsMatchingSeverity(RUNS, "SUGGESTION").map((r) => r.id)).toEqual(["perf"]);
  });

  it("keeps a run whose only match is dismissed, matching what the panel renders", () => {
    const withDismissed = [
      review("x", []),
    ];
    withDismissed[0]!.findings = [
      finding({ severity: "CRITICAL", dismissed_at: "2026-08-02T00:00:00.000Z" }),
    ];
    expect(runsMatchingSeverity(withDismissed, "CRITICAL")).toHaveLength(1);
  });

  it("returns nothing when no run has that severity", () => {
    expect(runsMatchingSeverity([review("clean", [])], "WARNING")).toEqual([]);
  });
});

describe("hasFindingAtSeverity", () => {
  it("is true with no filter", () => {
    expect(hasFindingAtSeverity([], null)).toBe(true);
  });

  it("matches on severity regardless of dismissal", () => {
    expect(hasFindingAtSeverity([finding({ severity: "WARNING" })], "WARNING")).toBe(true);
    expect(hasFindingAtSeverity([finding({ severity: "WARNING" })], "CRITICAL")).toBe(false);
  });
});
