import { describe, it, expect } from 'vitest';
import { mergeDecisions } from '../src/modules/conventions/merge.js';

describe('mergeDecisions', () => {
  it('carries a prior verdict onto the matching incoming rule', () => {
    const prior = [
      { rule: 'Always use async/await instead of .then() chains.', status: 'accepted' as const },
      { rule: 'Log with the shared pino instance.', status: 'rejected' as const },
    ];
    const incoming = [
      { rule: 'Always use async/await instead of .then() chains.' },
      { rule: 'Log with the shared pino instance.' },
    ];

    expect(mergeDecisions(prior, incoming).map((c) => c.status)).toEqual(['accepted', 'rejected']);
  });

  it('matches through casing and punctuation drift', () => {
    const prior = [{ rule: 'Use async/await!', status: 'accepted' as const }];

    expect(mergeDecisions(prior, [{ rule: 'use ASYNC await' }])[0]!.status).toBe('accepted');
  });

  it('lands a genuinely new rule as pending', () => {
    const prior = [{ rule: 'Use async/await.', status: 'accepted' as const }];

    expect(mergeDecisions(prior, [{ rule: 'Validate input with zod.' }])[0]!.status).toBe('pending');
  });

  it('preserves the incoming payload alongside the status', () => {
    const merged = mergeDecisions([], [{ rule: 'Validate input with zod.', confidence: 0.7 }]);

    expect(merged[0]).toEqual({ rule: 'Validate input with zod.', confidence: 0.7, status: 'pending' });
  });
});
