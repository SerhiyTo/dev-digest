import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { MAX_HISTORY_PROBE_PATHS, MAX_HISTORY_PRS, MAX_OVERLAP_PATHS_PER_PR } from './constants.js';
import type { BlastHistoryRow, BlastPullSummary, BlastStore } from './ports.js';

export class BlastRepository implements BlastStore {
  constructor(private db: Db) {}

  async getPullSummary(workspaceId: string, prId: string): Promise<BlastPullSummary | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getChangedPaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((row) => row.path);
  }

  /**
   * `pull_requests` has no `merged_at` column — the GitHub adapter reads
   * `pr.merged_at` only to derive `status`, never persists it
   * (`adapters/github/octokit.ts`). Callers approximate it as
   * `updated_at ?? opened_at` and carry the real state in `status`, which the
   * UI renders as its badge; `merged_at` is only ever shown as a relative-time
   * hint, so this approximation never asserts a merge that did not happen.
   */
  async getPriorPrs(
    workspaceId: string,
    repoId: string,
    prId: string,
    paths: string[],
  ): Promise<BlastHistoryRow[]> {
    if (paths.length === 0) return [];
    const probePaths = paths.slice(0, MAX_HISTORY_PROBE_PATHS);

    const rows = await this.db
      .select({
        prNumber: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        status: t.pullRequests.status,
        updatedAt: t.pullRequests.updatedAt,
        openedAt: t.pullRequests.openedAt,
        overlapCount: sql<number>`count(distinct ${t.prFiles.path})::int`,
        overlapPaths: sql<string[]>`array_agg(distinct ${t.prFiles.path})`,
      })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          ne(t.pullRequests.id, prId),
          inArray(t.prFiles.path, probePaths),
        ),
      )
      .groupBy(t.pullRequests.id)
      .orderBy(
        sql`count(distinct ${t.prFiles.path}) desc`,
        sql`${t.pullRequests.updatedAt} desc nulls last`,
      )
      .limit(MAX_HISTORY_PRS);

    return rows.map((row) => ({
      prNumber: row.prNumber,
      title: row.title,
      author: row.author,
      status: row.status,
      updatedAt: row.updatedAt,
      openedAt: row.openedAt,
      overlapCount: row.overlapCount,
      overlapPaths: [...row.overlapPaths].sort().slice(0, MAX_OVERLAP_PATHS_PER_PR),
    }));
  }
}
