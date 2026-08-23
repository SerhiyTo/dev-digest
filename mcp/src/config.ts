export interface Config {
  apiUrl: string;
  requestTimeoutMs: number;
  pullsTimeoutMs: number;
  waitBudgetMs: number;
  cacheTtlMs: number;
}

const DEFAULT_API_URL = 'http://localhost:3001';

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawApiUrl = env.DEVDIGEST_API_URL?.trim() || DEFAULT_API_URL;

  return {
    apiUrl: normalizeApiUrl(rawApiUrl),
    requestTimeoutMs: 15_000,
    pullsTimeoutMs: 30_000,
    waitBudgetMs: 180_000,
    cacheTtlMs: 60_000,
  };
}

function normalizeApiUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `DEVDIGEST_API_URL is not a valid URL: "${value}". Expected something like http://localhost:3001.`,
    );
  }
  return parsed.toString().replace(/\/+$/, '');
}
