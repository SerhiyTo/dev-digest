import { z } from 'zod';
import { BlastRadiusResult } from '../blast/contract.js';
import { capPayload, toBlastPayload } from '../format/compact.js';
import type { ToolErrorResult } from '../format/errors.js';
import type { ToolCallExtra, ToolContext, ToolDefinition } from './registry.js';

const DESCRIPTION =
  'Blast radius of a pull request: the symbols it changes, who calls them, and which HTTP endpoints and cron jobs those callers own. Read-only. Returns a degraded best-effort result when the repository is not indexed.';

const inputSchema = {
  repo: z.string().describe('owner/name, or just the repository name'),
  pr: z.number().int().positive().describe('GitHub pull request number'),
};

interface GetBlastRadiusArgs {
  repo: string;
  pr: number;
}

async function handler(
  ctx: ToolContext,
  rawArgs: unknown,
  extra: ToolCallExtra,
): Promise<ToolErrorResult> {
  const { repo, pr } = rawArgs as GetBlastRadiusArgs;

  let repoDisplay: string | undefined;
  try {
    const repoRow = await ctx.resolver.resolveRepo(repo, extra.signal);
    repoDisplay = repoRow.full_name;

    const prId = await ctx.resolver.resolvePr(repoRow.id, pr, extra.signal);
    const row = await ctx.api.getBlastRadius(prId, extra.signal);

    const parsed = BlastRadiusResult.parse(row);

    return {
      isError: false,
      text: capPayload(
        toBlastPayload({
          ...row,
          ...parsed,
          repo: repoDisplay,
          pr,
        }),
      ),
    };
  } catch (err) {
    return ctx.mapError(err, repoDisplay);
  }
}

export const getBlastRadiusTool: ToolDefinition = {
  name: 'get_blast_radius',
  description: DESCRIPTION,
  inputSchema,
  handler,
};
