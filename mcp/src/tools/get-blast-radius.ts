import { z } from 'zod';
import { BlastRadiusResult } from '../blast/contract.js';
import { capPayload } from '../format/compact.js';
import type { ToolErrorResult } from '../format/errors.js';
import type { ToolCallExtra, ToolContext, ToolDefinition } from './registry.js';

const DESCRIPTION =
  'Blast radius of a pull request: which changed symbols have callers elsewhere. Not implemented yet, always returns an empty result with degraded:true, so do not call it or retry it.';

const inputSchema = {
  repo: z.string().describe('owner/name, or just the repository name'),
  pr: z.number().int().positive().describe('GitHub pull request number'),
};

interface GetBlastRadiusArgs {
  repo: string;
  pr: number;
}

async function handler(
  _ctx: ToolContext,
  rawArgs: unknown,
  _extra: ToolCallExtra,
): Promise<ToolErrorResult> {
  const { repo, pr } = rawArgs as GetBlastRadiusArgs;

  const stub = BlastRadiusResult.parse({
    changed_symbols: [],
    downstream: [],
    summary: '',
    degraded: true,
    reason: 'not_implemented',
  });

  return {
    isError: false,
    text: capPayload({ repo, pr, ...stub }),
  };
}

export const getBlastRadiusTool: ToolDefinition = {
  name: 'get_blast_radius',
  description: DESCRIPTION,
  inputSchema,
  handler,
};
