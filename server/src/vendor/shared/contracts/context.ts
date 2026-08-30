import { z } from 'zod';

/**
 * L05 — Project Context contracts: the markdown documents discovered in a
 * repository clone, the attachments that bind them to an agent or a skill, and
 * the assembled block a review run injects as `## Project context`.
 *
 * Endpoints served:
 *  - GET  /repos/:id/context           → ProjectDocList
 *  - GET  /repos/:id/context/file      → ProjectDocBody
 *  - POST /repos/:id/context/resync    → ProjectDocList
 *  - POST /repos/:id/context/estimate  → TokenEstimate
 *  - GET|PUT /agents/:id/context       → DocAttachment[] / DocAttachmentInput
 *  - GET|PUT /skills/:id/context       → DocAttachment[] / DocAttachmentInput
 *
 * `ProjectDoc` supersedes `SpecFile` (contracts/platform.ts), which cannot
 * carry `omitted` or `used_by_agents`.
 */

// ---- Discovery ----

export const ProjectDocCategory = z.enum(['specs', 'docs', 'plans', 'insights']);
export type ProjectDocCategory = z.infer<typeof ProjectDocCategory>;

/** One markdown document in the clone, identified by its repo-relative path. */
export const ProjectDoc = z.object({
  path: z.string(),
  name: z.string(),
  folder: z.string(),
  category: ProjectDocCategory,
  /** Agents reaching this document, directly or through a linked skill; each once. */
  used_by_agents: z.array(z.string()),
});
export type ProjectDoc = z.infer<typeof ProjectDoc>;

export const ProjectDocList = z.object({
  documents: z.array(ProjectDoc),
  /** Documents beyond the discovery cap, dropped from `documents`. */
  omitted: z.number().int().nonnegative().default(0),
  /** Why the list is empty when it is empty for a structural reason. */
  reason: z.enum(['not_cloned']).nullish(),
  last_synced_at: z.string().nullish(),
});
export type ProjectDocList = z.infer<typeof ProjectDocList>;

export const ProjectDocBody = z.object({
  path: z.string(),
  content: z.string(),
  truncated: z.boolean().optional(),
});
export type ProjectDocBody = z.infer<typeof ProjectDocBody>;

// ---- Attachments ----

export const MAX_ATTACHMENTS = 20;

export const ATTACHMENT_PATHS_DOS_CEILING = 1_000;

/** A document attached to an agent or a skill; the body is never stored. */
export const DocAttachment = z.object({
  path: z.string(),
  order: z.number().int().nonnegative(),
});
export type DocAttachment = z.infer<typeof DocAttachment>;

/** Body of `PUT /(agents|skills)/:id/context` — the whole ordered list. */
export const DocAttachmentInput = z.object({
  paths: z.array(z.string()).max(ATTACHMENT_PATHS_DOS_CEILING),
});
export type DocAttachmentInput = z.infer<typeof DocAttachmentInput>;

// ---- Token estimate ----

export const TokenEstimate = z.object({
  tokens: z.number().int().nonnegative(),
  estimator: z.enum(['cl100k_base', 'heuristic']),
});
export type TokenEstimate = z.infer<typeof TokenEstimate>;

// ---- Assembled payload ----

/**
 * The assembled block, ready to hand to `ReviewInput.specs`. Each entry is one
 * path-labelled document; `specs_read` lists the paths actually injected, in
 * injection order.
 */
export const ProjectContextPayload = z.object({
  specs: z.array(z.string()),
  specs_read: z.array(z.string()),
});
export type ProjectContextPayload = z.infer<typeof ProjectContextPayload>;
