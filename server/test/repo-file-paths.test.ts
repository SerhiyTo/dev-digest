import { describe, it, expect } from 'vitest';
import { AppError, NotFoundError } from '../src/platform/errors.js';
import {
  assertRepoRelativePath,
  FilesService,
  MAX_REPO_PATH_CHARS,
} from '../src/modules/files/service.js';
import type { FileReader, RepoLookup } from '../src/modules/files/ports.js';

describe('assertRepoRelativePath — rejects', () => {
  const REJECTED: [string, string][] = [
    ['/etc/passwd', 'absolute path'],
    ['../../etc/passwd', 'parent traversal'],
    ['foo%2f..%2fbar', 'url-encoded separator'],
    ['foo\0bar', 'null byte'],
    ['foo\\bar', 'backslash separator'],
    ['~/secrets', 'home expansion'],
    ['src/../secrets.env', 'traversal that normalises away'],
    ['src/./index.ts', 'dot segment'],
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['x'.repeat(MAX_REPO_PATH_CHARS + 1), 'too long'],
    ['.git/config', 'git metadata file'],
    ['.git', 'git directory alone'],
    ['.git/refs/heads/main', 'nested git metadata path'],
  ];

  it.each(REJECTED)('rejects %s (%s)', (candidate) => {
    expect(() => assertRepoRelativePath(candidate)).toThrow(AppError);
  });
});

describe('assertRepoRelativePath — accepts', () => {
  it('accepts an ordinary repo-relative path', () => {
    expect(assertRepoRelativePath('src/modules/files/service.ts')).toBe(
      'src/modules/files/service.ts',
    );
    expect(assertRepoRelativePath('README.md')).toBe('README.md');
  });

  it('accepts ordinary repository files that merely start with .git', () => {
    expect(assertRepoRelativePath('.gitignore')).toBe('.gitignore');
    expect(assertRepoRelativePath('.gitmodules')).toBe('.gitmodules');
    expect(assertRepoRelativePath('.gitattributes')).toBe('.gitattributes');
    expect(assertRepoRelativePath('.github/workflows/ci.yml')).toBe(
      '.github/workflows/ci.yml',
    );
  });
});

describe('FilesService.readFile', () => {
  const repo = { owner: 'acme', name: 'widgets' };

  function service(opts: { found?: boolean; content?: string | null } = {}) {
    const repos: RepoLookup = {
      findRepo: async () => (opts.found === false ? undefined : repo),
    };
    const files: FileReader = {
      read: async (_repo, _path, maxBytes) => {
        if (opts.content === undefined || opts.content === null) return null;
        const truncated = opts.content.length > maxBytes;
        return {
          content: truncated ? opts.content.slice(0, maxBytes) : opts.content,
          truncated,
        };
      },
    };
    return new FilesService({ repos, files });
  }

  it('rejects a malicious path before touching the repo lookup', async () => {
    let looked = false;
    const svc = new FilesService({
      repos: { findRepo: async () => ((looked = true), repo) },
      files: { read: async () => ({ content: 'x', truncated: false }) },
    });
    await expect(svc.readFile('ws', 'repo-1', '../../etc/passwd')).rejects.toThrow(AppError);
    expect(looked).toBe(false);
  });

  it('returns 404 for an unknown or foreign-workspace repo id', async () => {
    const svc = service({ found: false });
    await expect(svc.readFile('ws', 'repo-1', 'README.md')).rejects.toThrow(NotFoundError);
  });

  it('returns 404 when the file is not in the clone', async () => {
    const svc = service({ found: true, content: null });
    await expect(svc.readFile('ws', 'repo-1', 'README.md')).rejects.toThrow(NotFoundError);
  });

  it('reads an ordinary repo-relative path through the injected git port', async () => {
    const svc = service({ found: true, content: 'hello world' });
    const dto = await svc.readFile('ws', 'repo-1', 'README.md');
    expect(dto).toEqual({ path: 'README.md', content: 'hello world' });
  });

  it('caps the returned byte count and marks the response truncated', async () => {
    const big = 'a'.repeat(300_000);
    const svc = service({ found: true, content: big });
    const dto = await svc.readFile('ws', 'repo-1', 'README.md');
    expect(dto.truncated).toBe(true);
    expect(dto.content.length).toBeLessThan(big.length);
  });
});
