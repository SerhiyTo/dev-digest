import { posix } from 'node:path';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { FileReader, RepoFileDto, RepoLookup } from './ports.js';

export const MAX_REPO_PATH_CHARS = 512;
export const MAX_REPO_FILE_CHARS = 262_144;

export interface FilesServiceDeps {
  repos: RepoLookup;
  files: FileReader;
}

function decodesToItself(raw: string): boolean {
  try {
    return decodeURIComponent(raw) === raw;
  } catch {
    return false;
  }
}

export function assertRepoRelativePath(candidate: string): string {
  const value = candidate.trim();
  const rejected = () =>
    new AppError('invalid_path', `Not a repository-relative path: ${candidate}`, 400);

  if (value.length === 0 || value.length > MAX_REPO_PATH_CHARS) throw rejected();
  if (value.includes('\0') || value.includes('\\')) throw rejected();
  if (!decodesToItself(value)) throw rejected();
  if (value.startsWith('/') || value.startsWith('~')) throw rejected();
  if (posix.isAbsolute(value)) throw rejected();
  if (posix.normalize(value) !== value) throw rejected();

  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw rejected();
  }
  if (segments.some((segment) => segment === '.git')) throw rejected();

  return value;
}

export class FilesService {
  constructor(private deps: FilesServiceDeps) {}

  async readFile(workspaceId: string, repoId: string, rawPath: string): Promise<RepoFileDto> {
    const path = assertRepoRelativePath(rawPath);

    const repo = await this.deps.repos.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const result = await this.deps.files.read(repo, path, MAX_REPO_FILE_CHARS);
    if (result === null) throw new NotFoundError(`No such file: ${path}`);

    return {
      path,
      content: result.content,
      ...(result.truncated ? { truncated: true } : {}),
    };
  }
}
