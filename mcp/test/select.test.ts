import { describe, expect, it } from 'vitest';
import type { Severity } from '@devdigest/shared';
import {
  atOrAboveSeverity,
  closestName,
  latestRun,
  matchAgent,
  matchRepo,
  pickRun,
  selectFindings,
  sortFindings,
  type RepoLike,
  type RunLike,
} from '../src/domain/select.js';

const repoA: RepoLike = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  owner: 'acme',
  name: 'other',
  full_name: 'acme/other',
};

const repoB: RepoLike = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  owner: 'acme',
  name: 'api',
  full_name: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
};

const repoC: RepoLike = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  owner: 'other',
  name: 'api',
  full_name: 'other/api',
};

describe('matchRepo', () => {
  it('prefers an exact uuid id match over a repo whose full_name equals that same string', () => {
    const result = matchRepo([repoA, repoB], repoA.id);
    expect(result).toEqual({ kind: 'one', repo: repoA });
  });

  it('matches full_name case-insensitively', () => {
    const repos: RepoLike[] = [
      { id: 'x', owner: 'Acme', name: 'Api', full_name: 'Acme/Api' },
    ];
    const result = matchRepo(repos, 'acme/API');
    expect(result).toEqual({ kind: 'one', repo: repos[0] });
  });

  it('falls back to a bare, case-insensitive repo name', () => {
    const repos: RepoLike[] = [repoA];
    const result = matchRepo(repos, 'OTHER');
    expect(result).toEqual({ kind: 'one', repo: repoA });
  });

  it('returns ambiguous, listing all matches, when two repos share a bare name', () => {
    const result = matchRepo([repoB, repoC], 'api');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.matches).toEqual([repoB, repoC]);
    }
  });

  it.each([['   '], ['']])('returns none for a whitespace/empty ref %j', (ref) => {
    expect(matchRepo([repoA, repoB, repoC], ref)).toEqual({ kind: 'none' });
  });

  it('trims surrounding whitespace before matching', () => {
    const result = matchRepo([repoA], `  ${repoA.full_name}  `);
    expect(result).toEqual({ kind: 'one', repo: repoA });
  });

  it('returns none when nothing matches', () => {
    expect(matchRepo([repoA, repoB], 'nope/nope')).toEqual({ kind: 'none' });
  });
});

const runningRun: RunLike = { run_id: 'r1', status: 'running', ran_at: '2026-08-01T00:00:00Z' };
const doneOld: RunLike = { run_id: 'r2', status: 'done', ran_at: '2026-08-02T00:00:00Z' };
const doneNew: RunLike = { run_id: 'r3', status: 'done', ran_at: '2026-08-05T00:00:00Z' };

describe('pickRun', () => {
  it('returns the exact named run regardless of status, including running', () => {
    const runs = [runningRun, doneOld, doneNew];
    expect(pickRun(runs, 'r1')).toBe(runningRun);
  });

  it('returns undefined for an unknown run id', () => {
    expect(pickRun([runningRun, doneOld], 'missing')).toBeUndefined();
  });

  it('without a run id, skips a running run and returns the newest done run', () => {
    const runs = [doneOld, runningRun, doneNew];
    expect(pickRun(runs)).toBe(doneNew);
  });

  it('sorts by ran_at itself rather than trusting caller ordering (fed oldest-first)', () => {
    const oldestFirst = [doneOld, doneNew];
    expect(pickRun(oldestFirst)).toBe(doneNew);
  });

  it('differs from latestRun when the only run is failed', () => {
    const failedOnly: RunLike[] = [{ run_id: 'f1', status: 'failed', ran_at: '2026-08-01T00:00:00Z' }];
    expect(pickRun(failedOnly)).toBeUndefined();
    expect(latestRun(failedOnly)).toEqual(failedOnly[0]);
  });
});

describe('latestRun', () => {
  it('returns the newest run of any status, sorted itself regardless of input order', () => {
    const oldestFirst = [doneOld, runningRun, doneNew];
    expect(latestRun(oldestFirst)).toBe(doneNew);
  });
});

const severities: Severity[] = ['CRITICAL', 'WARNING', 'SUGGESTION'];

