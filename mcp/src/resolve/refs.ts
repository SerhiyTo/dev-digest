import { closestName, matchAgent, matchRepo } from '../domain/select.js';
import type { AgentRow, DevDigestApi, PullRow, RepoRow } from '../ports.js';
import { createTtlCache } from './cache.js';

const MAX_LISTED = 10;

function capList<T>(items: readonly T[]): T[] {
  return items.slice(0, MAX_LISTED);
}

export type ResolveErrorInfo =
  | { kind: 'repo_not_found'; ref: string; known: string[] }
  | { kind: 'repo_ambiguous'; ref: string; matches: RepoRow[] }
  | { kind: 'pr_not_found'; repoId: string; number: number; imported: number[] }
  | { kind: 'pr_not_persisted'; repoId: string; number: number }
  | { kind: 'agent_not_found'; agentName: string; suggestion?: string };

export class ResolveError extends Error {
  readonly info: ResolveErrorInfo;

  constructor(info: ResolveErrorInfo) {
    super(`resolve error: ${info.kind}`);
    this.name = 'ResolveError';
    this.info = info;
  }
}

export interface ResolverDeps {
  api: DevDigestApi;
  cacheTtlMs: number;
  now: () => number;
}

export interface Resolver {
  resolveRepo(ref: string, signal?: AbortSignal): Promise<RepoRow>;
  resolvePr(repoId: string, number: number, signal?: AbortSignal): Promise<string>;
  resolveAgent(name: string, signal?: AbortSignal): Promise<AgentRow>;
}

const REPOS_KEY = 'repos';
const AGENTS_KEY = 'agents';

export function createResolver(deps: ResolverDeps): Resolver {
  const { api, cacheTtlMs, now } = deps;
  const reposCache = createTtlCache<RepoRow[]>({ ttlMs: cacheTtlMs, now });
  const pullsCache = createTtlCache<PullRow[]>({ ttlMs: cacheTtlMs, now });
  const agentsCache = createTtlCache<AgentRow[]>({ ttlMs: cacheTtlMs, now });

  async function listReposCached(signal?: AbortSignal): Promise<RepoRow[]> {
    const cached = reposCache.get(REPOS_KEY);
    if (cached !== undefined) return cached;
    const repos = await api.listRepos(signal);
    reposCache.set(REPOS_KEY, repos);
    return repos;
  }

  async function listPullsCached(repoId: string, signal?: AbortSignal): Promise<PullRow[]> {
    const cached = pullsCache.get(repoId);
    if (cached !== undefined) return cached;
    const pulls = await api.listPulls(repoId, signal);
    pullsCache.set(repoId, pulls);
    return pulls;
  }

  async function listAgentsCached(signal?: AbortSignal): Promise<AgentRow[]> {
    const cached = agentsCache.get(AGENTS_KEY);
    if (cached !== undefined) return cached;
    const agents = await api.listAgents(signal);
    agentsCache.set(AGENTS_KEY, agents);
    return agents;
  }

  return {
    async resolveRepo(ref, signal) {
      const repos = await listReposCached(signal);
      const match = matchRepo(repos, ref);

      if (match.kind === 'one') return match.repo;

      if (match.kind === 'ambiguous') {
        throw new ResolveError({
          kind: 'repo_ambiguous',
          ref,
          matches: capList(match.matches),
        });
      }

      throw new ResolveError({
        kind: 'repo_not_found',
        ref,
        known: capList(repos.map((repo) => repo.full_name)),
      });
    },

    async resolvePr(repoId, number, signal) {
      const pulls = await listPullsCached(repoId, signal);
      const pull = pulls.find((candidate) => candidate.number === number);

      if (pull === undefined) {
        throw new ResolveError({
          kind: 'pr_not_found',
          repoId,
          number,
          imported: capList(pulls.map((candidate) => candidate.number)),
        });
      }

      if (pull.id === null || pull.id === undefined) {
        throw new ResolveError({ kind: 'pr_not_persisted', repoId, number });
      }

      return pull.id;
    },

    async resolveAgent(name, signal) {
      const agents = await listAgentsCached(signal);
      const match = matchAgent(agents, name);
      if (match !== undefined) return match;

      const suggestion = closestName(
        agents.map((agent) => agent.name),
        name,
      );

      throw new ResolveError({
        kind: 'agent_not_found',
        agentName: name,
        ...(suggestion !== undefined ? { suggestion } : {}),
      });
    },
  };
}
