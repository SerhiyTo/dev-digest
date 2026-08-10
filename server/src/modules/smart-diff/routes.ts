import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import type { Logger } from './ports.js';
import { SmartDiffRepository } from './repository.js';
import { SmartDiffService } from './service.js';

export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const build = (logger: Logger) =>
    new SmartDiffService({ store: new SmartDiffRepository(container.db), logger });

  app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const dto = await build(req.log).get(workspaceId, req.params.id);
    if (!dto) throw new NotFoundError('Pull request not found');
    return dto;
  });
}
