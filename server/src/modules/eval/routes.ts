import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import type { Container } from '../../platform/container.js';
import { EvalService } from './service.js';

const START_RATE_LIMIT_MAX = 10;
const START_RATE_LIMIT_WINDOW = '1 minute';
const SINGLE_CASE_RATE_LIMIT_MAX = 10;
const SINGLE_CASE_RATE_LIMIT_WINDOW = '1 minute';

const EvalCompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });

async function workspaceRateLimitKey(
  container: Container,
  req: FastifyRequest,
  bucket: string,
): Promise<string> {
  const { workspaceId } = await getContext(container, req);
  return `${bucket}:${workspaceId}`;
}

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const repo = container.evalRepo;

  const build = () =>
    new EvalService({
      caseStore: repo,
      runStore: repo,
      suiteRunStore: repo,
      agentConfig: repo,
      sourceDiff: repo,
      executor: container.evalRunner,
    });

  app.post('/findings/:id/eval-case', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const result = await build().createFromFinding(workspaceId, req.params.id);
    reply.code(result.created ? 201 : 200);
    return result;
  });

  app.post('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const created = await build().createCase(workspaceId, req.params.id, req.body);
    reply.code(201);
    return created;
  });

  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const cases = await build().listCases(workspaceId, req.params.id);
    return { cases };
  });

  app.get('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return build().getCase(workspaceId, req.params.id);
  });

  app.patch('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return build().updateCase(workspaceId, req.params.id, req.body);
  });

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return build().deleteCase(workspaceId, req.params.id);
  });

  app.post(
    '/eval-cases/:id/run',
    {
      schema: { params: IdParams },
      config: {
        rateLimit: {
          max: SINGLE_CASE_RATE_LIMIT_MAX,
          timeWindow: SINGLE_CASE_RATE_LIMIT_WINDOW,
          keyGenerator: (req: FastifyRequest) =>
            workspaceRateLimitKey(container, req, 'eval-case-run'),
        },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return build().runSingleCase(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-runs/start',
    {
      schema: { params: IdParams },
      config: {
        rateLimit: {
          max: START_RATE_LIMIT_MAX,
          timeWindow: START_RATE_LIMIT_WINDOW,
          keyGenerator: (req: FastifyRequest) =>
            workspaceRateLimitKey(container, req, 'eval-suite-start'),
        },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const started = await build().startSuiteRun(workspaceId, req.params.id);
      reply.code(202);
      return started;
    },
  );

  app.post('/eval-suite-runs/:id/cancel', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return build().cancelSuiteRun(workspaceId, req.params.id);
  });

  app.get('/eval-suite-runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return build().getSuiteRun(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const runs = await build().listSuiteRuns(workspaceId, req.params.id);
    return { runs };
  });

  app.get(
    '/agents/:id/eval-runs/compare',
    { schema: { params: IdParams, querystring: EvalCompareQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return build().compareRuns(workspaceId, req.params.id, req.query.a, req.query.b);
    },
  );

  app.get('/agents/:id/eval-dashboard', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return build().getDashboard(workspaceId, req.params.id);
  });

  app.get('/evals', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const dashboards = await build().listDashboards(workspaceId);
    return { dashboards };
  });
}
