import { describe, it, expect } from "vitest";
import type { EvalCaseRecord, EvalExpectation } from "@devdigest/shared";
import { caseStatus, expectationChip, passingTally } from "./helpers";

function makeCase(overrides: Partial<EvalCaseRecord>): EvalCaseRecord {
  return {
    id: "case-1",
    owner_kind: "agent",
    owner_id: "agent-1",
    name: "case",
    input_diff: "",
    input_files: null,
    input_meta: null,
    expected_output: [],
    notes: null,
    source_finding_id: null,
    expectation_kinds: [],
    last_run_at: null,
    last_run_pass: null,
    created_at: "2026-08-30T00:00:00Z",
    ...overrides,
  };
}

function makeExpectation(overrides: Partial<EvalExpectation> = {}): EvalExpectation {
  return {
    kind: "must_find",
    file: "src/config.ts",
    line: 1,
    end_line: null,
    category: "security",
    severity: "CRITICAL",
    title_contains: null,
    ...overrides,
  };
}

describe("caseStatus", () => {
  it("reports never for a case that has not run", () => {
    expect(caseStatus(makeCase({ last_run_at: null, last_run_pass: null }))).toBe("never");
  });

  it("reports passed and failed once a run exists", () => {
    expect(caseStatus(makeCase({ last_run_at: "2026-08-30T00:00:00Z", last_run_pass: true }))).toBe("passed");
    expect(caseStatus(makeCase({ last_run_at: "2026-08-30T00:00:00Z", last_run_pass: false }))).toBe("failed");
  });
});

describe("expectationChip", () => {
  it("joins the first expectation's severity and category", () => {
    expect(expectationChip([makeExpectation()])).toBe("CRITICAL · security");
  });

  it("falls back to the category alone when the expectation states no severity", () => {
    expect(expectationChip([makeExpectation({ severity: null, category: "bug" })])).toBe("bug");
  });

  it("returns null for an empty expectation list so the caller can name that state itself", () => {
    expect(expectationChip([])).toBeNull();
  });
});

describe("passingTally", () => {
  it("counts only the cases whose last run passed", () => {
    expect(
      passingTally([
        makeCase({ id: "a", last_run_pass: true }),
        makeCase({ id: "b", last_run_pass: false }),
        makeCase({ id: "c", last_run_pass: null }),
      ]),
    ).toEqual({ passed: 1, total: 3 });
  });
});
