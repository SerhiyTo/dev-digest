import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/http/client.js';
import type {
  AgentRow,
  ConventionsRow,
  DevDigestApi,
  PullRow,
  RepoRow,
  ReviewRow,
  RunRow,
  StartedRun,
} from '../src/ports.js';
import { createResolver, ResolveError } from '../src/resolve/refs.js';

class FakeApi implements DevDigestApi {
  readonly calls = {
    listAgents: 0,
    listRepos: 0,
    listPulls: 0,
    startReview: 0,
    listRuns: 0,
    listReviews: 0,
    getConventions: 0,
  };

  constructor(
    private readonly agents: AgentRow[] = [],
    private readonly repos: RepoRow[] = [],
    private readonly pulls: Record<string, PullRow[]> = {},
  ) {}

  async listAgents(): Promise<AgentRow[]> {
    this.calls.listAgents += 1;
    return this.agents;
  }

  async listRepos(): Promise<RepoRow[]> {
    this.calls.listRepos += 1;
    return this.repos;
  }

  async listPulls(repoId: string): Promise<PullRow[]> {
    this.calls.listPulls += 1;
    return this.pulls[repoId] ?? [];
  }

  async startReview(): Promise<StartedRun[]> {
    this.calls.startReview += 1;
    throw new Error('not implemented in fake');
  }

  async listRuns(): Promise<RunRow[]> {
    this.calls.listRuns += 1;
    return [];
  }

  async listReviews(): Promise<ReviewRow[]> {
    this.calls.listReviews += 1;
    return [];
  }

  async getConventions(): Promise<ConventionsRow> {
    this.calls.getConventions += 1;
    throw new Error('not implemented in fake');
  }
}

function clock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}

async function rejects(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

const repoUuid: RepoRow = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  owner: 'acme',
  name: 'other',
  full_name: 'acme/other',
};

const repoWithMatchingFullName: RepoRow = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  owner: 'acme',
  name: 'api',
  full_name: repoUuid.id,
};

describe('resolveRepo', () => {
  it('picks the repo whose id matches a uuid ref, even when another repo\'s full_name equals that same string', async () => {
    const api = new FakeApi([], [repoUuid, repoWithMatchingFullName]);
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: () => 0 });

    const repo = await resolver.resolveRepo(repoUuid.id);

    expect(repo).toEqual(repoUuid);
  });

  it('matches full_name and a bare repo name case-insensitively', async () => {
    const repos: RepoRow[] = [{ id: 'r1', owner: 'Acme', name: 'Api', full_name: 'Acme/Api' }];
    const api = new FakeApi([], repos);
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: () => 0 });

    await expect(resolver.resolveRepo('acme/API')).resolves.toEqual(repos[0]);
    await expect(resolver.resolveRepo('API')).resolves.toEqual(repos[0]);
  });

  it('throws repo_ambiguous carrying both candidates when a bare name matches two repos', async () => {
    const repoA: RepoRow = { id: 'r1', owner: 'acme', name: 'api', full_name: 'acme/api' };
    const repoB: RepoRow = { id: 'r2', owner: 'other', name: 'api', full_name: 'other/api' };
    const api = new FakeApi([], [repoA, repoB]);
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: () => 0 });

    const err = (await rejects(resolver.resolveRepo('api'))) as ResolveError;

    expect(err).toBeInstanceOf(ResolveError);
    expect(err.info.kind).toBe('repo_ambiguous');
    if (err.info.kind === 'repo_ambiguous') {
      expect(err.info.matches).toEqual([repoA, repoB]);
    }
  });

  it('throws repo_not_found carrying the known repo list, capped at 10', async () => {
    const repos: RepoRow[] = Array.from({ length: 15 }, (_, i) => ({
      id: `id-${i}`,
      owner: 'acme',
      name: `repo${i}`,
      full_name: `acme/repo${i}`,
    }));
    const api = new FakeApi([], repos);
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: () => 0 });

    const err = (await rejects(resolver.resolveRepo('nope'))) as ResolveError;

    expect(err).toBeInstanceOf(ResolveError);
    expect(err.info.kind).toBe('repo_not_found');
    if (err.info.kind === 'repo_not_found') {
      expect(err.info.known).toHaveLength(10);
      expect(err.info.known).toEqual(repos.slice(0, 10).map((repo) => repo.full_name));
    }
  });

  it('caches the repo list — repeated resolves call listRepos exactly once', async () => {
    const repos: RepoRow[] = [repoUuid];
    const api = new FakeApi([], repos);
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: () => 0 });

    await resolver.resolveRepo(repoUuid.id);
    await resolver.resolveRepo(repoUuid.full_name);
    await resolver.resolveRepo(repoUuid.name);

    expect(api.calls.listRepos).toBe(1);
  });
});

