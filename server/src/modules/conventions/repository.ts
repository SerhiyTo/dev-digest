import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionEvidenceRow } from '../../db/schema/knowledge.js';

/**
 * Conventions data-access. Owns `conventions` and the 1:1 `convention_scans`
 * row per repo. Workspace-scoped throughout, so a foreign id reads as missing
 * rather than leaking across tenants.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  rule: string;
  evidence: ConventionEvidenceRow[];
  occurrenceFiles: number | null;
  confidence: number;
  status: ConventionStatus;
}

export interface RepoRefRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export interface StartScan {
  repoId: string;
  workspaceId: string;
  pathPrefix: string | null;
}

export interface FinishScan {
  status: 'done' | 'failed';
  sampledFiles?: number;
  selectedFiles?: string[];
  candidateCount?: number;
  droppedCount?: number;
  droppedReasons?: Record<string, number>;
  costUsd?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  model?: string | null;
  degradedReason?: string | null;
  error?: string | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepoRef(workspaceId: string, repoId: string): Promise<RepoRefRow | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), asc(t.conventions.createdAt));
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    const rows = await this.listForRepo(workspaceId, repoId);
    return rows.filter((row) => row.status === 'accepted');
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: ConventionStatus,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ status })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async setStatusMany(
    workspaceId: string,
    repoId: string,
    ids: string[],
    status: ConventionStatus,
  ): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .update(t.conventions)
      .set({ status })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      )
      .returning();
  }

  async updateRule(
    workspaceId: string,
    id: string,
    rule: string,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ rule })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Swap the repo's whole candidate set atomically — a partial rescan is worse than none. */
  async replaceForRepo(
    workspaceId: string,
    repoId: string,
    rows: InsertConvention[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
      if (rows.length > 0) await tx.insert(t.conventions).values(rows);
    });
  }

  async linkToSkill(workspaceId: string, ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(t.conventions)
      .set({ skillId })
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }

  async linkToMemory(workspaceId: string, id: string, memoryId: string | null): Promise<void> {
    await this.db
      .update(t.conventions)
      .set({ memoryId })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
  }

  async getScan(repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId));
    return row;
  }

  async startScan(values: StartScan): Promise<void> {
    const fresh = {
      workspaceId: values.workspaceId,
      status: 'running' as const,
      pathPrefix: values.pathPrefix,
      sampledFiles: 0,
      selectedFiles: null,
      candidateCount: 0,
      droppedCount: 0,
      droppedReasons: null,
      costUsd: null,
      tokensIn: null,
      tokensOut: null,
      model: null,
      degradedReason: null,
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    };
    await this.db
      .insert(t.conventionScans)
      .values({ repoId: values.repoId, ...fresh })
      .onConflictDoUpdate({ target: t.conventionScans.repoId, set: fresh });
  }

  /**
   * Close scans left 'running' by a dead process — the background task died with
   * it, so the row would otherwise poll as "Scanning…" forever.
   */
  async reapRunningScans(error: string): Promise<number> {
    const rows = await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(eq(t.conventionScans.status, 'running'))
      .returning({ repoId: t.conventionScans.repoId });
    return rows.length;
  }

  async finishScan(repoId: string, patch: FinishScan): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({
        status: patch.status,
        finishedAt: new Date(),
        ...(patch.sampledFiles !== undefined ? { sampledFiles: patch.sampledFiles } : {}),
        ...(patch.selectedFiles !== undefined ? { selectedFiles: patch.selectedFiles } : {}),
        ...(patch.candidateCount !== undefined ? { candidateCount: patch.candidateCount } : {}),
        ...(patch.droppedCount !== undefined ? { droppedCount: patch.droppedCount } : {}),
        ...(patch.droppedReasons !== undefined ? { droppedReasons: patch.droppedReasons } : {}),
        ...(patch.costUsd !== undefined ? { costUsd: patch.costUsd } : {}),
        ...(patch.tokensIn !== undefined ? { tokensIn: patch.tokensIn } : {}),
        ...(patch.tokensOut !== undefined ? { tokensOut: patch.tokensOut } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.degradedReason !== undefined ? { degradedReason: patch.degradedReason } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      })
      .where(eq(t.conventionScans.repoId, repoId));
  }

  async findExtractedSkill(
    workspaceId: string,
    name: string,
  ): Promise<{ id: string; name: string; version: number; body: string } | undefined> {
    const [row] = await this.db
      .select({
        id: t.skills.id,
        name: t.skills.name,
        version: t.skills.version,
        body: t.skills.body,
      })
      .from(t.skills)
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.name, name),
          eq(t.skills.source, 'extracted'),
          eq(t.skills.type, 'convention'),
        ),
      );
    return row;
  }

  async replaceMemory(
    previousIds: string[],
    rows: (typeof t.memory.$inferInsert)[],
  ): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      if (previousIds.length > 0) {
        await tx.delete(t.memory).where(inArray(t.memory.id, previousIds));
      }
      if (rows.length === 0) return [];
      const inserted = await tx.insert(t.memory).values(rows).returning({ id: t.memory.id });
      return inserted.map((row) => row.id);
    });
  }
}
