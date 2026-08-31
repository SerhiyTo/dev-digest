import { describe, it, expect } from 'vitest';
import {
  deriveExpectationFromFinding,
  disambiguateCaseName,
  resolveFindingActionState,
  truncateCaseName,
  type FindingForEvalCase,
} from '../src/modules/eval/domain.js';
import { MAX_EVAL_CASE_NAME_LENGTH } from '../src/modules/eval/constants.js';
import {
  toEvalCaseRecord,
  toEvalRunRecord,
  toEvalSuiteRunRecord,
} from '../src/modules/eval/helpers.js';

function finding(overrides: Partial<FindingForEvalCase> = {}): FindingForEvalCase {
  return {
    file: 'src/index.ts',
    startLine: 10,
    endLine: 12,
    category: 'bug',
    acceptedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

describe('resolveFindingActionState', () => {
  it('reads accepted, dismissed and undecided off the timestamps', () => {
    expect(resolveFindingActionState({ acceptedAt: new Date(), dismissedAt: null })).toBe(
      'accepted',
    );
    expect(resolveFindingActionState({ acceptedAt: null, dismissedAt: new Date() })).toBe(
      'dismissed',
    );
    expect(resolveFindingActionState({ acceptedAt: null, dismissedAt: null })).toBe('undecided');
  });
});

describe('deriveExpectationFromFinding — AC-1, AC-2, AC-3', () => {
  it('derives exactly one must_find expectation from an accepted finding', () => {
    const result = deriveExpectationFromFinding(finding({ acceptedAt: new Date() }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok result');
    expect(result.expectations).toHaveLength(1);
    expect(result.expectations[0]).toMatchObject({
      kind: 'must_find',
      file: 'src/index.ts',
      line: 10,
      end_line: 12,
      category: 'bug',
    });
  });

  it('derives exactly one must_not_flag expectation from a dismissed finding', () => {
    const result = deriveExpectationFromFinding(finding({ dismissedAt: new Date() }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok result');
    expect(result.expectations).toHaveLength(1);
    expect(result.expectations[0]).toMatchObject({
      kind: 'must_not_flag',
      file: 'src/index.ts',
      line: 10,
      end_line: 12,
      category: 'bug',
    });
  });

  it('refuses a finding that is neither accepted nor dismissed', () => {
    const result = deriveExpectationFromFinding(finding());
    expect(result).toEqual({ ok: false, reason: 'undecided' });
  });
});

describe('disambiguateCaseName — AC-8', () => {
  it('leaves a unique name untouched', () => {
    expect(disambiguateCaseName('SQL injection risk', [])).toBe('SQL injection risk');
  });

  it('appends a numeric suffix on collision, and keeps incrementing past a second collision', () => {
    expect(disambiguateCaseName('SQL injection risk', ['SQL injection risk'])).toBe(
      'SQL injection risk 2',
    );
    expect(
      disambiguateCaseName('SQL injection risk', [
        'SQL injection risk',
        'SQL injection risk 2',
      ]),
    ).toBe('SQL injection risk 3');
  });

  it('produces distinct names for two findings sharing a title', () => {
    const first = disambiguateCaseName('Same title', []);
    const second = disambiguateCaseName('Same title', [first]);
    expect(first).not.toBe(second);
  });

  it('yields a suffixed candidate distinct from the truncated base name, which is what lets the suffix search terminate for an over-long finding title', () => {
    const longTitle = 'x'.repeat(MAX_EVAL_CASE_NAME_LENGTH + 40);
    const truncated = truncateCaseName(longTitle);
    expect(truncated).toHaveLength(MAX_EVAL_CASE_NAME_LENGTH);

    expect(truncateCaseName(`${truncated} 2`)).not.toBe(truncated);
    expect(truncateCaseName(`${truncated} 3`)).not.toBe(truncateCaseName(`${truncated} 2`));
  });
});

describe('eval DTO helpers', () => {
  it('maps a case row to EvalCaseRecord', () => {
    const dto = toEvalCaseRecord({
      id: 'case-1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'Case',
      inputDiff: 'diff --git a/x b/x',
      inputFiles: null,
      inputMeta: null,
      expectedOutput: [
        { kind: 'must_find', file: 'x.ts', line: 1, category: 'bug' },
      ],
      notes: null,
      sourceFindingId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      expectationKinds: ['must_find'],
      lastRunAt: null,
      lastRunPass: null,
    });
    expect(dto.id).toBe('case-1');
    expect(dto.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('maps a run row to EvalRunRecord', () => {
    const dto = toEvalRunRecord({
      id: 'run-1',
      caseId: 'case-1',
      suiteRunId: null,
      agentVersion: null,
      ranAt: new Date('2026-01-02T00:00:00.000Z'),
      actualOutput: null,
      pass: null,
      recall: null,
      precision: null,
      citationAccuracy: null,
      durationMs: null,
      costUsd: null,
    });
    expect(dto.id).toBe('run-1');
    expect(dto.ran_at).toBe('2026-01-02T00:00:00.000Z');
  });

  it('maps a suite-run row to EvalSuiteRunRecord', () => {
    const dto = toEvalSuiteRunRecord({
      id: 'suite-1',
      agentId: 'agent-1',
      agentVersion: 3,
      status: 'running',
      startedAt: new Date('2026-01-03T00:00:00.000Z'),
      finishedAt: null,
      casesTotal: 8,
      casesPassed: null,
      recall: null,
      precision: null,
      citationAccuracy: null,
      costUsd: null,
      durationMs: null,
    });
    expect(dto.status).toBe('running');
    expect(dto.started_at).toBe('2026-01-03T00:00:00.000Z');
  });

  it('throws AppError(internal_error, …, 500) when a row fails its own contract', () => {
    expect(() =>
      toEvalSuiteRunRecord({
        id: 'suite-1',
        agentId: 'agent-1',
        agentVersion: 3,
        status: 'not_a_real_status',
        startedAt: new Date(),
        finishedAt: null,
        casesTotal: 8,
        casesPassed: null,
        recall: null,
        precision: null,
        citationAccuracy: null,
        costUsd: null,
        durationMs: null,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'internal_error', statusCode: 500 }),
    );
  });
});
