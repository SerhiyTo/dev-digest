import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import {
  scoreEvalCase,
  aggregateEvalRun,
  EVAL_LINE_TOLERANCE,
  type EvalExpectation,
} from '../src/index.js';

function expectation(overrides: Partial<EvalExpectation> = {}): EvalExpectation {
  return {
    kind: 'must_find',
    file: 'src/x.ts',
    line: 10,
    category: 'security',
    ...overrides,
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? `f-${Math.random().toString(36).slice(2)}`,
    severity: 'WARNING',
    category: 'security',
    title: 'a finding',
    file: 'src/x.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'because',
    confidence: 0.9,
    ...overrides,
  } as Finding;
}

describe('scoreEvalCase — match rule (AC-28)', () => {
  it('matches when file, widened line range and category all agree', () => {
    const result = scoreEvalCase([expectation()], [finding()]);
    expect(result.mustFindMatched).toBe(1);
  });

  it('does not match when the file differs', () => {
    const result = scoreEvalCase([expectation({ file: 'src/x.ts' })], [
      finding({ file: 'src/y.ts' }),
    ]);
    expect(result.mustFindMatched).toBe(0);
  });

  it('does not match when the category differs', () => {
    const result = scoreEvalCase([expectation({ category: 'security' })], [
      finding({ category: 'bug' }),
    ]);
    expect(result.mustFindMatched).toBe(0);
  });

  it('matches a finding one line inside the widened window and not one line outside', () => {
    const exp = expectation({ line: 10 });
    const insideMatch = scoreEvalCase([exp], [finding({ start_line: 13, end_line: 13 })]);
    const outsideMatch = scoreEvalCase([exp], [finding({ start_line: 14, end_line: 14 })]);
    expect(insideMatch.mustFindMatched).toBe(1);
    expect(outsideMatch.mustFindMatched).toBe(0);
  });
});

describe('scoreEvalCase — the ±3 tolerance is one constant (AC-56)', () => {
  it('exposes the constant as 3', () => {
    expect(EVAL_LINE_TOLERANCE).toBe(3);
  });

  it('a finding 3 lines outside the expectation matches; 4 lines outside does not', () => {
    const exp = expectation({ line: 10 });
    const threeOut = scoreEvalCase([exp], [finding({ start_line: 13, end_line: 13 })]);
    const fourOut = scoreEvalCase([exp], [finding({ start_line: 14, end_line: 14 })]);
    expect(threeOut.mustFindMatched).toBe(1);
    expect(fourOut.mustFindMatched).toBe(0);
  });

  it('uses the same window for citation accuracy as for the match rule', () => {
    const exp = expectation({ line: 10 });
    const threeOut = scoreEvalCase([exp], [finding({ start_line: 13, end_line: 13 })]);
    expect(threeOut.citationAccuracy).toBe(1);
  });
});

describe('scoreEvalCase — severity and title agreement never decide the match (AC-29)', () => {
  it('records disagreement but still counts the match', () => {
    const exp = expectation({ severity: 'CRITICAL', title_contains: 'race condition' });
    const result = scoreEvalCase(
      [exp],
      [finding({ severity: 'SUGGESTION', title: 'unrelated title' })],
    );
    expect(result.mustFindMatched).toBe(1);
    const [outcome] = result.expectationOutcomes;
    expect(outcome?.matched).toBe(true);
    expect(outcome?.severityAgreement).toBe(false);
    expect(outcome?.titleAgreement).toBe(false);
  });

  it('records agreement when severity and title both agree', () => {
    const exp = expectation({ severity: 'WARNING', title_contains: 'a finding' });
    const result = scoreEvalCase([exp], [finding({ severity: 'WARNING', title: 'a finding' })]);
    const [outcome] = result.expectationOutcomes;
    expect(outcome?.severityAgreement).toBe(true);
    expect(outcome?.titleAgreement).toBe(true);
  });

  it('leaves both fields null when the expectation does not specify them', () => {
    const result = scoreEvalCase([expectation()], [finding()]);
    const [outcome] = result.expectationOutcomes;
    expect(outcome?.severityAgreement).toBeNull();
    expect(outcome?.titleAgreement).toBeNull();
  });
});

