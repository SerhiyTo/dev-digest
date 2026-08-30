import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ContextRepoRow,
  DocAttachmentRow,
  DocOwnerKind,
  DocStore,
  DocReachedByAgentRow,
} from './ports.js';

export class ContextRepository implements DocStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ContextRepoRow | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async ownerExists(
    kind: DocOwnerKind,
    workspaceId: string,
    ownerId: string,
  ): Promise<boolean> {
    if (kind === 'agent') {
      const [row] = await this.db
        .select({ id: t.agents.id })
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, ownerId)));
      return row !== undefined;
    }
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, ownerId)));
    return row !== undefined;
  }

  async attachments(kind: DocOwnerKind, ownerId: string): Promise<DocAttachmentRow[]> {
    if (kind === 'agent') {
      return this.db
        .select({ path: t.agentDocs.path, order: t.agentDocs.order })
        .from(t.agentDocs)
        .where(eq(t.agentDocs.agentId, ownerId))
        .orderBy(asc(t.agentDocs.order), asc(t.agentDocs.path));
    }
    return this.db
      .select({ path: t.skillDocs.path, order: t.skillDocs.order })
      .from(t.skillDocs)
      .where(eq(t.skillDocs.skillId, ownerId))
      .orderBy(asc(t.skillDocs.order), asc(t.skillDocs.path));
  }

  async setAttachments(
    kind: DocOwnerKind,
    ownerId: string,
    paths: readonly string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (kind === 'agent') {
        await tx.delete(t.agentDocs).where(eq(t.agentDocs.agentId, ownerId));
        if (paths.length === 0) return;
        await tx
          .insert(t.agentDocs)
          .values(paths.map((path, order) => ({ agentId: ownerId, path, order })));
        return;
      }
      await tx.delete(t.skillDocs).where(eq(t.skillDocs.skillId, ownerId));
      if (paths.length === 0) return;
      await tx
        .insert(t.skillDocs)
        .values(paths.map((path, order) => ({ skillId: ownerId, path, order })));
    });
  }

  async agentsReachingDocs(workspaceId: string): Promise<DocReachedByAgentRow[]> {
    const direct = await this.db
      .select({ path: t.agentDocs.path, agentName: t.agents.name })
      .from(t.agentDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentDocs.agentId))
      .where(eq(t.agents.workspaceId, workspaceId));

    const viaSkills = await this.db
      .select({ path: t.skillDocs.path, agentName: t.agents.name })
      .from(t.skillDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillDocs.skillId))
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skillDocs.skillId))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.skills.enabled, true)));

    return [...direct, ...viaSkills];
  }

  async agentPathsInAttachmentOrder(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentDocs.path })
      .from(t.agentDocs)
      .where(eq(t.agentDocs.agentId, agentId))
      .orderBy(asc(t.agentDocs.order), asc(t.agentDocs.path));
    return rows.map((r) => r.path);
  }

  async skillPathsInLinkOrder(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillDocs.path })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(t.skillDocs, eq(t.skillDocs.skillId, t.agentSkills.skillId))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order), asc(t.skillDocs.order), asc(t.skillDocs.path));
    return rows.map((r) => r.path);
  }
}