describe('atOrAboveSeverity', () => {
  const expected: Record<Severity, Record<Severity, boolean>> = {
    CRITICAL: { CRITICAL: true, WARNING: true, SUGGESTION: true },
    WARNING: { CRITICAL: false, WARNING: true, SUGGESTION: true },
    SUGGESTION: { CRITICAL: false, WARNING: false, SUGGESTION: true },
  };

  for (const severity of severities) {
    for (const min of severities) {
      it(`${severity} at-or-above ${min} is ${expected[severity][min]}`, () => {
        expect(atOrAboveSeverity(severity, min)).toBe(expected[severity][min]);
      });
    }
  }
});

describe('sortFindings', () => {
  it('orders CRITICAL, then WARNING, then SUGGESTION', () => {
    const findings = [
      { severity: 'SUGGESTION' as Severity, tag: 's1' },
      { severity: 'CRITICAL' as Severity, tag: 'c1' },
      { severity: 'WARNING' as Severity, tag: 'w1' },
    ];
    expect(sortFindings(findings).map((f) => f.severity)).toEqual([
      'CRITICAL',
      'WARNING',
      'SUGGESTION',
    ]);
  });

  it('is stable: findings sharing a severity keep the engine order Node guarantees', () => {
    const findings = [
      { severity: 'WARNING' as Severity, order: 0 },
      { severity: 'CRITICAL' as Severity, order: 1 },
      { severity: 'WARNING' as Severity, order: 2 },
      { severity: 'SUGGESTION' as Severity, order: 3 },
      { severity: 'WARNING' as Severity, order: 4 },
      { severity: 'CRITICAL' as Severity, order: 5 },
    ];
    const sorted = sortFindings(findings);
    const warningOrders = sorted.filter((f) => f.severity === 'WARNING').map((f) => f.order);
    const criticalOrders = sorted.filter((f) => f.severity === 'CRITICAL').map((f) => f.order);
    expect(warningOrders).toEqual([0, 2, 4]);
    expect(criticalOrders).toEqual([1, 5]);
  });
});

describe('selectFindings', () => {
  const findings = [
    { severity: 'SUGGESTION' as Severity, id: 'a' },
    { severity: 'CRITICAL' as Severity, id: 'b' },
    { severity: 'WARNING' as Severity, id: 'c' },
    { severity: 'CRITICAL' as Severity, id: 'd' },
    { severity: 'WARNING' as Severity, id: 'e' },
  ];

  it('reports shown and total without a filter, sliced to the limit', () => {
    const result = selectFindings(findings, { limit: 3 });
    expect(result.total).toBe(5);
    expect(result.shown.map((f) => f.id)).toEqual(['b', 'd', 'c']);
  });

  it('filters by min_severity before computing total, then sorts and slices', () => {
    const result = selectFindings(findings, { minSeverity: 'WARNING', limit: 10 });
    expect(result.total).toBe(4);
    expect(result.shown.map((f) => f.id)).toEqual(['b', 'd', 'c', 'e']);
  });

  it('applies a limit smaller than the filtered set', () => {
    const result = selectFindings(findings, { minSeverity: 'WARNING', limit: 1 });
    expect(result.total).toBe(4);
    expect(result.shown.map((f) => f.id)).toEqual(['b']);
  });
});

describe('matchAgent', () => {
  const agents = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Security' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'General Reviewer' },
  ];

  it('matches by uuid id', () => {
    expect(matchAgent(agents, agents[0]!.id)).toBe(agents[0]);
  });

  it('matches by case-insensitive name', () => {
    expect(matchAgent(agents, 'security')).toBe(agents[0]);
  });

  it('returns undefined when nothing matches', () => {
    expect(matchAgent(agents, 'nope')).toBeUndefined();
  });
});

describe('closestName', () => {
  const names = ['Security', 'General Reviewer', 'Performance'];

  it('finds the closest match for a small typo', () => {
    expect(closestName(names, 'secrity')).toBe('Security');
  });

  it('returns undefined for nonsense input with nothing close', () => {
    expect(closestName(names, 'zzzzzzzzzzqqqqqqqq')).toBeUndefined();
  });

  it('returns undefined for empty input or an empty candidate list', () => {
    expect(closestName(names, '')).toBeUndefined();
    expect(closestName(names, '   ')).toBeUndefined();
    expect(closestName([], 'security')).toBeUndefined();
  });

  it('never throws', () => {
    expect(() => closestName(names, '')).not.toThrow();
    expect(() => closestName([], 'x')).not.toThrow();
  });
});
