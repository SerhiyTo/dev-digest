/**
 * Reference extraction for the Intent Layer. `isSafeDocPath` is the ONLY barrier
 * between an attacker-controlled PR body and `GitClient.readFile`, which has no
 * traversal guard of its own — so the rejection table below is the regression
 * net for host file disclosure, not a style check.
 */
import { describe, it, expect } from 'vitest';
import {
  extractDocReferences,
  extractIssueReferences,
  extractLinkReferences,
  extractExternalReferences,
  isSafeDocPath,
} from '../src/modules/intent/references.js';
import { MAX_DOC_PATH_CHARS, MAX_EXTERNAL_REFERENCES } from '../src/modules/intent/constants.js';

describe('isSafeDocPath — rejects', () => {
  const REJECTED: [string, string][] = [
    ['../../etc/passwd', 'parent traversal'],
    ['/etc/passwd', 'absolute path'],
    ['docs/../../secrets.env', 'traversal through a doc root'],
    ['docs/./plan.md', 'dot segment'],
    ['docs%2f..%2f..%2fx.md', 'percent-encoded traversal'],
    ['%2e%2e/docs/plan.md', 'percent-encoded parent'],
    ['~/.ssh/id_rsa', 'home expansion'],
    ['file:///etc/passwd', 'file scheme'],
    ['https://evil.test/docs/plan.md', 'http scheme'],
    ['C:/docs/plan.md', 'windows drive'],
    ['docs\\plan.md', 'backslash separator'],
    ['src/index.ts', 'outside a doc root'],
    ['docs/diagram.png', 'disallowed extension'],
    ['docs//plan.md', 'empty segment'],
    ['', 'empty'],
    [`docs/${'a'.repeat(MAX_DOC_PATH_CHARS)}.md`, 'over the length cap'],
  ];

  it.each(REJECTED)('rejects %s (%s)', (candidate) => {
    expect(isSafeDocPath(candidate)).toBe(false);
  });

  it('rejects a NUL byte smuggled into an accepted-looking path', () => {
    expect(isSafeDocPath('docs/plan.md\0.png')).toBe(false);
  });
});

describe('isSafeDocPath — accepts', () => {
  const ACCEPTED = [
    'docs/plan.md',
    'specs/2026-01-01-intent.md',
    'plans/rollout.mdx',
    'server/docs/notes.txt',
    'docs/nested/deep/plan.md',
  ];

  it.each(ACCEPTED)('accepts %s', (candidate) => {
    expect(isSafeDocPath(candidate)).toBe(true);
  });
});

describe('extractDocReferences', () => {
  it('reads markdown links, backticks and bare paths', () => {
    const body = [
      'Implements [the plan](docs/plan.md).',
      'Spec lives at `specs/2026-01-01-intent.md`.',
      'See also plans/rollout.mdx for the sequence.',
    ].join('\n');

    expect(extractDocReferences(body).map((r) => r.path)).toEqual([
      'docs/plan.md',
      'specs/2026-01-01-intent.md',
      'plans/rollout.mdx',
    ]);
  });

  it('strips trailing sentence punctuation from a bare path', () => {
    expect(extractDocReferences('Per docs/plan.md, we ship.')).toEqual([{ path: 'docs/plan.md' }]);
  });

  it('deduplicates and preserves first-seen order', () => {
    const body = 'docs/b.md then docs/a.md then docs/b.md again';
    expect(extractDocReferences(body).map((r) => r.path)).toEqual(['docs/b.md', 'docs/a.md']);
  });

  it('caps at MAX_DOC_REFERENCES', () => {
    const body = Array.from({ length: 9 }, (_, i) => `docs/p${i}.md`).join(' ');
    expect(extractDocReferences(body)).toHaveLength(3);
  });

  it('returns nothing for a body with no safe reference', () => {
    expect(extractDocReferences('Fixes a bug in src/index.ts. See ../../etc/passwd')).toEqual([]);
  });

  it('does not scan past the body cap', () => {
    const body = `${'x'.repeat(4_000)} docs/late.md`;
    expect(extractDocReferences(body)).toEqual([]);
  });
});

describe('extractExternalReferences', () => {
  it('detects issues, Jira keys and URLs without dereferencing them', () => {
    const body = 'Closes #471 and ABC-1234. Design: https://wiki.test/page?a=1';
    expect(extractExternalReferences(body)).toEqual([
      { kind: 'url', ref: 'https://wiki.test/page?a=1' },
      { kind: 'issue', ref: '#471' },
      { kind: 'jira', ref: 'ABC-1234' },
    ]);
  });

  it('never yields a value that could be passed to readFile', () => {
    const body = 'See #1 and PROJ-9 and https://evil.test/../../etc/passwd';
    for (const ref of extractExternalReferences(body)) {
      expect(isSafeDocPath(ref.ref)).toBe(false);
    }
  });

  it('caps the total number of references', () => {
    const body = Array.from({ length: 40 }, (_, i) => `#${i + 1}`).join(' ');
    expect(extractExternalReferences(body)).toHaveLength(MAX_EXTERNAL_REFERENCES);
  });

  it('ignores a lone hash and a lowercase jira-like token', () => {
    expect(extractExternalReferences('issue # and abc-123')).toEqual([]);
  });
});

describe('extractIssueReferences', () => {
  it('reads bare, cross-repo and URL forms', () => {
    const body = [
      'Closes #471.',
      'Also fixes acme/payments-api#12.',
      'See https://github.com/acme/infra/issues/900 and https://github.com/acme/infra/pull/901.',
    ].join('\n');

    expect(extractIssueReferences(body)).toEqual([
      { owner: 'acme', repo: 'infra', number: 900, ref: 'https://github.com/acme/infra/issues/900' },
      { owner: 'acme', repo: 'infra', number: 901, ref: 'https://github.com/acme/infra/pull/901' },
      { owner: 'acme', repo: 'payments-api', number: 12, ref: 'acme/payments-api#12' },
    ]);
  });

  it('marks a bare #N as same-repo with a null owner', () => {
    expect(extractIssueReferences('Closes #471.')).toEqual([
      { owner: null, repo: null, number: 471, ref: '#471' },
    ]);
  });

  it('caps the number of issues it will fetch', () => {
    const body = Array.from({ length: 12 }, (_, i) => `#${i + 1}`).join(' ');
    expect(extractIssueReferences(body)).toHaveLength(3);
  });
});

describe('extractLinkReferences', () => {
  it('returns non-GitHub-issue URLs only', () => {
    const body = 'Design https://wiki.test/rfc and issue https://github.com/a/b/issues/1';
    expect(extractLinkReferences(body)).toEqual([{ url: 'https://wiki.test/rfc' }]);
  });

  it('deduplicates and caps', () => {
    const body = Array.from({ length: 9 }, (_, i) => `https://wiki.test/p${i}`).join(' ');
    expect(extractLinkReferences(body)).toHaveLength(3);
  });

  it('strips trailing sentence punctuation from a URL', () => {
    expect(extractLinkReferences('See https://wiki.test/rfc.')).toEqual([
      { url: 'https://wiki.test/rfc' },
    ]);
  });

  it('never returns something the doc guard would accept as a path', () => {
    for (const ref of extractLinkReferences('https://wiki.test/docs/plan.md')) {
      expect(isSafeDocPath(ref.url)).toBe(false);
    }
  });
});
