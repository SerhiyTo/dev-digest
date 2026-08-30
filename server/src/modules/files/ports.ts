import type { RepoRef } from '@devdigest/shared';

export interface RepoLookup {
  findRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined>;
}

export interface RepoFileRead {
  content: string;
  truncated: boolean;
}

export interface FileReader {
  read(repo: RepoRef, path: string, maxBytes: number): Promise<RepoFileRead | null>;
}

export interface RepoFileDto {
  path: string;
  content: string;
  truncated?: boolean;
}
