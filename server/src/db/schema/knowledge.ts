import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  vector,
  index,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * A convention citation, verified by the extractor's grounding gate before the
 * row is written: the snippet was re-found in `path` and the line numbers were
 * recomputed from the match, not taken from the model.
 */
export interface ConventionEvidenceRow {
  path: string;
  start_line: number;
  end_line: number;
  snippet: string;
}

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    rule: text('rule').notNull(),
    evidence: jsonb('evidence').$type<ConventionEvidenceRow[]>().notNull(),
    occurrenceFiles: integer('occurrence_files'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    memoryId: uuid('memory_id').references(() => memory.id, { onDelete: 'set null' }),
    createdAt: now(),
  },
  (t) => ({ repoIdx: index('conventions_repo_idx').on(t.repoId) }),
);

/**
 * Per-repo scan status, 1:1 with repos (PK = repoId, kept current by the scan
 * job) — the same shape as repo_index_state. Holds the scan's RESULTS, which is
 * why it is not derived from the `jobs` row: `jobs.payload` is the input.
 */
export const conventionScans = pgTable('convention_scans', {
  repoId: uuid('repo_id')
    .primaryKey()
    .references(() => repos.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull(),
  pathPrefix: text('path_prefix'),
  sampledFiles: integer('sampled_files').notNull().default(0),
  selectedFiles: jsonb('selected_files').$type<string[]>(),
  candidateCount: integer('candidate_count').notNull().default(0),
  droppedCount: integer('dropped_count').notNull().default(0),
  droppedReasons: jsonb('dropped_reasons').$type<Record<string, number>>(),
  costUsd: doublePrecision('cost_usd'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  model: text('model'),
  degradedReason: text('degraded_reason'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});
