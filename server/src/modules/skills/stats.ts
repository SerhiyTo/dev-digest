import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillStats } from '@devdigest/shared';
import { STATS_WINDOW_DAYS } from './constants.js';

/**
 * Read-only cross-module aggregation behind the Stats tab:
 * agent_skills ⋈ agents ⋈ agent_runs ⋈ reviews ⋈ findings, scoped to a
 * workspace and to the agents a skill is linked to right now. Kept apart from
 * repository.ts, which only owns the skill's own rows.
 */

async function linkedAgents(
  db: Db,
  workspaceId: string,
  skillId: string,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: t.agents.id, name: t.agents.name })
    .from(t.agentSkills)
    .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
    .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)));
}

/**
 * Runs of the linked agents ÷ all runs in the workspace. `null` when the
 * workspace has no runs at all (nothing to divide by); a real `0` when there
 * are runs but none of them belong to a linked agent.
 */
async function pullFrequency(
  db: Db,
  workspaceId: string,
  agentIds: string[],
): Promise<number | null> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      linked: sql<number>`count(*) filter (where ${inArray(t.agentRuns.agentId, agentIds)})`,
    })
    .from(t.agentRuns)
    .where(eq(t.agentRuns.workspaceId, workspaceId));

  const total = Number(row?.total ?? 0);
  if (total === 0) return null;
  return Number(row?.linked ?? 0) / total;
}

/**
 * accepted / (accepted + dismissed) over the findings of the linked agents'
 * reviews, no time window. `null` when nothing has been accepted or
 * dismissed yet (an all-untriaged set, or no findings at all).
 */
async function acceptRate(
  db: Db,
  workspaceId: string,
  agentIds: string[],
): Promise<number | null> {
  const [row] = await db
    .select({
      accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)`,
      dismissed: sql<number>`count(*) filter (where ${t.findings.dismissedAt} is not null)`,
    })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
    .innerJoin(t.agentRuns, eq(t.reviews.runId, t.agentRuns.id))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.agentId, agentIds)));

  const accepted = Number(row?.accepted ?? 0);
  const dismissed = Number(row?.dismissed ?? 0);
  const decided = accepted + dismissed;
  return decided === 0 ? null : accepted / decided;
}

/** Finding counts (total + by category) over the linked agents' reviews in
 *  the last `STATS_WINDOW_DAYS`. */
async function findingsWindow(
  db: Db,
  workspaceId: string,
  agentIds: string[],
): Promise<{ findings_30d: number; findings_by_category: Record<string, number> }> {
  const since = new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ category: t.findings.category, n: sql<number>`count(*)` })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
    .innerJoin(t.agentRuns, eq(t.reviews.runId, t.agentRuns.id))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        inArray(t.agentRuns.agentId, agentIds),
        gte(t.agentRuns.ranAt, since),
      ),
    )
    .groupBy(t.findings.category);

  const findings_by_category: Record<string, number> = {};
  let findings_30d = 0;
  for (const r of rows) {
    const n = Number(r.n);
    findings_by_category[r.category] = n;
    findings_30d += n;
  }
  return { findings_30d, findings_by_category };
}

/**
 * Aggregate stats for a skill's Stats tab. Assumes the skill's existence and
 * workspace membership were already checked by the caller (`SkillsService`,
 * via `repository.getById`) — this function only does the cross-module join.
 */
export async function getSkillStats(
  db: Db,
  workspaceId: string,
  skillId: string,
): Promise<SkillStats> {
  const agents = await linkedAgents(db, workspaceId, skillId);
  const agentIds = agents.map((a) => a.id);

  const [pull_frequency, accept_rate, findings] = await Promise.all([
    pullFrequency(db, workspaceId, agentIds),
    acceptRate(db, workspaceId, agentIds),
    findingsWindow(db, workspaceId, agentIds),
  ]);

  return {
    used_by: agents.length,
    agents,
    pull_frequency,
    accept_rate,
    findings_30d: findings.findings_30d,
    findings_by_category: findings.findings_by_category,
  };
}
