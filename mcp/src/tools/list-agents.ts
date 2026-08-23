import { capPayload, toAgentsPayload } from '../format/compact.js';
import type { ToolErrorResult } from '../format/errors.js';
import type { ToolCallExtra, ToolContext, ToolDefinition } from './registry.js';

const DESCRIPTION =
  'List the DevDigest reviewer agents configured in this workspace, with the model each one uses. Call this first: run_agent_on_pr takes an agent name from here.';

async function handler(
  ctx: ToolContext,
  _args: Record<string, never>,
  extra: ToolCallExtra,
): Promise<ToolErrorResult> {
  try {
    const agents = await ctx.api.listAgents(extra.signal);
    return { isError: false, text: capPayload(toAgentsPayload(agents)) };
  } catch (err) {
    return ctx.mapError(err);
  }
}

export const listAgentsTool: ToolDefinition = {
  name: 'list_agents',
  description: DESCRIPTION,
  inputSchema: {},
  handler,
};
