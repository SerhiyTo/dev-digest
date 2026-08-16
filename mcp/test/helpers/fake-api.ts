import type {
  AgentRow,
  ConventionsRow,
  DevDigestApi,
  FindingRow,
  PullRow,
  RepoRow,
  ReviewRow,
  RunRow,
  StartedRun,
} from '../../src/ports.js';

export type FakeApiMethod =
  | 'listAgents'
  | 'listRepos'
  | 'listPulls'
  | 'startReview'
  | 'listRuns'
  | 'listReviews'
  | 'getConventions';

export type FakeApiCalls = Record<FakeApiMethod, number>;

export type RunBehavior =
  | { kind: 'done'; afterPolls: number }
  | { kind: 'failed'; afterPolls: number; status: 'failed' | 'cancelled'; error: string }
  | { kind: 'never' };

export interface ScriptRunOptions {
  agentId: string;
  agentName: string;
  runId?: string;
  behavior: RunBehavior;
}

interface RunEntry {
  run_id: string;
  agent_id: string;
  agent_name: string;
  behavior: RunBehavior;
  pollCount: number;
  started: boolean;
}

function emptyCalls(): FakeApiCalls {
  return {
    listAgents: 0,
    listRepos: 0,
    listPulls: 0,
    startReview: 0,
    listRuns: 0,
    listReviews: 0,
    getConventions: 0,
  };
}

let nextRunId = 1;

function computeRunRow(entry: RunEntry): RunRow {
  entry.pollCount += 1;
  const base = { run_id: entry.run_id, agent_id: entry.agent_id, agent_name: entry.agent_name };
  const behavior = entry.behavior;

  if (behavior.kind === 'never') {
    return { ...base, status: 'running', ran_at: null, error: null, score: null, findings_count: null };
  }

  if (behavior.kind === 'done') {
    const done = entry.pollCount >= behavior.afterPolls;
    return {
      ...base,
      status: done ? 'done' : 'running',
      ran_at: done ? new Date(0).toISOString() : null,
      error: null,
      score: null,
      findings_count: null,
    };
  }

  const failed = entry.pollCount >= behavior.afterPolls;
  return {
    ...base,
    status: failed ? behavior.status : 'running',
    ran_at: failed ? new Date(0).toISOString() : null,
    error: failed ? behavior.error : null,
    score: null,
    findings_count: null,
  };
}

export class FakeDevDigestApi implements DevDigestApi {
  readonly calls: FakeApiCalls = emptyCalls();

  private agents: AgentRow[] = [];
  private repos: RepoRow[] = [];
  private readonly pullsByRepo = new Map<string, PullRow[]>();
  private readonly conventionsByRepo = new Map<string, ConventionsRow>();
  private readonly runsByPr = new Map<string, RunEntry[]>();
  private readonly reviewsByPr = new Map<string, ReviewRow[]>();

  seedAgents(agents: readonly AgentRow[]): void {
    this.agents = [...agents];
  }

  seedRepos(repos: readonly RepoRow[]): void {
    this.repos = [...repos];
  }

  seedPulls(repoId: string, pulls: readonly PullRow[]): void {
    this.pullsByRepo.set(repoId, [...pulls]);
  }

  seedConventions(repoId: string, row: ConventionsRow): void {
    this.conventionsByRepo.set(repoId, row);
  }

  seedReview(prId: string, review: ReviewRow): void {
    const existing = this.reviewsByPr.get(prId) ?? [];
    existing.push(review);
    this.reviewsByPr.set(prId, existing);
  }

  scriptRun(prId: string, options: ScriptRunOptions): string {
    const runId = options.runId ?? `run-${nextRunId++}`;
    const entry: RunEntry = {
      run_id: runId,
      agent_id: options.agentId,
      agent_name: options.agentName,
      behavior: options.behavior,
      pollCount: 0,
      started: false,
    };
    const existing = this.runsByPr.get(prId) ?? [];
    existing.push(entry);
    this.runsByPr.set(prId, existing);
    return runId;
  }

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
    return this.pullsByRepo.get(repoId) ?? [];
  }

  async startReview(prId: string, agentId: string): Promise<StartedRun[]> {
    this.calls.startReview += 1;
    const entries = this.runsByPr.get(prId) ?? [];
    const entry = entries.find((candidate) => candidate.agent_id === agentId && !candidate.started);
    if (entry === undefined) return [];
    entry.started = true;
    return [{ run_id: entry.run_id, agent_id: entry.agent_id, agent_name: entry.agent_name }];
  }

  async listRuns(prId: string): Promise<RunRow[]> {
    this.calls.listRuns += 1;
    const entries = this.runsByPr.get(prId) ?? [];
    return entries.filter((entry) => entry.started).map((entry) => computeRunRow(entry));
  }

  async listReviews(prId: string): Promise<ReviewRow[]> {
    this.calls.listReviews += 1;
    return this.reviewsByPr.get(prId) ?? [];
  }

  async getConventions(repoId: string): Promise<ConventionsRow> {
    this.calls.getConventions += 1;
    const row = this.conventionsByRepo.get(repoId);
    if (row === undefined) {
      throw new Error(`fake-api: no conventions seeded for repo ${repoId}`);
    }
    return row;
  }
}

export function buildAgent(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'agent-security',
    name: 'Security',
    description: 'Finds security issues',
    model: 'claude-sonnet-5',
    enabled: true,
    ...overrides,
  };
}

export function buildRepo(overrides: Partial<RepoRow> = {}): RepoRow {
  return {
    id: 'repo-acme-api',
    owner: 'acme',
    name: 'api',
    full_name: 'acme/api',
    ...overrides,
  };
}

export function buildPull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pull-42',
    number: 42,
    title: 'Add rate limiting',
    ...overrides,
  };
}

export function buildFindingRow(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    severity: 'CRITICAL',
    category: 'bug',
    file: 'server/src/modules/reviews/service.ts',
    start_line: 135,
    end_line: 140,
    title: 'Background review crash is only logged, never surfaced',
    rationale: 'The catch block swallows the error without recording it.',
    suggestion: 'record the failure on the agent_runs row so the UI stops polling',
    ...overrides,
  };
}

export function buildManyFindings(
  count: number,
  overrides: (index: number) => Partial<FindingRow> = () => ({}),
): FindingRow[] {
  return Array.from({ length: count }, (_, index) => buildFindingRow(overrides(index)));
}

export function buildReview(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    id: 'review-1',
    run_id: 'run-1',
    agent_name: 'Security',
    verdict: 'request_changes',
    summary: 'Found issues',
    score: 38,
    grounding: null,
    created_at: new Date(0).toISOString(),
    findings: [buildFindingRow()],
    ...overrides,
  };
}

export function buildConventions(overrides: Partial<ConventionsRow> = {}): ConventionsRow {
  return {
    state: { status: 'done', last_scan_at: new Date(0).toISOString() },
    candidates: [],
    ...overrides,
  };
}
