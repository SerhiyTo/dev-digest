import type { EvalCaseRecord, EvalExpectation } from "@devdigest/shared";

export type EvalCaseStatus = "passed" | "failed" | "never";

export function caseStatus(caseRecord: EvalCaseRecord): EvalCaseStatus {
  if (caseRecord.last_run_at === null) return "never";
  return caseRecord.last_run_pass ? "passed" : "failed";
}

export function expectationChip(expected: EvalExpectation[]): string | null {
  const [first] = expected;
  if (!first) return null;
  return first.severity ? `${first.severity} · ${first.category}` : first.category;
}

export function passingTally(cases: EvalCaseRecord[]): { passed: number; total: number } {
  return {
    passed: cases.filter((c) => c.last_run_pass === true).length,
    total: cases.length,
  };
}
