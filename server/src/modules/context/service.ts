import { z } from 'zod';
import {
  DocAttachment,
  ProjectDocBody,
  ProjectDocList,
  TokenEstimate,
  type ProjectDoc,
} from '@devdigest/shared';
import { AppError, ConflictError, NotFoundError } from '../../platform/errors.js';
import { assembleProjectContext, mergeAttachments, type ProjectDocEntry } from './assemble.js';
import { MAX_ATTACHMENTS, MAX_DOCUMENTS } from './constants.js';
import { categoryOf, isProjectDocPath } from './paths.js';
import type {
  ContextRepoRow,
  DefaultBranchDocs,
  DocOwnerKind,
  DocStore,
  Logger,
  Tokens,
} from './ports.js';
import type {
  ProjectContext,
  ProjectContextSkip,
  ResolvedProjectContext,
  RunRepoRef,
} from './types.js';

export const MAX_DOC_PATH_CHARS = 512;

const DEFAULT_ESTIMATOR = 'cl100k_base';

const DocAttachmentsDto = z.array(DocAttachment);

export interface ContextServiceDeps {
  store: DocStore;
  docs: DefaultBranchDocs;
  tokens: Tokens;
  logger?: Logger;
}

function nameOf(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] ?? path;
}

function folderOf(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

export class ContextService implements ProjectContext {
  constructor(private deps: ContextServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ProjectDocList> {
    return this.discover(workspaceId, repoId);
  }

  async resync(workspaceId: string, repoId: string): Promise<ProjectDocList> {
    return this.discover(workspaceId, repoId);
  }

  async document(
    workspaceId: string,
    repoId: string,
    path: string,
  ): Promise<ProjectDocBody> {
    this.assertPath(path);
    const repo = await this.requireRepo(workspaceId, repoId);
    if (repo.clonePath === null) {
      throw new AppError('not_cloned', `${repo.fullName} has no local clone`, 404);
    }

    const read = await this.deps.docs.read(repo.clonePath, path);
    if (read.ok) {
      return this.checked(ProjectDocBody, {
        path,
        content: read.text,
        truncated: read.truncated === true,
      });
    }
    if (read.reason === 'missing') throw new NotFoundError(`No such document: ${path}`);
    throw new AppError(
      'document_unreadable',
      `Document could not be read: ${path} (${read.reason})`,
      404,
    );
  }

  async attachments(
    workspaceId: string,
    kind: DocOwnerKind,
    ownerId: string,
  ): Promise<DocAttachment[]> {
    await this.requireOwner(kind, workspaceId, ownerId);
    const rows = await this.deps.store.attachments(kind, ownerId);
    return this.checked(DocAttachmentsDto, rows.map((r) => ({ path: r.path, order: r.order })));
  }

  async setAttachments(
    workspaceId: string,
    kind: DocOwnerKind,
    ownerId: string,
    paths: readonly string[],
  ): Promise<DocAttachment[]> {
    for (const path of paths) this.assertPath(path);
    const wanted = mergeAttachments(paths, []);
    if (wanted.length > MAX_ATTACHMENTS) {
      throw new ConflictError(
        `An agent or skill may attach at most ${MAX_ATTACHMENTS} documents; ${wanted.length} were sent`,
      );
    }
    await this.requireOwner(kind, workspaceId, ownerId);
    await this.deps.store.setAttachments(kind, ownerId, wanted);
    return this.attachments(workspaceId, kind, ownerId);
  }

  async estimate(
    workspaceId: string,
    repoId: string,
    paths: readonly string[],
  ): Promise<TokenEstimate> {
    for (const path of paths) this.assertPath(path);
    const repo = await this.requireRepo(workspaceId, repoId);
    const wanted = mergeAttachments(paths, []).slice(0, MAX_ATTACHMENTS);

    const entries =
      repo.clonePath === null ? [] : (await this.gather(repo.clonePath, wanted)).entries;
    const { specs } = assembleProjectContext(entries);

    return this.checked(TokenEstimate, {
      tokens: this.deps.tokens.count(specs.join('\n\n')),
      estimator: this.deps.tokens.estimator?.() ?? DEFAULT_ESTIMATOR,
    });
  }

  async resolveForRun(agentId: string, repo: RunRepoRef): Promise<ResolvedProjectContext> {
    const [agentPaths, skillPaths] = await Promise.all([
      this.deps.store.agentPathsInAttachmentOrder(agentId),
      this.deps.store.skillPathsInLinkOrder(agentId),
    ]);
    const wanted = mergeAttachments(agentPaths, skillPaths).slice(0, MAX_ATTACHMENTS);
    if (wanted.length === 0) return { specs: [], specsRead: [], skipped: [] };

    const cloneRoot = this.cloneRootOf(repo);
    if (cloneRoot === null) {
      const notCloned = wanted.map((path): ProjectContextSkip => ({ path, reason: 'unreadable' }));
      this.deps.logger?.warn(
        { agentId, repo: `${repo.owner}/${repo.name}`, skipped: notCloned },
        'project context: repository has no local clone',
      );
      return { specs: [], specsRead: [], skipped: notCloned };
    }

    const { entries, skipped } = await this.gather(cloneRoot, wanted);
    const assembled = assembleProjectContext(entries);
    const allSkipped = [...skipped, ...assembled.skipped];

    if (allSkipped.length > 0) {
      this.deps.logger?.warn(
        { agentId, repo: `${repo.owner}/${repo.name}`, skipped: allSkipped },
        'project context: documents skipped',
      );
    }

    return {
      specs: assembled.specs,
      specsRead: assembled.specsRead,
      skipped: allSkipped,
    };
  }

  private async discover(workspaceId: string, repoId: string): Promise<ProjectDocList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (repo.clonePath === null) {
      return this.checked(ProjectDocList, {
        documents: [],
        omitted: 0,
        reason: 'not_cloned',
        last_synced_at: null,
      });
    }

    const walkStartedAt = new Date().toISOString();
    const discovered = await this.deps.docs.list(repo.clonePath);
    const paths = discovered.map((entry) => entry.path).filter(isProjectDocPath);
    const omitted = Math.max(0, paths.length - MAX_DOCUMENTS);
    const reachedBy = await this.agentsByDocPath(workspaceId);

    const documents = paths.slice(0, MAX_DOCUMENTS).flatMap((path): ProjectDoc[] => {
      const category = categoryOf(path);
      if (category === null) return [];
      return [
        {
          path,
          name: nameOf(path),
          folder: folderOf(path),
          category,
          used_by_agents: [...(reachedBy.get(path) ?? new Set<string>())].sort(),
        },
      ];
    });

    return this.checked(ProjectDocList, {
      documents,
      omitted,
      reason: null,
      last_synced_at: walkStartedAt,
    });
  }

  private async agentsByDocPath(workspaceId: string): Promise<Map<string, Set<string>>> {
    const byPath = new Map<string, Set<string>>();
    for (const row of await this.deps.store.agentsReachingDocs(workspaceId)) {
      const names = byPath.get(row.path) ?? new Set<string>();
      names.add(row.agentName);
      byPath.set(row.path, names);
    }
    return byPath;
  }

  private async gather(
    cloneRoot: string,
    paths: readonly string[],
  ): Promise<{ entries: ProjectDocEntry[]; skipped: ProjectContextSkip[] }> {
    const entries: ProjectDocEntry[] = [];
    const skipped: ProjectContextSkip[] = [];

    for (const path of paths) {
      if (!isProjectDocPath(path)) {
        skipped.push({ path, reason: 'invalid_path' });
        continue;
      }
      const read = await this.deps.docs.read(cloneRoot, path);
      if (!read.ok) {
        skipped.push({
          path,
          reason: read.reason === 'invalid_path' ? 'invalid_path' : 'unreadable',
        });
        continue;
      }
      entries.push({ path, text: read.text });
    }

    return { entries, skipped };
  }

  private cloneRootOf(repo: RunRepoRef): string | null {
    return repo.clonePath ?? null;
  }

  private assertPath(path: string): void {
    if (path.length > MAX_DOC_PATH_CHARS || !isProjectDocPath(path)) {
      throw new AppError('invalid_path', `Not a project document path: ${path}`, 400);
    }
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepoRow> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async requireOwner(
    kind: DocOwnerKind,
    workspaceId: string,
    ownerId: string,
  ): Promise<void> {
    const exists = await this.deps.store.ownerExists(kind, workspaceId, ownerId);
    if (!exists) throw new NotFoundError(kind === 'agent' ? 'Agent not found' : 'Skill not found');
  }

  private checked<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, dto: unknown): T {
    const parsed = schema.safeParse(dto);
    if (!parsed.success) {
      this.deps.logger?.error(
        { issues: parsed.error.issues },
        'project context: response failed its own contract',
      );
      throw new AppError('internal_error', 'Project context failed its own contract', 500);
    }
    return parsed.data;
  }
}
