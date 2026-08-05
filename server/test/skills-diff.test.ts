import { describe, it, expect } from 'vitest';
import { skillBodyPatch } from '../src/modules/skills/diff.js';

/**
 * Pure unit tests for the skill-body diff (no DB). The client renders this patch
 * through a parser that classifies every line by its first character — so the
 * absence of `---`/`+++` headers and of the `\ No newline` marker is part of the
 * contract, not a cosmetic detail: either would paint as a real diff line.
 */
describe('skillBodyPatch', () => {
  const hunkLines = (patch: string) => patch.split('\n').filter((l) => l.startsWith('@@'));

  it('emits hunks only — no --- / +++ file headers', () => {
    const patch = skillBodyPatch('a\nb\nc\n', 'a\nB\nc\n');
    const lines = patch.split('\n');
    expect(lines[0]).toMatch(/^@@ /);
    expect(lines.some((l) => l.startsWith('---'))).toBe(false);
    expect(lines.some((l) => l.startsWith('+++'))).toBe(false);
  });

  it('returns an empty patch for identical bodies', () => {
    const body = 'Always test the error path.\nNever mock the unit under test.\n';
    expect(skillBodyPatch(body, body)).toBe('');
    expect(hunkLines(skillBodyPatch(body, body))).toEqual([]);
  });

  it('marks an added line with + and keeps context unprefixed', () => {
    const patch = skillBodyPatch('one\ntwo\n', 'one\ntwo\nthree\n');
    expect(hunkLines(patch)).toHaveLength(1);
    expect(patch).toContain('@@ -1,2 +1,3 @@');
    expect(patch).toContain('\n+three');
    expect(patch).toContain('\n one');
  });

  it('marks a removed line with -', () => {
    const patch = skillBodyPatch('one\ntwo\nthree\n', 'one\nthree\n');
    expect(hunkLines(patch)).toHaveLength(1);
    expect(patch).toContain('\n-two');
    expect(patch).not.toContain('\n+two');
  });

  it('renders a changed line as a removal plus an addition', () => {
    const patch = skillBodyPatch('one\ntwo\nthree\n', 'one\nTWO\nthree\n');
    expect(patch).toContain('\n-two');
    expect(patch).toContain('\n+TWO');
  });

  it('suppresses the "\\ No newline at end of file" marker', () => {
    const patch = skillBodyPatch('one\ntwo', 'one\nTWO');
    expect(patch).not.toContain('No newline at end of file');
    expect(patch).not.toContain('\\');
    expect(patch).toContain('-two');
    expect(patch).toContain('+TWO');
  });

  it('every line of a hunk starts with @@, +, - or a space', () => {
    const patch = skillBodyPatch('alpha\nbeta', 'alpha\nbeta\ngamma');
    const lines = patch.split('\n').filter((l) => l !== '');
    for (const line of lines) {
      expect(line, line).toMatch(/^(@@|[+\- ])/);
    }
  });

  it('is a real unified diff: every hunk header carries old/new line ranges', () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 20', 'line twenty');
    const headers = hunkLines(skillBodyPatch(before, after));
    expect(headers).toHaveLength(1);
    expect(headers[0]).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@/);
  });
});
