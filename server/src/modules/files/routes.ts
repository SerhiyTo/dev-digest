import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { readClonedFileBounded } from '../../adapters/git/simple-git.js';
import type { FileReader } from './ports.js';
import { FilesRepository } from './repository.js';
import { FilesService, MAX_REPO_PATH_CHARS } from './service.js';

const FileQuery = z.object({ path: z.string().min(1).max(MAX_REPO_PATH_CHARS) });

export default async function filesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const files: FileReader = {
    read: (repo, path, maxBytes) =>
      readClonedFileBounded(container.git.clonePathFor(repo), path, maxBytes),
  };

  const service = new FilesService({
    repos: new FilesRepository(container.db),
    files,
  });

  app.get(
    '/repos/:id/file',
    { schema: { params: IdParams, querystring: FileQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.readFile(workspaceId, req.params.id, req.query.path);
    },
  );
}
