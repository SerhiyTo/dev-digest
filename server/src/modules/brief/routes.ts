import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SettingsFeatureModelResolver } from '../../adapters/settings/feature-models.js';
import type { Container } from '../../platform/container.js';
import type { Logger } from './ports.js';
import { BriefRepository } from './repository.js';
import { BriefService } from './service.js';

const GENERATE_RATE_LIMIT_MAX = 5;
const GENERATE_RATE_LIMIT_WINDOW = '1 minute';

async function workspaceRateLimitKey(container: Container, req: FastifyRequest): Promise<string> {
  const { workspaceId } = await getContext(container, req);
  return `brief-generate:${workspaceId}`;
}

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const repo = new BriefRepository(container.db);
  const build = (logger: Logger) =>
    new BriefService({
      briefStore: repo,
      generationStore: repo,
      intentSource: repo,
      reviewSource: repo,
      pullSource: repo,
      fileSource: repo,
      blastSource: container.blastSource,
      fileRoleSource: container.briefFileRoles,
      featureModels: new SettingsFeatureModelResolver(container.db),
      llm: (provider) => container.llm(provider),
      logger,
    });

  try {
    const reaped = await build(app.log).reapRunning();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale running brief generations on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'brief-generation reaping failed (non-fatal)');
  }

  app.get('/pulls/:id/brief', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return build(req.log).get(workspaceId, req.params.id);
  });

  app.post(
    '/pulls/:id/brief/generate',
    {
      schema: { params: IdParams },
      config: {
        rateLimit: {
          max: GENERATE_RATE_LIMIT_MAX,
          timeWindow: GENERATE_RATE_LIMIT_WINDOW,
          keyGenerator: (req: FastifyRequest) => workspaceRateLimitKey(container, req),
        },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const prId = req.params.id;
      const service = build(req.log);

      await service.beginGeneration(workspaceId, prId);

      void service.runGeneration(workspaceId, prId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        req.log.error({ prId, err: message }, 'brief generation failed unexpectedly');
      });

      reply.code(202);
      return { status: 'accepted' };
    },
  );
}
