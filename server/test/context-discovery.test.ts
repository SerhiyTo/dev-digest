import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  FsCloneDocs,
  MAX_DOC_BYTES,
  type CloneDocsPolicy,
} from '../src/adapters/clonedocs/index.js';
import {
  DOC_EXTENSIONS,
  DOC_ROOTS,
  EXCLUDED_DIRS,
  MAX_DOC_CHARS,
  MAX_DOCUMENTS,
} from '../src/modules/context/constants.js';
import { isProjectDocPath } from '../src/modules/context/paths.js';

const REPO = { owner: 'acme', name: 'payments-api' };

const POLICY: CloneDocsPolicy = {
  docRoots: DOC_ROOTS,
  docExtensions: DOC_EXTENSIONS,
  excludedDirs: EXCLUDED_DIRS,
  isDocPath: isProjectDocPath,
};

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
}

describe('FsCloneDocs.list', () => {
  let cloneDir: string;
  let clone: string;
  let docs: FsCloneDocs;

  beforeEach(async () => {
    cloneDir = await mkdtemp(join(tmpdir(), 'clonedocs-'));
    clone = join(cloneDir, REPO.owner, REPO.name);
    await mkdir(clone, { recursive: true });
    docs = new FsCloneDocs(POLICY);
  });
  afterEach(async () => {
    await rm(cloneDir, { recursive: true, force: true });
  });

  it('returns .md and .mdx under the four roots only, sorted ascending', async () => {
    await writeFileAt(clone, 'docs/architecture.md', '# arch');
    await writeFileAt(clone, 'docs/adr/0002-queue.mdx', '# adr');
    await writeFileAt(clone, 'specs/auth.md', '# auth');
    await writeFileAt(clone, 'plans/q3.md', '# plan');
    await writeFileAt(clone, 'insights/perf.md', '# perf');
    await writeFileAt(clone, 'README.md', '# root readme');
    await writeFileAt(clone, 'src/notes.md', '# not a doc root');
    await writeFileAt(clone, 'docs/diagram.png', 'binary');
    await writeFileAt(clone, 'docs/notes.txt', 'text');

    const found = await docs.list(clone);

    expect(found.map((d) => d.path)).toEqual([
      'docs/adr/0002-queue.mdx',
      'docs/architecture.md',
      'insights/perf.md',
      'plans/q3.md',
      'specs/auth.md',
    ]);
  });

  it('reads the clone root the caller passes, not one derived from the repo name', async () => {
    const elsewhere = join(cloneDir, 'somewhere-else');
    await writeFileAt(elsewhere, 'docs/moved.md', '# moved');
    await writeFileAt(clone, 'docs/conventional.md', '# conventional');

    expect((await docs.list(elsewhere)).map((d) => d.path)).toEqual(['docs/moved.md']);
    expect((await docs.read(elsewhere, 'docs/moved.md')).ok).toBe(true);
  });

  it('never follows a symlinked file or a symlinked directory', async () => {
    await writeFileAt(clone, 'docs/real.md', '# real');
    await writeFileAt(cloneDir, 'outside/secret.md', '# secret');
    await symlink(join(cloneDir, 'outside/secret.md'), join(clone, 'docs/linked.md'));
    await symlink(join(cloneDir, 'outside'), join(clone, 'docs/linked-dir'));

    const found = await docs.list(clone);

    expect(found.map((d) => d.path)).toEqual(['docs/real.md']);
  });

  it('prunes excluded directories', async () => {
    await writeFileAt(clone, 'docs/kept.md', '# kept');
    await writeFileAt(clone, 'docs/node_modules/pkg/readme.md', '# vendored');
    await writeFileAt(clone, 'docs/dist/generated.md', '# built');
    await writeFileAt(clone, 'docs/.git/notes.md', '# git');
    await writeFileAt(clone, 'docs/vendor/copy.md', '# vendor');

    const found = await docs.list(clone);

    expect(found.map((d) => d.path)).toEqual(['docs/kept.md']);
  });

  it('returns the full discovered set, uncapped', async () => {
    const total = MAX_DOCUMENTS + 5;
    await Promise.all(
      Array.from({ length: total }, (_, i) =>
        writeFileAt(clone, `docs/doc-${String(i).padStart(4, '0')}.md`, `# ${i}`),
      ),
    );

    const found = await docs.list(clone);

    expect(found).toHaveLength(total);
    expect(found[0]?.path).toBe('docs/doc-0000.md');
  });

  it('stops descending past the depth budget instead of walking forever', async () => {
    const shallow = 'docs/a/b/near.md';
    const deep = 'docs/a/b/c/d/e/far.md';
    await writeFileAt(clone, shallow, '# near');
    await writeFileAt(clone, deep, '# far');

    const budgeted = new FsCloneDocs({ ...POLICY, maxWalkDepth: 3 });

    expect((await budgeted.list(clone)).map((d) => d.path)).toEqual([shallow]);
    expect((await docs.list(clone)).map((d) => d.path)).toEqual([deep, shallow]);
  });

  it('stops after the entry budget instead of walking an unbounded tree', async () => {
    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        writeFileAt(clone, `docs/doc-${String(i).padStart(3, '0')}.md`, `# ${i}`),
      ),
    );

    const budgeted = new FsCloneDocs({ ...POLICY, maxWalkEntries: 6 });
    const found = await budgeted.list(clone);

    expect(found.length).toBeLessThan(40);
    expect(found.length).toBeGreaterThan(0);
  });

  it('returns an empty list when the repository was never cloned', async () => {
    await expect(docs.list(join(cloneDir, 'nowhere'))).resolves.toEqual([]);
  });
});

