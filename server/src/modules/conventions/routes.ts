import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';
import { MAX_RULE_CHARS, MIN_RULE_CHARS } from './constants.js';

/**
 * Conventions module — scan a repo for house rules, triage them, merge the
 * accepted ones into a skill.
 *   GET    /repos/:id/conventions             → scan state + candidates (polled)
 *   POST   /repos/:id/conventions/scan        → start a background scan (202)
 *   POST   /conventions/:id/(accept|reject)   → triage one candidate
 *   PATCH  /conventions/:id                   → edit the rule text
 *   POST   /repos/:id/conventions/status      → bulk status (Deselect all)
 *   GET    /repos/:id/conventions/skill-draft → the editable merge preview
 *   POST   /repos/:id/conventions/skill       → create or update the skill
 *
 * The scan runs as a fire-and-forget background task rather than a JobRunner
 * job: `convention_scans` already carries the status the UI polls, so the job
 * row was redundant, and the runner's global 120s handler timeout is shorter
 * than a legitimate two-call scan.
 *
 * The merge is a route of THIS module, not `POST /skills`, because that route
 * accepts a client-supplied `source` — a client could post the generated body
 * as `manual` and receive an enabled skill of raw model output. Here `source`
 * is server-side and the creation gate cannot be bypassed.
 */

const ScanBody = z.object({ path_prefix: z.string().trim().min(1).max(200).optional() });

const UpdateConventionBody = z.object({
  rule: z.string().trim().min(MIN_RULE_CHARS).max(MAX_RULE_CHARS),
});

const BulkStatusBody = z.object({
  ids: z.array(z.string().uuid()).max(200),
  status: ConventionStatus,
});

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  body: z.string().min(1),
  skill_id: z.string().uuid().optional(),
});

const CONVENTION_ACTIONS = { accept: 'accepted', reject: 'rejected' } as const;

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService(container);

  // Awaited at plugin load, before the server accepts requests, so a scan
  // started by THIS process can never be mistaken for an orphan.
  try {
    const reaped = await service.reapStaleScans();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale running convention scans on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'convention-scan reaping failed (non-fatal)');
  }

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const view = await service.view(workspaceId, req.params.id);
    if (!view) throw new NotFoundError('Repo not found');
    return view;
  });

  app.post(
    '/repos/:id/conventions/scan',
    {
      schema: { params: IdParams, body: ScanBody },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const view = await service.view(workspaceId, req.params.id);
      if (!view) throw new NotFoundError('Repo not found');

      const repoId = req.params.id;
      const payload = { workspaceId, repoId, pathPrefix: req.body.path_prefix ?? null };

      // The 'running' row is written BEFORE responding, so the page never polls
      // a state older than the 202 it just received.
      const started = await service.beginScan(payload);
      if (!started) throw new NotFoundError('Repo not found');

      // Fire-and-forget: the scan outlives this request and reports itself
      // through `convention_scans`. `runScan` records its own failures; this
      // catch only covers a throw it could not (an unreachable DB, say), which
      // would otherwise leave the row 'running' forever.
      void service.runScan(payload).catch(async (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ repoId, err: message }, 'conventions scan failed');
        try {
          await service.failScan(repoId, message);
        } catch (closeErr) {
          app.log.warn(
            { repoId, err: (closeErr as Error).message },
            'could not close the failed convention scan',
          );
        }
      });

      reply.code(202);
      return { status: 'accepted' };
    },
  );

  for (const [action, status] of Object.entries(CONVENTION_ACTIONS)) {
    app.post(`/conventions/:id/${action}`, { schema: { params: IdParams } }, async (req) => {
      const { workspaceId } = await getContext(container, req);
      const convention = await service.setStatus(workspaceId, req.params.id, status);
      if (!convention) throw new NotFoundError('Convention not found');
      return { convention };
    });
  }

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const convention = await service.updateRule(workspaceId, req.params.id, req.body.rule);
      if (!convention) throw new NotFoundError('Convention not found');
      return { convention };
    },
  );

  app.post(
    '/repos/:id/conventions/status',
    { schema: { params: IdParams, body: BulkStatusBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const conventions = await service.setStatusMany(
        workspaceId,
        req.params.id,
        req.body.ids,
        req.body.status,
      );
      if (!conventions) throw new NotFoundError('Repo not found');
      return { conventions };
    },
  );

  app.get('/repos/:id/conventions/skill-draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const draft = await service.skillDraft(workspaceId, req.params.id);
    if (!draft) throw new NotFoundError('No accepted conventions to merge');
    return draft;
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, {
        name: req.body.name,
        description: req.body.description,
        type: req.body.type,
        body: req.body.body,
        ...(req.body.skill_id !== undefined ? { skillId: req.body.skill_id } : {}),
      });
      if (!skill) throw new NotFoundError('No accepted conventions to merge');
      reply.code(req.body.skill_id ? 200 : 201);
      return skill;
    },
  );
}
