import { describe, it, expect } from "vitest";
import type { CiFailOn, FindingRecord, ReviewRecord, Risk } from "@devdigest/shared";
import { composeBlockingReasons, judgementsDisagree, visibleBlockingReasons } from "./helpers";

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

function review(findings: FindingRecord[]): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "ag",
    run_id: "run-1",
    agent_name: "Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 40,
    model: "gpt-4.1",
    created_at: "2026-08-24T00:00:00.000Z",
    findings,
  } as ReviewRecord;
}

function risk(o: Partial<Risk>): Risk {
  return {
    kind: "security",
    title: "risk title",
    explanation: "why it matters",
    severity: "high",
    file_refs: ["src/risky.ts:10-14"],
    ...o,
  } as Risk;
}

describe("composeBlockingReasons", () => {
  it("unions gated findings with high risks, findings first by severity desc, risks in stored order", () => {
    const reasons = composeBlockingReasons({
      review: review([
        finding({ id: "warn", severity: "WARNING", title: "warn finding" }),
        finding({ id: "crit", severity: "CRITICAL", title: "crit finding" }),
      ]),
      run: { ci_fail_on: "warning" },
      risks: [
        risk({ title: "risk one", severity: "high" }),
        risk({ title: "risk two", severity: "high" }),
      ],
    });

    expect(reasons.map((r) => r.title)).toEqual([
      "crit finding",
      "warn finding",
      "risk one",
      "risk two",
    ]);
  });

  it("derives a finding's ref from file/start_line/end_line, and no rationale/explanation field exists", () => {
    const reasons = composeBlockingReasons({
      review: review([finding({ file: "src/b.ts", start_line: 5, end_line: 9 })]),
      run: { ci_fail_on: "critical" },
      risks: [],
    });
    expect(reasons[0]!.ref).toEqual({ path: "src/b.ts", startLine: 5, endLine: 9 });
    expect(reasons[0]).not.toHaveProperty("rationale");
    expect(reasons[0]).not.toHaveProperty("explanation");
  });

  it("derives a risk's ref from file_refs[0] via formatFileRef", () => {
    const reasons = composeBlockingReasons({
      review: review([]),
      run: { ci_fail_on: "critical" },
      risks: [risk({ file_refs: ["src/risky.ts:10-14"] })],
    });
    expect(reasons[0]!.ref).toEqual({ path: "src/risky.ts", startLine: 10, endLine: 14 });
  });

  it("excludes a dismissed finding even though it meets the gate", () => {
    const reasons = composeBlockingReasons({
      review: review([
        finding({ severity: "CRITICAL", dismissed_at: "2026-08-24T00:00:00.000Z" }),
      ]),
      run: { ci_fail_on: "critical" },
      risks: [],
    });
    expect(reasons).toHaveLength(0);
  });

  it("excludes medium and low risks — only 'high' risks contribute", () => {
    const reasons = composeBlockingReasons({
      review: review([]),
      run: { ci_fail_on: "critical" },
      risks: [risk({ severity: "medium" }), risk({ severity: "low" })],
    });
    expect(reasons).toHaveLength(0);
  });

  const GATE_CASES: { gate: CiFailOn; expectCritical: boolean; expectWarning: boolean }[] = [
    { gate: "never", expectCritical: false, expectWarning: false },
    { gate: "critical", expectCritical: true, expectWarning: false },
    { gate: "warning", expectCritical: true, expectWarning: true },
    { gate: "any", expectCritical: true, expectWarning: true },
  ];

  it.each(GATE_CASES)(
    "gate '$gate' selects findings by severity correctly",
    ({ gate, expectCritical, expectWarning }) => {
      const reasons = composeBlockingReasons({
        review: review([
          finding({ id: "crit", severity: "CRITICAL", title: "crit finding" }),
          finding({ id: "warn", severity: "WARNING", title: "warn finding" }),
        ]),
        run: { ci_fail_on: gate },
        risks: [],
      });
      const titles = reasons.map((r) => r.title);
      expect(titles.includes("crit finding")).toBe(expectCritical);
      expect(titles.includes("warn finding")).toBe(expectWarning);
    },
  );

  it("a null gate behaves exactly as 'critical' (AC-93), tested deliberately", () => {
    const reasons = composeBlockingReasons({
      review: review([
        finding({ id: "crit", severity: "CRITICAL", title: "crit finding" }),
        finding({ id: "warn", severity: "WARNING", title: "warn finding" }),
      ]),
      run: { ci_fail_on: null },
      risks: [],
    });
    expect(reasons.map((r) => r.title)).toEqual(["crit finding"]);
  });

  it("treats a missing run the same as a null gate", () => {
    const reasons = composeBlockingReasons({
      review: review([finding({ severity: "WARNING" })]),
      run: null,
      risks: [],
    });
    expect(reasons).toHaveLength(0);
  });
});

describe("visibleBlockingReasons", () => {
  function reasonsOf(count: number) {
    return composeBlockingReasons({
      review: review([]),
      run: { ci_fail_on: "critical" },
      risks: Array.from({ length: count }, (_, i) =>
        risk({ title: `risk ${i}`, file_refs: [`src/r${i}.ts:1`] }),
      ),
    });
  }

  it("returns every row with hiddenCount 0 at or under the cap", () => {
    const { rows, hiddenCount } = visibleBlockingReasons(reasonsOf(8));
    expect(rows).toHaveLength(8);
    expect(hiddenCount).toBe(0);
  });

  it("caps at 8 rows and reports how many are hidden beyond that", () => {
    const { rows, hiddenCount } = visibleBlockingReasons(reasonsOf(11));
    expect(rows).toHaveLength(8);
    expect(hiddenCount).toBe(3);
    expect(rows.map((r) => r.title)).toEqual(
      Array.from({ length: 8 }, (_, i) => `risk ${i}`),
    );
  });
});

describe("judgementsDisagree", () => {
  it("is true when the review approves but the brief rates merge risk high", () => {
    expect(
      judgementsDisagree({ verdict: "approve", blockerCount: 2, mergeRisk: "high" }),
    ).toBe(true);
  });

  it("is true when there are zero live blockers but the brief rates merge risk high", () => {
    expect(
      judgementsDisagree({ verdict: "request_changes", blockerCount: 0, mergeRisk: "high" }),
    ).toBe(true);
  });

  it("is false when merge risk is not high, regardless of verdict or blocker count", () => {
    expect(
      judgementsDisagree({ verdict: "approve", blockerCount: 0, mergeRisk: "medium" }),
    ).toBe(false);
    expect(
      judgementsDisagree({ verdict: "approve", blockerCount: 0, mergeRisk: "low" }),
    ).toBe(false);
  });

  it("is false when merge risk is high but the review requests changes with live blockers", () => {
    expect(
      judgementsDisagree({ verdict: "request_changes", blockerCount: 2, mergeRisk: "high" }),
    ).toBe(false);
  });
});
