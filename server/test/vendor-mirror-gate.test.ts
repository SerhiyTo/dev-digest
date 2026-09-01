import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Invariant: the `verify:l06` vendor/shared mirror gate compares the two
 * vendored copies of `contracts/eval-ci.ts` byte-for-byte through `diff -q`,
 * and a single differing character in one copy makes that gate exit non-zero.
 * The tracked files are never written to — the divergence is staged on
 * throwaway copies.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L06_SCRIPT = path.join(REPO_ROOT, 'scripts/verify-l06.sh');
const L04_SCRIPT = path.join(REPO_ROOT, 'scripts/verify-l04.sh');
const SERVER_VENDOR = path.join(REPO_ROOT, 'server/src/vendor/shared');
const CLIENT_VENDOR = path.join(REPO_ROOT, 'client/src/vendor/shared');
const EVAL_CI = 'contracts/eval-ci.ts';

const GATE_LOOP = `
status=0
for f in ${EVAL_CI} contracts/knowledge.ts; do
  if ! diff -q "$1/$f" "$2/$f"; then
    status=1
  fi
done
exit $status
`;

let scratch: string | null = null;

afterEach(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

function forLoopFilesAbove(script: string, marker: RegExp): string[] {
  const lines = script.split('\n');
  const anchor = lines.findIndex((line) => marker.test(line));
  if (anchor < 0) return [];
  let start = anchor;
  while (start >= 0 && !lines[start]!.includes('for f in')) start -= 1;
  if (start < 0) return [];
  const header = lines.slice(start, anchor).join(' ');
  const list = header.slice(header.indexOf('for f in') + 'for f in'.length).split(';')[0] ?? '';
  return list.match(/[\w./-]+\.ts/g) ?? [];
}

function runGate(serverDir: string, clientDir: string): number {
  const result = spawnSync('bash', ['-c', GATE_LOOP, 'mirror-gate', serverDir, clientDir], {
    encoding: 'utf8',
  });
  expect(result.error).toBeUndefined();
  return result.status ?? -1;
}

function stageCopies(): { serverDir: string; clientDir: string } {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-mirror-gate-'));
  const serverDir = path.join(scratch, 'server');
  const clientDir = path.join(scratch, 'client');
  for (const [dir, source] of [
    [serverDir, SERVER_VENDOR],
    [clientDir, CLIENT_VENDOR],
  ] as const) {
    fs.mkdirSync(path.join(dir, 'contracts'), { recursive: true });
    for (const f of [EVAL_CI, 'contracts/knowledge.ts']) {
      fs.copyFileSync(path.join(source, f), path.join(dir, f));
    }
  }
  return { serverDir, clientDir };
}

function flipOneCharacter(text: string): string {
  const index = text.indexOf('z.object(');
  expect(index).toBeGreaterThan(-1);
  return `${text.slice(0, index)}Z${text.slice(index + 1)}`;
}

function differingCharacterCount(a: string, b: string): number {
  if (a.length !== b.length) return Number.NaN;
  let count = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) count += 1;
  return count;
}

describe('vendor/shared mirror gate', () => {
  it('gates contracts/eval-ci.ts inside the diff -q mirror loop instead of the excluded list', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'server/package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts['verify:l06']).toContain('verify-l06.sh');

    const l06 = fs.readFileSync(L06_SCRIPT, 'utf8');
    const l04 = fs.readFileSync(L04_SCRIPT, 'utf8');
    const mirrorDiff = /diff -q.*vendor\/shared/;
    const excludedMarker = /not gated|known-divergent/;

    expect(forLoopFilesAbove(l06, mirrorDiff)).toContain(EVAL_CI);
    expect(forLoopFilesAbove(l06, excludedMarker)).not.toContain(EVAL_CI);
    expect(forLoopFilesAbove(l04, mirrorDiff)).toContain(EVAL_CI);
    expect(forLoopFilesAbove(l04, excludedMarker)).not.toContain(EVAL_CI);
  });

  it('exits zero for the two tracked copies as they stand today', () => {
    expect(runGate(SERVER_VENDOR, CLIENT_VENDOR)).toBe(0);
  });

  it('exits non-zero when one copy of contracts/eval-ci.ts differs by a single character', () => {
    const { serverDir, clientDir } = stageCopies();
    expect(runGate(serverDir, clientDir)).toBe(0);

    const target = path.join(clientDir, EVAL_CI);
    const original = fs.readFileSync(target, 'utf8');
    const perturbed = flipOneCharacter(original);
    expect(differingCharacterCount(original, perturbed)).toBe(1);
    fs.writeFileSync(target, perturbed);

    expect(runGate(serverDir, clientDir)).not.toBe(0);
    expect(fs.readFileSync(path.join(CLIENT_VENDOR, EVAL_CI), 'utf8')).toBe(original);
  });
});
