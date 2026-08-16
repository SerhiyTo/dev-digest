import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { CallToolResult, ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import type { Config } from './config.js';
import { INSTRUCTIONS } from './instructions.js';
import type { DevDigestApi } from './ports.js';
import { createResolver } from './resolve/refs.js';
import type { ToolProgress } from './tools/registry.js';
import { TOOLS, createToolContext } from './tools/registry.js';

type ToolRequestExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

type RegisterAnyTool = (
  name: string,
  config: { description: string; inputSchema: ZodRawShape },
  cb: (args: Record<string, unknown>, extra: ToolRequestExtra) => Promise<CallToolResult>,
) => unknown;

export interface CreateServerDeps {
  api: DevDigestApi;
  config: Config;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createServer(deps: CreateServerDeps): McpServer {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;

  const resolver = createResolver({ api: deps.api, cacheTtlMs: deps.config.cacheTtlMs, now });
  const ctx = createToolContext({ api: deps.api, config: deps.config, resolver, now, sleep });

  const server = new McpServer(
    { name: 'devdigest', version: '0.0.0' },
    { instructions: INSTRUCTIONS },
  );

  const registerTool = server.registerTool.bind(server) as unknown as RegisterAnyTool;

  for (const tool of TOOLS) {
    registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args, extra) => {
        const progressToken = extra._meta?.progressToken;
        const onProgress =
          progressToken === undefined
            ? undefined
            : (progress: ToolProgress) => {
                void extra.sendNotification({
                  method: 'notifications/progress',
                  params: {
                    progressToken,
                    progress: progress.progress,
                    total: progress.total,
                    message: progress.message,
                  },
                });
              };

        const result = await tool.handler(ctx, args, {
          signal: extra.signal,
          ...(onProgress ? { onProgress } : {}),
        });

        return {
          content: [{ type: 'text' as const, text: result.text }],
          isError: result.isError,
        };
      },
    );
  }

  return server;
}