describe('FsCloneDocs.read', () => {
  let cloneDir: string;
  let clone: string;
  let docs: FsCloneDocs;

  beforeEach(async () => {
    cloneDir = await mkdtemp(join(tmpdir(), 'clonedocs-read-'));
    clone = join(cloneDir, REPO.owner, REPO.name);
    await mkdir(clone, { recursive: true });
    docs = new FsCloneDocs(POLICY);
  });
  afterEach(async () => {
    await rm(cloneDir, { recursive: true, force: true });
  });

  it('reads a document inside a scanned root', async () => {
    await writeFileAt(clone, 'specs/auth.md', '# auth\n\nrules');
    await expect(docs.read(clone, 'specs/auth.md')).resolves.toEqual({
      ok: true,
      text: '# auth\n\nrules',
      truncated: false,
    });
  });

  it('names the reason a path is not a project document', async () => {
    await writeFileAt(clone, 'README.md', '# root');
    await writeFileAt(cloneDir, 'secret.md', '# secret');

    for (const path of [
      'README.md',
      '../../secret.md',
      'docs/../../secret.md',
      '/etc/passwd',
      'docs\\win.md',
      'file:///etc/passwd',
    ]) {
      await expect(docs.read(clone, path)).resolves.toEqual({
        ok: false,
        reason: 'invalid_path',
      });
    }
  });

  it('names a symlink that escapes the clone as out of root', async () => {
    await writeFileAt(cloneDir, 'outside/secret.md', '# secret');
    await mkdir(join(clone, 'docs'), { recursive: true });
    await symlink(join(cloneDir, 'outside/secret.md'), join(clone, 'docs/linked.md'));

    await expect(docs.read(clone, 'docs/linked.md')).resolves.toEqual({
      ok: false,
      reason: 'out_of_root',
    });
  });

  it('names a missing document as missing, and an absent clone likewise', async () => {
    await expect(docs.read(clone, 'docs/gone.md')).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
    await expect(docs.read(join(cloneDir, 'nowhere'), 'docs/gone.md')).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('returns a bounded prefix of a document above the byte ceiling instead of refusing it', async () => {
    await writeFileAt(clone, 'docs/huge.md', 'x'.repeat(MAX_DOC_BYTES * 2));
    await writeFileAt(clone, 'docs/big.md', 'y'.repeat(MAX_DOC_BYTES));

    const huge = await docs.read(clone, 'docs/huge.md');
    expect(huge).toEqual({
      ok: true,
      text: 'x'.repeat(MAX_DOC_BYTES),
      truncated: true,
    });

    await expect(docs.read(clone, 'docs/big.md')).resolves.toEqual({
      ok: true,
      text: 'y'.repeat(MAX_DOC_BYTES),
      truncated: false,
    });
  });

  it('leaves at least MAX_DOC_CHARS in the prefix even at four bytes per character', async () => {
    const emoji = '\u{1f600}';
    await writeFileAt(clone, 'docs/wide.md', emoji.repeat(MAX_DOC_BYTES));

    const wide = await docs.read(clone, 'docs/wide.md');

    expect(wide.ok && wide.truncated).toBe(true);
    expect(wide.ok && wide.text.length).toBeGreaterThan(MAX_DOC_CHARS);
    expect(wide.ok && wide.text).not.toContain('\ufffd');
  });

  it('applies the ceiling the policy sets, counting bytes and not characters', async () => {
    const tight = new FsCloneDocs({ ...POLICY, maxDocBytes: 16 });
    await writeFileAt(clone, 'docs/wide.md', '\u20ac'.repeat(6));
    await writeFileAt(clone, 'docs/narrow.md', 'abcdef');

    await expect(tight.read(clone, 'docs/wide.md')).resolves.toEqual({
      ok: true,
      text: '\u20ac'.repeat(5),
      truncated: true,
    });
    await expect(tight.read(clone, 'docs/narrow.md')).resolves.toEqual({
      ok: true,
      text: 'abcdef',
      truncated: false,
    });
  });

  it('refuses a directory that happens to carry a document extension', async () => {
    await mkdir(join(clone, 'docs/folder.md'), { recursive: true });

    await expect(docs.read(clone, 'docs/folder.md')).resolves.toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });
});
