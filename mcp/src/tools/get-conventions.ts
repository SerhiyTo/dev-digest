import { z } from 'zod';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../constants.js';
import { capPayload, toConventionsPayload } from '../format/compact.js';
import type { ToolErrorResult } from '../format/errors.js';
import type { ToolCallExtra, ToolContext, ToolDefinition } from './registry.js';

const DESCRIPTION =
  'Return the coding conventions DevDigest extracted from a repository, each with its confidence and the files that evidence it. Read-only: it never starts a new extraction scan.';

const inputSchema = {
  repo: z.string().describe('owner/name, or just the repository name'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('max findings to return; default 20'),
};

interface GetConventionsArgs {
  repo: string;
  limit?: number;
}

async function handler(
  ctx: ToolContext,
  rawArgs: unknown,
  extra: ToolCallExtra,
): Promise<ToolErrorResult> {
  const { repo, limit } = rawArgs as GetConventionsArgs;

  try {
    const repoRow = await ctx.resolver.resolveRepo(repo, extra.signal);
    const conventions = await ctx.api.getConventions(repoRow.id, extra.signal);
    const payload = toConventionsPayload(conventions);

    if (payload.status === 'never') {
      return {
        isError: false,
        text: capPayload({
          ...payload,
          hint: 'no conventions have been extracted yet; start a scan from the DevDigest UI (repo page → Conventions → Scan), then call this tool again',
        }),
      };
    }

    const cappedConventions = payload.conventions.slice(0, limit ?? DEFAULT_LIMIT);

    return {
      isError: false,
      text: capPayload({ ...payload, conventions: cappedConventions }),
    };
  } catch (err) {
    return ctx.mapError(err);
  }
}

export const getConventionsTool: ToolDefinition = {
  name: 'get_conventions',
  description: DESCRIPTION,
  inputSchema,
  handler,
};