describe('resolvePr', () => {
  it('caches per repoId — three resolves within the TTL call listPulls once; a fourth call after the TTL passes fetches again', async () => {
    const repoId = 'repo-1';
    const pulls: PullRow[] = [{ id: 'pull-uuid', number: 42, title: 'x' }];
    const api = new FakeApi([], [], { [repoId]: pulls });
    const clk = clock(0);
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: clk.now });

    await resolver.resolvePr(repoId, 42);
    await resolver.resolvePr(repoId, 42);
    await resolver.resolvePr(repoId, 42);
    expect(api.calls.listPulls).toBe(1);

    clk.advance(60_000);
    await resolver.resolvePr(repoId, 42);
    expect(api.calls.listPulls).toBe(2);
  });

  it('throws pr_not_persisted, not pr_not_found, when the PR number exists but its id is null or missing', async () => {
    const repoId = 'repo-1';
    const pulls: PullRow[] = [
      { id: null, number: 7, title: 'null id' },
      { number: 8, title: 'missing id' },
    ];
    const api = new FakeApi([], [], { [repoId]: pulls });
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: () => 0 });

    const nullIdErr = (await rejects(resolver.resolvePr(repoId, 7))) as ResolveError;
    expect(nullIdErr).toBeInstanceOf(ResolveError);
    expect(nullIdErr.info.kind).toBe('pr_not_persisted');

    const missingIdErr = (await rejects(resolver.resolvePr(repoId, 8))) as ResolveError;
    expect(missingIdErr).toBeInstanceOf(ResolveError);
    expect(missingIdErr.info.kind).toBe('pr_not_persisted');
  });

  it('throws pr_not_found carrying the imported PR numbers when the number is unknown', async () => {
    const repoId = 'repo-1';
    const pulls: PullRow[] = [
      { id: 'a', number: 41, title: 'a' },
      { id: 'b', number: 42, title: 'b' },
    ];
    const api = new FakeApi([], [], { [repoId]: pulls });
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: () => 0 });

    const err = (await rejects(resolver.resolvePr(repoId, 99))) as ResolveError;

    expect(err).toBeInstanceOf(ResolveError);
    expect(err.info.kind).toBe('pr_not_found');
    if (err.info.kind === 'pr_not_found') {
      expect(err.info.imported).toEqual([41, 42]);
    }
  });
});

describe('resolveAgent', () => {
  it('throws agent_not_found with the closest name attached for a near miss, and no suggestion for a nonsense name', async () => {
    const agents: AgentRow[] = [
      { id: 'a1', name: 'Security', description: '', model: 'x', enabled: true },
      { id: 'a2', name: 'General Reviewer', description: '', model: 'x', enabled: true },
    ];
    const api = new FakeApi(agents, []);
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: () => 0 });

    const nearMiss = (await rejects(resolver.resolveAgent('secrity'))) as ResolveError;
    expect(nearMiss).toBeInstanceOf(ResolveError);
    expect(nearMiss.info.kind).toBe('agent_not_found');
    if (nearMiss.info.kind === 'agent_not_found') {
      expect(nearMiss.info.suggestion).toBe('Security');
    }

    const nonsense = (await rejects(resolver.resolveAgent('zzzzzzzzzz'))) as ResolveError;
    expect(nonsense).toBeInstanceOf(ResolveError);
    expect(nonsense.info.kind).toBe('agent_not_found');
    if (nonsense.info.kind === 'agent_not_found') {
      expect(nonsense.info.suggestion).toBeUndefined();
    }
  });
});

describe('propagation of API failures', () => {
  it('propagates a rejected API call untouched rather than wrapping it in a ResolveError', async () => {
    const apiError = new ApiError({ kind: 'unreachable', method: 'GET', path: '/repos' });
    const api: DevDigestApi = {
      listAgents: async () => [],
      listRepos: async () => {
        throw apiError;
      },
      listPulls: async () => [],
      startReview: async () => {
        throw new Error('unused');
      },
      listRuns: async () => [],
      listReviews: async () => [],
      getConventions: async () => {
        throw new Error('unused');
      },
    };
    const resolver = createResolver({ api, cacheTtlMs: 60_000, now: () => 0 });

    const err = await rejects(resolver.resolveRepo('acme/api'));

    expect(err).toBe(apiError);
    expect(err).not.toBeInstanceOf(ResolveError);
  });
});
