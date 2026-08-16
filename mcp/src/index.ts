import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Config } from './config.js';
import { readConfig } from './config.js';
import { createHttpApi } from './http/client.js';
import { createServer } from './server.js';

function fatal(message: string): never {
  console.error(`[devdigest-mcp] ${message}`);
  process.exit(1);
}

process.on('uncaughtException', (err) => {
  console.error('[devdigest-mcp] uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[devdigest-mcp] unhandled rejection:', reason);
  process.exit(1);
});

async function main(): Promise<void> {
  let config: Config;
  try {
    config = readConfig();
  } catch (err) {
    fatal(err instanceof Error ? err.message : String(err));
  }

  const api = createHttpApi(config);
  const server = createServer({ api, config });

  const shutdown = (signal: NodeJS.Signals) => {
    console.error(`[devdigest-mcp] received ${signal}, shutting down`);
    void server
      .close()
      .catch((err) => {
        console.error('[devdigest-mcp] error while closing server:', err);
      })
      .finally(() => {
        process.exit(0);
      });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[devdigest-mcp] connected, DEVDIGEST_API_URL=${config.apiUrl}`);
}

main().catch((err) => {
  fatal(err instanceof Error ? err.message : String(err));
});
