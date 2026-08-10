/**
 * Confidence is DERIVED from which evidence was actually present, never
 * self-reported by the classifier: verbalized LLM confidence is systematically
 * overconfident and poorly correlated with correctness. The classifier's schema
 * therefore has no `confidence` key, and `scoreConfidence` takes evidence — not
 * classification — so there is no path by which a model-supplied number can
 * reach the stored value. The last test in this file pins that property.
 */
import { describe, it, expect } from 'vitest';
import { gatherEvidence, scoreConfidence, type IntentSignals } from '../src/modules/intent/confidence.js';
import { INTENT_EVIDENCE_WEIGHTS } from '../src/modules/intent/constants.js';
import type { IntentEvidenceKind } from '@devdigest/shared';

const EMPTY: IntentSignals = {
  title: '',
  body: null,
  branch: '',
  changedPaths: [],
  commitMessages: [],
  docReferences: [],
  docsRead: [],
  externalReferences: [],
};

function kinds(signals: IntentSignals): IntentEvidenceKind[] {
  return gatherEvidence(signals).map((e) => e.kind);
}

describe('gatherEvidence — one signal at a time', () => {
  const CASES: [IntentEvidenceKind, Partial<IntentSignals>][] = [
    ['pr_body', { body: 'short note' }],
    ['pr_body_detailed', { body: 'x'.repeat(200) }],
    ['doc_reference_read', { docsRead: ['docs/plan.md'], docReferences: [{ path: 'docs/plan.md' }] }],
    ['doc_reference_unresolved', { docReferences: [{ path: 'docs/gone.md' }] }],
    ['commit_messages', { commitMessages: ['add rate limiting middleware', 'return 429 with retry-after'] }],
    ['conventional_prefix', { title: 'feat: add limiter' }],
    ['issue_reference', { externalReferences: [{ kind: 'issue', ref: '#471' }] }],
    ['issue_read', { externalReferences: [{ kind: 'issue', ref: '#471' }], issuesRead: ['#471'] }],
    ['external_link', { externalReferences: [{ kind: 'url', ref: 'https://wiki.test/p' }] }],
    [
      'external_link_read',
      { externalReferences: [{ kind: 'url', ref: 'https://wiki.test/p' }], linksRead: ['https://wiki.test/p'] },
    ],
    ['changed_paths', { changedPaths: ['src/a.ts'] }],
  ];

  it.each(CASES)('emits %s in isolation', (kind, partial) => {
    const found = kinds({ ...EMPTY, ...partial });
    expect(found).toContain(kind);
    expect(scoreConfidence(gatherEvidence({ ...EMPTY, ...partial }))).toBeGreaterThan(0);
  });

  it('every emitted item carries its registry weight', () => {
    for (const [, partial] of CASES) {
      for (const e of gatherEvidence({ ...EMPTY, ...partial })) {
        expect(e.weight).toBe(INTENT_EVIDENCE_WEIGHTS[e.kind]);
      }
    }
  });
});

describe('gatherEvidence — mutually exclusive pairs', () => {
  it('prefers doc_reference_read over doc_reference_unresolved', () => {
    const found = kinds({ ...EMPTY, docReferences: [{ path: 'docs/p.md' }], docsRead: ['docs/p.md'] });
    expect(found).toContain('doc_reference_read');
    expect(found).not.toContain('doc_reference_unresolved');
  });

  it('scores a ticket and a link independently, each on its own tier', () => {
    const found = kinds({
      ...EMPTY,
      externalReferences: [
        { kind: 'url', ref: 'https://wiki.test/p' },
        { kind: 'jira', ref: 'ABC-1234' },
      ],
    });
    expect(found).toContain('issue_reference');
    expect(found).toContain('external_link');
  });

  it('prefers the read tier over the merely-referenced tier', () => {
    const found = kinds({
      ...EMPTY,
      externalReferences: [
        { kind: 'issue', ref: '#471' },
        { kind: 'url', ref: 'https://wiki.test/p' },
      ],
      issuesRead: ['#471'],
      linksRead: ['https://wiki.test/p'],
    });
    expect(found).toContain('issue_read');
    expect(found).toContain('external_link_read');
    expect(found).not.toContain('issue_reference');
    expect(found).not.toContain('external_link');
  });

  it('a fetched reference outweighs an unfetched one', () => {
    const referenced = scoreConfidence(
      gatherEvidence({ ...EMPTY, externalReferences: [{ kind: 'issue', ref: '#471' }] }),
    );
    const read = scoreConfidence(
      gatherEvidence({
        ...EMPTY,
        externalReferences: [{ kind: 'issue', ref: '#471' }],
        issuesRead: ['#471'],
      }),
    );
    expect(read).toBeGreaterThan(referenced);
  });

  it('does not count a short commit list as descriptive', () => {
    expect(kinds({ ...EMPTY, commitMessages: ['a much longer descriptive message'] })).not.toContain(
      'commit_messages',
    );
  });
});

