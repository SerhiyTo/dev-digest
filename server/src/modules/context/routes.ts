import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DocAttachmentInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MAX_ATTACHMENTS } from './constants.js';
import type { DefaultBranchDocs, DocOwnerKind, Logger, Tokens } from './ports.js';
import { ContextRepository } from './repository.js';
import { ContextService, MAX_DOC_PATH_CHARS } from './service.js';

const pathValidatedByTheServiceNotBySchema = z.string().min(1).max(MAX_DOC_PATH_CHARS);

const FileQuery = z.object({ path: pathValidatedByTheServiceNotBySchema });

const EstimateBody = z.object({
  paths: z.array(pathValidatedByTheServiceNotBySchema).max(MAX_ATTACHMENTS),
});

const OWNER_PREFIX: Record<DocOwnerKind, string> = {
  agent: '/agents',
  skill: '/skills',
};

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const docs: DefaultBranchDocs = container.cloneDocs;
  const tokens: Tokens = container.tokenizer;

  const build = (logger: Logger) =>
    new ContextService({ store: new ContextRepository(container.db), docs, tokens, logger });

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return build(req.log).list(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return build(req.log).document(workspaceId, req.params.id, req.query.path);
    },
  );

  app.post('/repos/:id/context/resync', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return build(req.log).resync(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/context/estimate',
    { schema: { params: IdParams, body: EstimateBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return build(req.log).estimate(workspaceId, req.params.id, req.body.paths);
    },
  );

  for (const kind of ['agent', 'skill'] as const) {
    app.get(
      `${OWNER_PREFIX[kind]}/:id/context`,
      { schema: { params: IdParams } },
      async (req) => {
        const { workspaceId } = await getContext(container, req);
        return build(req.log).attachments(workspaceId, kind, req.params.id);
      },
    );

    app.put(
      `${OWNER_PREFIX[kind]}/:id/context`,
      { schema: { params: IdParams, body: DocAttachmentInput } },
      async (req) => {
        const { workspaceId } = await getContext(container, req);
        return build(req.log).setAttachments(workspaceId, kind, req.params.id, req.body.paths);
      },
    );
  }
}
