import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimpleGitClient, readClonedFileBounded } from '../src/adapters/git/simple-git.js';

const repo = { owner: 'acme', name: 'widgets' };

describe('SimpleGitClient.readFile / readClonedFileBounded — symlink containment', () => {
  let workDir: string;
  let cloneDir: string;
  let cloneRoot: string;
  let outsideFile: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'devdigest-git-containment-'));
    cloneDir = join(workDir, 'clones');
    cloneRoot = join(cloneDir, repo.owner, repo.name);
    await mkdir(cloneRoot, { recursive: true });

    outsideFile = join(workDir, 'secret.txt');
    await writeFile(outsideFile, 'top secret host content', 'utf8');

    await writeFile(join(cloneRoot, 'README.md'), 'hello world', 'utf8');
    await mkdir(join(cloneRoot, 'docs'), { recursive: true });
    await writeFile(join(cloneRoot, 'docs', 'notes.md'), 'nested content', 'utf8');
    await symlink(join('..', '..', '..', 'secret.txt'), join(cloneRoot, 'escape'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('rejects a repo-committed symlink that resolves outside the clone', async () => {
    const client = new SimpleGitClient(cloneDir);
    await expect(client.readFile(repo, 'escape')).rejects.toThrow();
  });

  it('still reads an ordinary file inside the clone', async () => {
    const client = new SimpleGitClient(cloneDir);
    await expect(client.readFile(repo, 'README.md')).resolves.toBe('hello world');
    await expect(client.readFile(repo, 'docs/notes.md')).resolves.toBe('nested content');
  });

  it('readClonedFileBounded returns null for a symlink escape instead of the host file content', async () => {
    const result = await readClonedFileBounded(cloneRoot, 'escape', 1_000);
    expect(result).toBeNull();
  });

  it('readClonedFileBounded reads and truncates an ordinary in-clone file', async () => {
    const full = await readClonedFileBounded(cloneRoot, 'README.md', 1_000);
    expect(full).toEqual({ content: 'hello world', truncated: false });

    const capped = await readClonedFileBounded(cloneRoot, 'README.md', 5);
    expect(capped).toEqual({ content: 'hello', truncated: true });
  });

  it('readClonedFileBounded returns null for a missing file', async () => {
    const result = await readClonedFileBounded(cloneRoot, 'nope.md', 1_000);
    expect(result).toBeNull();
  });
});