describe('aggregateEvalRun — recall (AC-30, AC-31)', () => {
  it('divides matched must_find by present must_find, excluding a must_not_flag-only case', () => {
    const caseWithMustFind = scoreEvalCase(
      [expectation({ line: 10 }), expectation({ line: 50 })],
      [finding({ start_line: 10, end_line: 10 })],
    );
    const caseWithoutMustFind = scoreEvalCase(
      [expectation({ kind: 'must_not_flag', line: 90 })],
      [],
    );
    const withoutExtra = aggregateEvalRun([caseWithMustFind]);
    const withExtra = aggregateEvalRun([caseWithMustFind, caseWithoutMustFind]);

    expect(withoutExtra.recall).toBe(0.5);
    expect(withExtra.recall).toBe(0.5);
  });
});

describe('aggregateEvalRun — precision (AC-32)', () => {
  it('counts a finding that violates a must_not_flag expectation as unmatched', () => {
    const exp = expectation({ kind: 'must_not_flag', line: 20 });
    const result = scoreEvalCase([exp], [finding({ start_line: 20, end_line: 20 })]);
    expect(result.mustNotFlagViolated).toBe(1);
    expect(result.precision).toBe(0);
    expect(aggregateEvalRun([result]).precision).toBe(0);
  });
});

describe('scoreEvalCase — citation accuracy (AC-33)', () => {
  it('excludes a matched finding whose full range is not contained in the widened window', () => {
    const exp = expectation({ line: 10 });
    const result = scoreEvalCase([exp], [finding({ start_line: 12, end_line: 16 })]);
    expect(result.mustFindMatched).toBe(1);
    expect(result.citationAccuracy).toBe(0);
  });
});

describe('scoreEvalCase — pass rule (AC-34)', () => {
  it('passes when every must_find matched and no must_not_flag violated', () => {
    const result = scoreEvalCase(
      [expectation({ kind: 'must_find', line: 10 }), expectation({ kind: 'must_not_flag', line: 50 })],
      [finding({ start_line: 10, end_line: 10 })],
    );
    expect(result.passed).toBe(true);
  });

  it('fails when a must_find is unmatched and no must_not_flag violated', () => {
    const result = scoreEvalCase(
      [expectation({ kind: 'must_find', line: 10 }), expectation({ kind: 'must_not_flag', line: 50 })],
      [],
    );
    expect(result.passed).toBe(false);
  });

  it('fails when every must_find matched but a must_not_flag is violated', () => {
    const result = scoreEvalCase(
      [expectation({ kind: 'must_find', line: 10 }), expectation({ kind: 'must_not_flag', line: 50 })],
      [finding({ start_line: 10, end_line: 10 }), finding({ start_line: 50, end_line: 50 })],
    );
    expect(result.passed).toBe(false);
  });

  it('fails when a must_find is unmatched and a must_not_flag is violated', () => {
    const result = scoreEvalCase(
      [expectation({ kind: 'must_find', line: 10 }), expectation({ kind: 'must_not_flag', line: 50 })],
      [finding({ start_line: 50, end_line: 50 })],
    );
    expect(result.passed).toBe(false);
  });
});

describe('scoreEvalCase — not-computed metrics are null, never zero (AC-35, AC-36)', () => {
  it('reports recall as not computed when there is no must_find expectation', () => {
    const result = scoreEvalCase([expectation({ kind: 'must_not_flag' })], []);
    expect(result.recall).toBeNull();
    expect(aggregateEvalRun([result]).recall).toBeNull();
  });

  it('reports precision as not computed when the agent reported no findings, and excludes it from the aggregate', () => {
    const zeroFindings = scoreEvalCase([expectation()], []);
    const withFindings = scoreEvalCase([expectation({ line: 30 })], [
      finding({ start_line: 30, end_line: 30 }),
    ]);
    expect(zeroFindings.precision).toBeNull();
    expect(aggregateEvalRun([zeroFindings, withFindings]).precision).toBe(1);
  });
});

