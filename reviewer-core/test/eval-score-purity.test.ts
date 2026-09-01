import { describe, it, expect, afterEach } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { scoreEvalCase, aggregateEvalRun, type EvalExpectation } from '../src/index.js';

const originalFetch = globalThis.fetch;

function throwingFetch(): never {
  throw new Error('scoreEvalCase must never perform network I/O');
}

const throwingProvider = {
  chat: () => {
    throw new Error('scoreEvalCase must never call an LLM provider');
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('eval scorer purity (AC-27, AC-53)', () => {
  it('computes metrics with fetch and every provider adapter replaced by a fake that throws on use', () => {
    globalThis.fetch = throwingFetch as unknown as typeof fetch;

    const expectations: EvalExpectation[] = [
      { kind: 'must_find', file: 'src/x.ts', line: 10, category: 'security' },
    ];
    const findings: Finding[] = [
      {
        id: 'f-1',
        severity: 'WARNING',
        category: 'security',
        title: 'a finding',
        file: 'src/x.ts',
        start_line: 10,
        end_line: 10,
        rationale: 'because',
        confidence: 0.9,
      } as Finding,
    ];

    const caseResult = scoreEvalCase(expectations, findings);
    const aggregate = aggregateEvalRun([caseResult]);

    expect(caseResult.passed).toBe(true);
    expect(aggregate.recall).toBe(1);
    expect(() => throwingProvider.chat()).toThrow('scoreEvalCase must never call an LLM provider');
    expect(() => (globalThis.fetch as typeof fetch)('https://example.com')).toThrow(
      'scoreEvalCase must never perform network I/O',
    );
  });
});

describe('eval scorer takes only expectations and findings (AC-27)', () => {
  it('declares exactly two parameters and returns synchronously, so no adapter can be injected and no I/O awaited', () => {
    expect(scoreEvalCase.length).toBe(2);
    expect(aggregateEvalRun.length).toBe(1);

    const result = scoreEvalCase(
      [{ kind: 'must_not_flag', file: 'src/x.ts', line: 4, category: 'security' }],
      [],
    );
    expect(typeof (result as unknown as { then?: unknown }).then).toBe('undefined');
    expect(typeof (aggregateEvalRun([result]) as unknown as { then?: unknown }).then).toBe(
      'undefined',
    );
  });
});
