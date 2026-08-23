import type { z } from 'zod';
import type { Config } from '../config.js';
import type { DevDigestApi } from '../ports.js';
import {
  AgentListSchema,
  BlastRadiusRowSchema,
  ConventionsRowSchema,
  PullListSchema,
  ReviewListSchema,
  ReviewRunResponseSchema,
  RepoListSchema,
  RunListSchema,
} from './schemas.js';

export type ApiErrorKind = 'unreachable' | 'timeout' | 'rate_limited' | 'shape' | 'http';

export interface ApiErrorInfo {
  kind: ApiErrorKind;
  method: string;
  path: string;
  status?: number;
  detail?: string;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly method: string;
  readonly path: string;
  readonly status: number | undefined;
  readonly detail: string | undefined;

  constructor(info: ApiErrorInfo) {
    super(`${info.kind}: ${info.method} ${info.path}`);
    this.name = 'ApiError';
    this.kind = info.kind;
    this.method = info.method;
    this.path = info.path;
    this.status = info.status;
    this.detail = info.detail;
  }
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  timeoutMs: number;
  signal?: AbortSignal;
  body?: unknown;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function rawRequest(
  config: Config,
  opts: RequestOptions,
): Promise<{ status: number; text: string }> {
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs);
  const combinedSignal = opts.signal ? AbortSignal.any([timeoutSignal, opts.signal]) : timeoutSignal;

  const url = `${config.apiUrl}${opts.path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method,
      signal: combinedSignal,
      ...(opts.body !== undefined
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts.body) }
        : {}),
    });
  } catch (err) {
    if (isAbortError(err)) {
      if (opts.signal?.aborted) {
        console.error(`[devdigest-mcp] cancelled: ${opts.method} ${opts.path}`);
        throw err;
      }
      console.error(`[devdigest-mcp] timeout: ${opts.method} ${opts.path} after ${opts.timeoutMs}ms`);
      throw new ApiError({ kind: 'timeout', method: opts.method, path: opts.path });
    }
    console.error(`[devdigest-mcp] unreachable: ${opts.method} ${opts.path} — ${describeError(err)}`);
    throw new ApiError({
      kind: 'unreachable',
      method: opts.method,
      path: opts.path,
      detail: describeError(err),
    });
  }

  const text = await response.text();

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after');
    console.error(`[devdigest-mcp] rate_limited: ${opts.method} ${opts.path}`);
    throw new ApiError({
      kind: 'rate_limited',
      method: opts.method,
      path: opts.path,
      status: 429,
      ...(retryAfter !== null ? { detail: retryAfter } : {}),
    });
  }

  if (response.status < 200 || response.status >= 300) {
    console.error(`[devdigest-mcp] http ${response.status}: ${opts.method} ${opts.path}`);
    throw new ApiError({
      kind: 'http',
      method: opts.method,
      path: opts.path,
      status: response.status,
      detail: text.slice(0, 200),
    });
  }

  return { status: response.status, text };
}

function parseJson<T>(schema: z.ZodType<T>, text: string, opts: { method: string; path: string }): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`[devdigest-mcp] shape (invalid JSON): ${opts.method} ${opts.path}`);
    throw new ApiError({
      kind: 'shape',
      method: opts.method,
      path: opts.path,
      detail: 'response was not valid JSON',
    });
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const fieldPath = issue && issue.path.length > 0 ? issue.path.join('.') : '(root)';
    const detail = `${fieldPath}: ${issue?.message ?? 'invalid shape'}`;
    console.error(`[devdigest-mcp] shape: ${opts.method} ${opts.path} — ${detail}`);
    throw new ApiError({ kind: 'shape', method: opts.method, path: opts.path, detail });
  }
  return result.data;
}

async function fetchJson<T>(config: Config, schema: z.ZodType<T>, opts: RequestOptions): Promise<T> {
  const { text } = await rawRequest(config, opts);
  return parseJson(schema, text, opts);
}

export function createHttpApi(config: Config): DevDigestApi {
  return {
    listAgents(signal) {
      return fetchJson(config, AgentListSchema, {
        method: 'GET',
        path: '/agents',
        timeoutMs: config.requestTimeoutMs,
        ...(signal ? { signal } : {}),
      });
    },

    listRepos(signal) {
      return fetchJson(config, RepoListSchema, {
        method: 'GET',
        path: '/repos',
        timeoutMs: config.requestTimeoutMs,
        ...(signal ? { signal } : {}),
      });
    },

    listPulls(repoId, signal) {
      return fetchJson(config, PullListSchema, {
        method: 'GET',
        path: `/repos/${repoId}/pulls`,
        timeoutMs: config.pullsTimeoutMs,
        ...(signal ? { signal } : {}),
      });
    },

    async startReview(prId, agentId, signal) {
      const response = await fetchJson(config, ReviewRunResponseSchema, {
        method: 'POST',
        path: `/pulls/${prId}/review`,
        timeoutMs: config.requestTimeoutMs,
        body: { agentId },
        ...(signal ? { signal } : {}),
      });
      return response.runs;
    },

    listRuns(prId, signal) {
      return fetchJson(config, RunListSchema, {
        method: 'GET',
        path: `/pulls/${prId}/runs`,
        timeoutMs: config.requestTimeoutMs,
        ...(signal ? { signal } : {}),
      });
    },

    listReviews(prId, signal) {
      return fetchJson(config, ReviewListSchema, {
        method: 'GET',
        path: `/pulls/${prId}/reviews`,
        timeoutMs: config.requestTimeoutMs,
        ...(signal ? { signal } : {}),
      });
    },

    getConventions(repoId, signal) {
      return fetchJson(config, ConventionsRowSchema, {
        method: 'GET',
        path: `/repos/${repoId}/conventions`,
        timeoutMs: config.requestTimeoutMs,
        ...(signal ? { signal } : {}),
      });
    },

    getBlastRadius(prId, signal) {
      return fetchJson(config, BlastRadiusRowSchema, {
        method: 'GET',
        path: `/pulls/${prId}/blast-radius`,
        timeoutMs: config.requestTimeoutMs,
        ...(signal ? { signal } : {}),
      });
    },
  };
}