describe('scoreEvalCase — empty expectation list asserts silence (AC-13)', () => {
  it('passes when there are no expectations and no findings', () => {
    const result = scoreEvalCase([], []);
    expect(result.passed).toBe(true);
    expect(result.recall).toBeNull();
    expect(result.precision).toBeNull();
  });
});

describe('scoreEvalCase — ordering does not change the result (AC-37)', () => {
  it('produces identical metrics regardless of expectation and finding order', () => {
    const expectations = [
      expectation({ kind: 'must_find', line: 10 }),
      expectation({ kind: 'must_find', line: 40 }),
      expectation({ kind: 'must_not_flag', line: 90 }),
    ];
    const findings = [
      finding({ id: 'a', start_line: 10, end_line: 10 }),
      finding({ id: 'b', start_line: 40, end_line: 40 }),
    ];

    const forward = scoreEvalCase(expectations, findings);
    const reversed = scoreEvalCase([...expectations].reverse(), [...findings].reverse());

    expect(reversed.recall).toBe(forward.recall);
    expect(reversed.precision).toBe(forward.precision);
    expect(reversed.citationAccuracy).toBe(forward.citationAccuracy);
    expect(reversed.passed).toBe(forward.passed);
  });
});

describe('scoreEvalCase — severity disagreement leaves the match count alone (AC-29)', () => {
  it('reports the same match count for an agreeing and a disagreeing severity', () => {
    const agreeing = scoreEvalCase(
      [expectation({ severity: 'WARNING' })],
      [finding({ severity: 'WARNING' })],
    );
    const disagreeing = scoreEvalCase(
      [expectation({ severity: 'CRITICAL' })],
      [finding({ severity: 'WARNING' })],
    );

    expect(disagreeing.mustFindMatched).toBe(agreeing.mustFindMatched);
    expect(disagreeing.recall).toBe(agreeing.recall);
    expect(disagreeing.expectationOutcomes[0]?.severityAgreement).toBe(false);
    expect(agreeing.expectationOutcomes[0]?.severityAgreement).toBe(true);
  });
});

describe('aggregateEvalRun — citation accuracy across the run (AC-33)', () => {
  it("reports the run's citation accuracy as the fraction of matched findings cited inside the widened window", () => {
    const citedInside = scoreEvalCase([expectation({ line: 10 })], [
      finding({ start_line: 10, end_line: 10 }),
    ]);
    const citedOutside = scoreEvalCase([expectation({ line: 40 })], [
      finding({ start_line: 42, end_line: 46 }),
    ]);

    expect(citedInside.citationAccuracy).toBe(1);
    expect(citedOutside.mustFindMatched).toBe(1);
    expect(citedOutside.citationAccuracy).toBe(0);
    expect(aggregateEvalRun([citedInside, citedOutside]).citationAccuracy).toBe(0.5);
  });
});

describe('aggregateEvalRun — ordering does not change the aggregate (AC-37)', () => {
  it('produces identical run metrics when the case results are reordered', () => {
    const caseA = scoreEvalCase([expectation({ line: 10 })], [finding({ start_line: 10, end_line: 10 })]);
    const caseB = scoreEvalCase([expectation({ line: 40 }), expectation({ line: 80 })], [
      finding({ start_line: 40, end_line: 40 }),
    ]);
    const caseC = scoreEvalCase([expectation({ kind: 'must_not_flag', line: 90 })], []);

    const forward = aggregateEvalRun([caseA, caseB, caseC]);
    const reversed = aggregateEvalRun([caseC, caseB, caseA]);

    expect(reversed).toEqual(forward);
  });
});
