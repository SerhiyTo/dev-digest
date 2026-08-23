import type { Finding, Severity } from '@devdigest/shared';

export type RepoLike = {
  id: string;
  owner: string;
  name: string;
  full_name: string;
};

export type RepoMatch =
  | { kind: 'one'; repo: RepoLike }
  | { kind: 'none' }
  | { kind: 'ambiguous'; matches: RepoLike[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function matchRepo(repos: readonly RepoLike[], ref: string): RepoMatch {
  const trimmed = ref.trim();
  if (trimmed === '') return { kind: 'none' };

  if (UUID_RE.test(trimmed)) {
    const byId = repos.find((repo) => repo.id === trimmed);
    if (byId) return { kind: 'one', repo: byId };
  }

  const lower = trimmed.toLowerCase();

  const byFullName = repos.find((repo) => repo.full_name.toLowerCase() === lower);
  if (byFullName) return { kind: 'one', repo: byFullName };

  const byName = repos.filter((repo) => repo.name.toLowerCase() === lower);
  if (byName.length === 1) {
    return { kind: 'one', repo: byName[0]! };
  }
  if (byName.length > 1) return { kind: 'ambiguous', matches: byName };

  return { kind: 'none' };
}

export type RunLike = {
  run_id: string;
  status: string | null;
  ran_at: string | null;
};

function compareRanAtDesc(a: RunLike, b: RunLike): number {
  if (a.ran_at === b.ran_at) return 0;
  if (a.ran_at === null) return 1;
  if (b.ran_at === null) return -1;
  return new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime();
}

function sortByRanAtDesc<T extends RunLike>(runs: readonly T[]): T[] {
  return [...runs].sort(compareRanAtDesc);
}

export function pickRun<T extends RunLike>(
  runs: readonly T[],
  runId?: string,
): T | undefined {
  if (runId !== undefined) {
    return runs.find((run) => run.run_id === runId);
  }
  const done = runs.filter((run) => run.status === 'done');
  return sortByRanAtDesc(done)[0];
}

export function latestRun<T extends RunLike>(runs: readonly T[]): T | undefined {
  return sortByRanAtDesc(runs)[0];
}

export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

export function atOrAboveSeverity(severity: Severity, min: Severity): boolean {
  return SEVERITY_RANK[severity] <= SEVERITY_RANK[min];
}

export function sortFindings<T extends Pick<Finding, 'severity'>>(
  findings: readonly T[],
): T[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export interface SelectFindingsOptions {
  minSeverity?: Severity;
  limit: number;
}

export interface SelectFindingsResult<T> {
  shown: T[];
  total: number;
}

export function selectFindings<T extends Pick<Finding, 'severity'>>(
  findings: readonly T[],
  options: SelectFindingsOptions,
): SelectFindingsResult<T> {
  const { minSeverity, limit } = options;
  const filtered =
    minSeverity === undefined
      ? [...findings]
      : findings.filter((finding) => atOrAboveSeverity(finding.severity, minSeverity));
  const sorted = sortFindings(filtered);
  return { shown: sorted.slice(0, limit), total: filtered.length };
}

export type AgentLike = {
  id: string;
  name: string;
};

export function matchAgent<T extends AgentLike>(
  agents: readonly T[],
  name: string,
): T | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return undefined;

  if (UUID_RE.test(trimmed)) {
    const byId = agents.find((agent) => agent.id === trimmed);
    if (byId) return byId;
  }

  const lower = trimmed.toLowerCase();
  return agents.find((agent) => agent.name.toLowerCase() === lower);
}

function levenshtein(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  let previous = new Array<number>(bLen + 1);
  let current = new Array<number>(bLen + 1);
  for (let j = 0; j <= bLen; j += 1) previous[j] = j;

  for (let i = 1; i <= aLen; i += 1) {
    current[0] = i;
    for (let j = 1; j <= bLen; j += 1) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[bLen] ?? 0;
}

export function closestName(
  candidates: readonly string[],
  input: string,
): string | undefined {
  const trimmed = input.trim();
  if (trimmed === '' || candidates.length === 0) return undefined;

  const lower = trimmed.toLowerCase();

  const exact = candidates.find((candidate) => candidate.toLowerCase() === lower);
  if (exact !== undefined) return exact;

  const substring = candidates.find((candidate) => {
    const candidateLower = candidate.toLowerCase();
    return candidateLower.includes(lower) || lower.includes(candidateLower);
  });
  if (substring !== undefined) return substring;

  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(lower, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  const threshold = Math.max(2, Math.ceil(lower.length / 3));
  return best !== undefined && bestDistance <= threshold ? best : undefined;
}
