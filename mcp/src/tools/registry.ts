import type { ZodRawShape } from 'zod';
import type { Config } from '../config.js';
import type { DevDigestApi } from '../ports.js';
import type { Resolver } from '../resolve/refs.js';
import { ResolveError } from '../resolve/refs.js';
import type { ToolErrorResult } from '../format/errors.js';
import {
  ambiguousRepo,
  apiUnreachable,
  httpError,
  prNotPersisted,
  rateLimited,
  requestTimedOut,
  shapeMismatch,
  unknownAgent,
  unknownPr,
  unknownRepo,
} from '../format/errors.js';
import { listAgentsTool } from './list-agents.js';
import { runAgentOnPrTool } from './run-agent-on-pr.js';
import { getFindingsTool } from './get-findings.js';
import { getConventionsTool } from './get-conventions.js';
import { getBlastRadiusTool } from './get-blast-radius.js';

export interface ToolContext {
  api: DevDigestApi;
  config: Config;
  resolver: Resolver;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  mapError: (err: unknown, repoDisplay?: string) => ToolErrorResult;
}

export interface ToolProgress {
  progress: number;
  total: number;
  message: string;
}

export interface ToolCallExtra {
  signal: AbortSignal;
  onProgress?: (progress: ToolProgress) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (ctx: ToolContext, args: any, extra: ToolCallExtra) => Promise<ToolErrorResult>;
}

const API_ERROR_KINDS = ['unreachable', 'timeout', 'rate_limited', 'shape', 'http'] as const;
type ApiErrorKindLocal = (typeof API_ERROR_KINDS)[number];

interface ApiErrorLike {
  name: 'ApiError';
  kind: ApiErrorKindLocal;
  method: string;
  path: string;
  status?: number;
  detail?: string;
}

function isApiErrorLike(err: unknown): err is ApiErrorLike {
  if (!(err instanceof Error) || err.name !== 'ApiError') return false;
  const candidate = err as unknown as Record<string, unknown>;
  return (
    typeof candidate['kind'] === 'string' &&
    (API_ERROR_KINDS as readonly string[]).includes(candidate['kind'] as string) &&
    typeof candidate['method'] === 'string' &&
    typeof candidate['path'] === 'string'
  );
}

function timeoutSecondsFor(config: Config, path: string): number {
  const ms = /\/pulls$/.test(path) ? config.pullsTimeoutMs : config.requestTimeoutMs;
  return Math.round(ms / 1000);
}

function extractMissingField(detail: string | undefined): string {
  if (detail === undefined) return 'unknown field';
  const separatorIndex = detail.indexOf(':');
  if (separatorIndex <= 0) return 'unknown field';
  const field = detail.slice(0, separatorIndex).trim();
  return field.length > 0 ? field : 'unknown field';
}

function mapError(err: unknown, config: Config, repoDisplay?: string): ToolErrorResult {
  if (err instanceof ResolveError) {
    const info = err.info;
    switch (info.kind) {
      case 'repo_not_found':
        return unknownRepo(info.ref, info.known);
      case 'repo_ambiguous':
        return ambiguousRepo(
          info.ref,
          info.matches.map((repo) => repo.full_name),
        );
      case 'pr_not_found':
        return unknownPr(repoDisplay ?? info.repoId, info.number, info.imported);
      case 'pr_not_persisted':
        return prNotPersisted(repoDisplay ?? info.repoId, info.number);
      case 'agent_not_found':
        return unknownAgent(info.agentName, info.suggestion);
      default:
        return httpError('unknown', 'unknown', 0, 'unrecognized resolve error');
    }
  }

  if (isApiErrorLike(err)) {
    switch (err.kind) {
      case 'unreachable':
        return apiUnreachable(config.apiUrl);
      case 'timeout':
        return requestTimedOut(err.method, err.path, timeoutSecondsFor(config, err.path));
      case 'rate_limited':
        return rateLimited();
      case 'shape':
        return shapeMismatch(err.method, err.path, extractMissingField(err.detail));
      case 'http':
        return httpError(err.method, err.path, err.status ?? 0, err.detail ?? '');
      default:
        return httpError('unknown', 'unknown', 0, 'unrecognized api error');
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  return httpError('unknown', 'unknown', 0, message.slice(0, 200));
}

export interface CreateToolContextDeps {
  api: DevDigestApi;
  config: Config;
  resolver: Resolver;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export function createToolContext(deps: CreateToolContextDeps): ToolContext {
  return {
    ...deps,
    mapError: (err, repoDisplay) => mapError(err, deps.config, repoDisplay),
  };
}

export const TOOLS: readonly ToolDefinition[] = [
  listAgentsTool,
  runAgentOnPrTool,
  getFindingsTool,
  getConventionsTool,
  getBlastRadiusTool,
];
