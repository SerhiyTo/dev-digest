import { describe, it, expect } from 'vitest';
import {
  categoryOf,
  isProjectDocPath,
  sanitizePathLabel,
} from '../src/modules/context/paths.js';
import { DOC_ROOTS } from '../src/modules/context/constants.js';

describe('isProjectDocPath — rejects', () => {
  const REJECTED: [string, string][] = [
    ['../../etc/passwd', 'parent traversal'],
    ['/docs/plan.md', 'absolute path'],
    ['docs/../../secrets.env', 'traversal through a doc root'],
    ['docs/../docs/plan.md', 'traversal that normalises away'],
    ['docs/./plan.md', 'dot segment'],
    ['docs/../plan.md', 'escape to the repo root'],
    ['docs%2f..%2f..%2fx.md', 'percent-encoded traversal'],
    ['%2e%2e/docs/plan.md', 'percent-encoded parent'],
    ['~/docs/plan.md', 'home expansion'],
    ['file:///docs/plan.md', 'file scheme'],
    ['https://evil.test/docs/plan.md', 'http scheme'],
    ['C:/docs/plan.md', 'windows drive'],
    ['docs\\plan.md', 'backslash separator'],
    ['docs/sub\\plan.md', 'backslash inside a segment'],
    ['docs/plan.md\0.png', 'null byte'],
    ['src/index.ts', 'outside a doc root'],
    ['src/docs/plan.md', 'doc root that is not the first segment'],
    ['README.md', 'markdown at the repo root'],
    ['docs/diagram.png', 'disallowed extension'],
    ['docs/notes.txt', 'txt belongs to the intent feature, not this one'],
    ['docs//plan.md', 'empty segment'],
    ['docs', 'a bare root with no file'],
    ['docs/', 'a root with a trailing slash'],
    ['', 'empty'],
    ['   ', 'whitespace only'],
  ];

  it.each(REJECTED)('rejects %s (%s)', (candidate) => {
    expect(isProjectDocPath(candidate)).toBe(false);
  });
});

describe('isProjectDocPath — accepts', () => {
  const ACCEPTED: [string, string][] = [
    ['docs/plan.md', 'a doc under docs'],
    ['specs/2026-08-20-project-context.md', 'a spec'],
    ['plans/rollout.mdx', 'an mdx plan'],
    ['insights/lessons.md', 'an insight'],
    ['docs/nested/deeply/adr-001.md', 'a nested document'],
    ['DOCS/plan.md', 'an upper-case root'],
    ['Specs/Plan.MD', 'a mixed-case root and extension'],
    ['docs/a b.md', 'a space in the filename'],
  ];

  it.each(ACCEPTED)('accepts %s (%s)', (candidate) => {
    expect(isProjectDocPath(candidate)).toBe(true);
  });

  it('accepts a document directly under every configured root', () => {
    for (const root of DOC_ROOTS) {
      expect(isProjectDocPath(`${root}/file.md`)).toBe(true);
    }
  });
});

describe('categoryOf', () => {
  it('reports the first segment as the category, lower-cased', () => {
    expect(categoryOf('docs/plan.md')).toBe('docs');
    expect(categoryOf('specs/one.md')).toBe('specs');
    expect(categoryOf('plans/two.mdx')).toBe('plans');
    expect(categoryOf('insights/three.md')).toBe('insights');
    expect(categoryOf('DOCS/plan.md')).toBe('docs');
  });

  it('returns null for anything the path guard rejects', () => {
    expect(categoryOf('src/index.ts')).toBeNull();
    expect(categoryOf('../docs/plan.md')).toBeNull();
    expect(categoryOf('README.md')).toBeNull();
  });
});

describe('sanitizePathLabel', () => {
  it('strips a quote out of a filename so the label cannot forge a fence attribute', () => {
    expect(sanitizePathLabel('docs/we"rd".md')).toBe('docs/werd.md');
    expect(sanitizePathLabel('docs/a" source="x.md')).toBe('docs/asourcex.md');
  });

  it('strips angle brackets, hashes and whitespace', () => {
    expect(sanitizePathLabel('docs/</untrusted>.md')).toBe('docs//untrusted.md');
    expect(sanitizePathLabel('docs/## Diff to review.md')).toBe('docs/Difftoreview.md');
    expect(sanitizePathLabel('docs/plan\nfake.md')).toBe('docs/planfake.md');
  });

  it('leaves a well-formed path untouched', () => {
    expect(sanitizePathLabel('docs/nested/adr-001.file_v2.md')).toBe(
      'docs/nested/adr-001.file_v2.md',
    );
  });
});
