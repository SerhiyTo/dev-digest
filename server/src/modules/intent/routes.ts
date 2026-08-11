import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SettingsFeatureModelResolver } from '../../adapters/settings/feature-models.js';
import { readLinkAllowlist } from '../../adapters/settings/intent-links.js';
import { fetchGuarded } from '../../adapters/http/fetcher.js';
import { runClassifier } from './classifier.js';
import {
  INTENT_FEATURE_MODEL_ID,
  LINK_FETCH_TIMEOUT_MS,
  LINK_MAX_REDIRECTS,
  MAX_LINK_BYTES,
} from './constants.js';
import type { DocSource, IntentClassifier, IssueSource, LinkSource, Logger } from './ports.js';
import { IntentRepository } from './repository.js';
import { IntentService } from './service.js';

export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const featureModels = new SettingsFeatureModelResolver(container.db);

  const docs: DocSource = { read: (repo, path) => container.git.readFile(repo, path) };

  const issues: IssueSource = {
    get: async (repo, number) => {
      const gh = await container.github();
      const issue = await gh.getIssue(repo, number);
      return { title: issue.title, body: issue.body ?? '', state: issue.state };
    },
  };

  const links: LinkSource = {
    allowlist: (workspaceId) => readLinkAllowlist(container.db, workspaceId),
    fetch: (url, allowlist) =>
      fetchGuarded(url, {
        allowlist,
        maxBytes: MAX_LINK_BYTES,
        timeoutMs: LINK_FETCH_TIMEOUT_MS,
        maxRedirects: LINK_MAX_REDIRECTS,
      }),
  };

  const classifier: IntentClassifier = {
    async classify(workspaceId, input) {
      const { provider, model } = await featureModels.resolve(workspaceId, INTENT_FEATURE_MODEL_ID);
      return runClassifier(await container.llm(provider), model, input);
    },
  };

  const build = (logger: Logger) =>
    new IntentService({
      store: new IntentRepository(container.db),
      docs,
      issues,
      links,
      classifier,
      logger,
    });

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const record = await build(req.log).get(workspaceId, req.params.id);
    if (!record) throw new NotFoundError('Intent not computed for this PR');
    return record;
  });

  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const record = await build(req.log).compute(workspaceId, req.params.id);
      if (!record) throw new NotFoundError('PR not found');
      return record;
    },
  );
}
