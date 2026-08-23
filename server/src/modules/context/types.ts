import type { RepoRef } from '@devdigest/shared';

export type ProjectContextSkipReason =
  | 'invalid_path'
  | 'unreadable'
  | 'empty'
  | 'block_budget';

export interface ProjectContextSkip {
  path: string;
  reason: ProjectContextSkipReason;
}

export type PathLabelledDocument = string;

export interface ResolvedProjectContext {
  specs: PathLabelledDocument[];
  specsRead: string[];
  skipped: ProjectContextSkip[];
}

export type RunRepoRef = RepoRef & { clonePath?: string | null };

export interface ProjectContext {
  resolveForRun(agentId: string, repo: RunRepoRef): Promise<ResolvedProjectContext>;
}
