import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentPull, IntentRow, IntentStore, IntentUpsert } from './ports.js';

export class IntentRepository implements IntentStore {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<IntentPull | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        branch: t.pullRequests.branch,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));

    if (!row) return undefined;
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      body: row.body,
      branch: row.branch,
      headSha: row.headSha,
      repo: { owner: row.owner, name: row.name },
    };
  }

  async getFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }

  async getCommitMessages(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId));
    return rows.map((r) => r.message);
  }

  async getIntentRow(prId: string): Promise<IntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if (!row) return undefined;
    return {
      prId: row.prId,
      intent: row.intent,
      inScope: row.inScope,
      outOfScope: row.outOfScope,
      riskAreas: row.riskAreas,
      evidence: row.evidence,
      confidence: row.confidence,
      model: row.model,
      headSha: row.headSha,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      computedAt: row.computedAt,
    };
  }

  async upsertIntent(values: IntentUpsert): Promise<void> {
    const columns = {
      intent: values.intent,
      inScope: values.inScope,
      outOfScope: values.outOfScope,
      riskAreas: values.riskAreas,
      evidence: values.evidence,
      confidence: values.confidence,
      model: values.model,
      headSha: values.headSha,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd,
      computedAt: new Date(),
    };
    await this.db
      .insert(t.prIntent)
      .values({ prId: values.prId, ...columns })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: columns });
  }
}
