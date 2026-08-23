import type { CloneDocRead } from '@devdigest/shared';

export type DocOwnerKind = 'agent' | 'skill';

export interface ContextRepoRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

export interface DocAttachmentRow {
  path: string;
  order: number;
}

export interface DocReachedByAgentRow {
  path: string;
  agentName: string;
}

export interface DocStore {
  getRepo(workspaceId: string, repoId: string): Promise<ContextRepoRow | undefined>;
  ownerExists(kind: DocOwnerKind, workspaceId: string, ownerId: string): Promise<boolean>;
  attachments(kind: DocOwnerKind, ownerId: string): Promise<DocAttachmentRow[]>;
  setAttachments(kind: DocOwnerKind, ownerId: string, paths: readonly string[]): Promise<void>;
  agentsReachingDocs(workspaceId: string): Promise<DocReachedByAgentRow[]>;
  agentPathsInAttachmentOrder(agentId: string): Promise<string[]>;
  skillPathsInLinkOrder(agentId: string): Promise<string[]>;
}

export interface DefaultBranchDocs {
  list(cloneRoot: string): Promise<{ path: string }[]>;
  read(cloneRoot: string, path: string): Promise<CloneDocRead>;
}

export interface Tokens {
  count(text: string): number;
  estimator?(): 'cl100k_base' | 'heuristic';
}

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};