describe('scoreConfidence', () => {
  it('scores an empty PR at exactly 0', () => {
    expect(scoreConfidence(gatherEvidence(EMPTY))).toBe(0);
  });

  it('a bare PR with only a file list scores low', () => {
    const score = scoreConfidence(gatherEvidence({ ...EMPTY, changedPaths: ['src/a.ts'] }));
    expect(score).toBeCloseTo(0.1, 5);
    expect(score).toBeLessThan(0.5);
  });

  it('a PR whose every reference was actually fetched saturates at 1', () => {
    const rich: IntentSignals = {
      title: 'feat: add rate limiting',
      body: 'x'.repeat(400),
      branch: 'feat/rate-limit-public',
      changedPaths: ['src/a.ts', 'src/b.ts'],
      commitMessages: ['add rate limiting middleware', 'return 429 with retry-after header'],
      docReferences: [{ path: 'docs/plan.md' }],
      docsRead: ['docs/plan.md'],
      externalReferences: [
        { kind: 'issue', ref: '#471' },
        { kind: 'url', ref: 'https://wiki.test/rfc' },
      ],
      issuesRead: ['#471'],
      linksRead: ['https://wiki.test/rfc'],
    };
    expect(scoreConfidence(gatherEvidence(rich))).toBe(1);
  });

  it('the same PR scores lower when nothing could be fetched', () => {
    const unfetched: IntentSignals = {
      title: 'feat: add rate limiting',
      body: 'x'.repeat(400),
      branch: 'feat/rate-limit-public',
      changedPaths: ['src/a.ts'],
      commitMessages: ['add rate limiting middleware', 'return 429 with retry-after header'],
      docReferences: [{ path: 'docs/plan.md' }],
      docsRead: [],
      externalReferences: [
        { kind: 'issue', ref: '#471' },
        { kind: 'url', ref: 'https://wiki.test/rfc' },
      ],
    };
    const score = scoreConfidence(gatherEvidence(unfetched));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
    expect(kinds(unfetched)).toEqual(
      expect.arrayContaining(['doc_reference_unresolved', 'issue_reference', 'external_link']),
    );
  });

  it('clamps above 1 rather than overflowing', () => {
    expect(scoreConfidence([{ kind: 'pr_body', detail: 'x', weight: 1 }, { kind: 'changed_paths', detail: 'y', weight: 1 }])).toBe(1);
  });

  it('is deterministic across repeated calls', () => {
    const signals = { ...EMPTY, body: 'a description', changedPaths: ['src/a.ts'] };
    const scores = new Set(Array.from({ length: 100 }, () => scoreConfidence(gatherEvidence(signals))));
    expect(scores.size).toBe(1);
  });

  it('ignores a model-supplied confidence entirely', () => {
    const signals = { ...EMPTY, changedPaths: ['src/a.ts'] };
    const classification = { intent: 'x', in_scope: [], out_of_scope: [], confidence: 0.99 };
    const evidenceItems = gatherEvidence(signals);

    expect(scoreConfidence(evidenceItems)).toBeCloseTo(0.1, 5);
    expect(evidenceItems.some((e) => 'confidence' in e)).toBe(false);
    expect(Object.keys(classification)).toContain('confidence');
  });
});
