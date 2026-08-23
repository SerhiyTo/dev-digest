import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import type { BlastEngine, Logger } from './ports.js';
import { BlastRepository } from './repository.js';
import { BlastService } from './service.js';

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const engine: BlastEngine = container.repoIntel;

  const build = (logger: Logger) =>
    new BlastService({ store: new BlastRepository(container.db), engine, logger });

  app.get('/pulls/:id/blast-radius', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const dto = await build(req.log).get(workspaceId, req.params.id);
    if (!dto) throw new NotFoundError('Pull request not found');
    return dto;
  });
}
