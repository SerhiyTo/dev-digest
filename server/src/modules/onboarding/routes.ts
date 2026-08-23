import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SettingsFeatureModelResolver } from '../../adapters/settings/feature-models.js';
import { OnboardingRepository } from './repository.js';
import { OnboardingService } from './service.js';

const GENERATE_RATE_LIMIT_MAX = 3;
const GENERATE_RATE_LIMIT_WINDOW = '10 minutes';
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NON_CANONICAL_BUCKET = 'non-canonical';

export function repoIdKey(req: FastifyRequest): string {
  const rawId = (req.params as { id?: unknown } | undefined)?.id;
  const lowered = typeof rawId === 'string' ? rawId.toLowerCase() : '';
  const canonicalId = CANONICAL_UUID.test(lowered) ? lowered : NON_CANONICAL_BUCKET;
  return `onboarding-generate:${canonicalId}`;
}

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const store = new OnboardingRepository(container.db);
  const service = new OnboardingService({
    repoRefs: store,
    tours: store,
    generations: store,
    facts: container.repoIntel,
    git: { readFile: (repo, path) => container.git.readFile(repo, path) },
    featureModels: new SettingsFeatureModelResolver(container.db),
    llm: (provider) => container.llm(provider),
    logger: app.log,
  });

  try {
    const reaped = await service.reapRunning();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale running onboarding generations on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'onboarding-generation reaping failed (non-fatal)');
  }

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getView(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/onboarding/generate',
    {
      schema: { params: IdParams },
      config: {
        rateLimit: {
          max: GENERATE_RATE_LIMIT_MAX,
          timeWindow: GENERATE_RATE_LIMIT_WINDOW,
          keyGenerator: repoIdKey,
        },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const repoId = req.params.id;

      await service.beginGeneration(workspaceId, repoId);

      void service.runGeneration(workspaceId, repoId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        req.log.error({ repoId, err: message }, 'onboarding generation failed unexpectedly');
      });

      reply.code(202);
      return { status: 'accepted' };
    },
  );
}
