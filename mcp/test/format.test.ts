import { describe, expect, it } from 'vitest';
import type { Severity } from '@devdigest/shared';
import {
  capPayload,
  toAgentsPayload,
  toBlastPayload,
  toConventionsPayload,
  toFindingsPayload,
} from '../src/format/compact.js';
import { MAX_PAYLOAD_CHARS } from '../src/constants.js';
import type { AgentRow, ConventionsRow, FindingRow } from '../src/ports.js';
import { BlastRadiusResult } from '../src/blast/contract.js';

function buildFinding(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    severity: 'CRITICAL' as Severity,
    category: 'bug' as FindingRow['category'],
    file: 'server/src/modules/reviews/service.ts',
    start_line: 135,
    end_line: 140,
    title: 'Background review crash is only logged, never surfaced',
    rationale: 'The catch block swallows the error without recording it.',
    suggestion: 'record the failure on the agent_runs row so the UI stops polling',
    ...overrides,
  };
}

describe('toFindingsPayload', () => {
  it('projects exactly severity, file, line, title, fix and drops everything else', () => {
    const finding = {
      ...buildFinding(),
      id: 'finding-1',
      kind: 'bug',
      evidence: ['server/src/modules/reviews/service.ts:135'],
      review_id: 'review-1',
      accepted_at: null,
      dismissed_at: null,
    };

    const [item] = toFindingsPayload([finding]);

    expect(item).toEqual({
      severity: 'CRITICAL',
      file: 'server/src/modules/reviews/service.ts',
      line: 135,
      title: 'Background review crash is only logged, never surfaced',
      fix: 'record the failure on the agent_runs row so the UI stops polling',
    });
    expect(Object.keys(item!)).toEqual(['severity', 'file', 'line', 'title', 'fix']);
  });

  it('maps a missing suggestion to a null fix rather than dropping the field', () => {
    const finding = buildFinding({ suggestion: null });
    const [item] = toFindingsPayload([finding]);
    expect(item!.fix).toBeNull();
  });

  it('strips control characters and ANSI escapes from a hostile title', () => {
    const finding = buildFinding({
      title: `Rename \x1b[31mthis\x1b[0m variable\x07\x00 now`,
      file: `evil\x1b[2Jfile.ts`,
    });

    const [item] = toFindingsPayload([finding]);

    expect(item!.title).toBe('Rename [31mthis[0m variable now');
    expect(item!.file).toBe('evil[2Jfile.ts');
    // eslint-disable-next-line no-control-regex
    expect(/[\x00-\x1f\x7f]/.test(item!.title)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[\x00-\x1f\x7f]/.test(item!.file)).toBe(false);
  });

  it('truncates an oversized title field', () => {
    const finding = buildFinding({ title: 'x'.repeat(10_000) });
    const [item] = toFindingsPayload([finding]);
    expect(item!.title.length).toBeLessThanOrEqual(500);
  });
});

describe('toAgentsPayload', () => {
  it('caps description at 80 chars and sanitises control characters', () => {
    const agent: AgentRow = {
      id: 'agent-1',
      name: 'Security',
      description: `${'a'.repeat(90)}\x1b[31m`,
      model: 'claude-sonnet-5',
      enabled: true,
    };

    const payload = toAgentsPayload([agent]);

    expect(payload.agents[0]!.description.length).toBeLessThanOrEqual(80);
    // eslint-disable-next-line no-control-regex
    expect(/[\x00-\x1f\x7f]/.test(payload.agents[0]!.description)).toBe(false);
  });
});

describe('toConventionsPayload', () => {
  it('projects state and candidates, formatting evidence as path:line', () => {
    const row: ConventionsRow = {
      state: { status: 'done', last_scan_at: '2026-08-11T09:12:03Z' },
      candidates: [
        {
          id: 'c1',
          rule: 'Relative ESM imports carry the .js suffix',
          confidence: 0.94,
          status: 'accepted',
          occurrence_files: 230,
          evidence: [{ path: 'server/src/app.ts', start_line: 12, end_line: 14 }],
        },
      ],
    };

    const payload = toConventionsPayload(row);

    expect(payload).toEqual({
      status: 'done',
      scanned_at: '2026-08-11T09:12:03Z',
      conventions: [
        {
          rule: 'Relative ESM imports carry the .js suffix',
          confidence: 0.94,
          status: 'accepted',
          occurrence_files: 230,
          evidence: ['server/src/app.ts:12-14'],
        },
      ],
    });
  });

  it('formats a single-line evidence span without a range', () => {
    const row: ConventionsRow = {
      state: { status: 'never' },
      candidates: [
        {
          id: 'c1',
          rule: 'x',
          confidence: 0.5,
          status: 'accepted',
          evidence: [{ path: 'a.ts', start_line: 3, end_line: 3 }],
        },
      ],
    };

    const payload = toConventionsPayload(row);
    expect(payload.scanned_at).toBeNull();
    expect(payload.conventions[0]!.evidence).toEqual(['a.ts:3']);
    expect(payload.conventions[0]!.occurrence_files).toBeNull();
  });
});

describe('capPayload', () => {
  it('returns a payload under the cap byte-identical, without a truncated note', () => {
    const value = { agents: [{ name: 'Security', model: 'x', enabled: true, description: 'd' }] };
    const capped = capPayload(value);
    expect(capped).toBe(JSON.stringify(value));
    expect(JSON.parse(capped)).not.toHaveProperty('truncated');
  });

  it('caps a 200-finding payload to at most MAX_PAYLOAD_CHARS while staying valid JSON', () => {
    const findings = Array.from({ length: 200 }, (_, i) =>
      buildFinding({ title: `Finding number ${i} with a moderately long descriptive title` }),
    );
    const projected = toFindingsPayload(findings);
    const value = { findings: projected };

    const capped = capPayload(value);

    expect(capped.length).toBeLessThanOrEqual(MAX_PAYLOAD_CHARS);
    expect(() => JSON.parse(capped)).not.toThrow();

    const parsed = JSON.parse(capped) as {
      findings: unknown[];
      truncated: { shown: number; total: number; narrow_with: string[] };
    };
    expect(parsed.truncated.total).toBe(200);
    expect(parsed.truncated.shown).toBe(parsed.findings.length);
    expect(parsed.truncated.shown).toBeLessThan(200);
    expect(parsed.truncated.narrow_with).toEqual(['min_severity', 'limit']);
  });

  it('never emits a half-written or unparseable JSON string, at any array size', () => {
    for (const size of [0, 1, 2, 37, 199, 200, 500]) {
      const findings = Array.from({ length: size }, (_, i) =>
        buildFinding({ title: `Finding ${i}` }),
      );
      const capped = capPayload({ findings: toFindingsPayload(findings) });
      expect(() => JSON.parse(capped)).not.toThrow();
    }
  });
});

describe('BlastRadiusResult', () => {
  it('accepts a realistic body, stripping repo/pr/history/roll-ups/truncated that BlastRadius never declared', () => {
    const changed_symbols = [
      { name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' },
    ];
    const downstream = [
      {
        symbol: 'rateLimit',
        callers: [{ name: 'registerRoutes', file: 'src/api/public/index.ts', line: 23 }],
        endpoints_affected: ['GET /api/public/items'],
        crons_affected: ['reset-rate-buckets'],
      },
    ];
    const summary = '1 changed symbol, 1 caller across 1 file, 1 endpoint, 1 cron job.';

    const body = {
      repo: 'acme/payments-api',
      pr: 482,
      changed_symbols,
      downstream,
      summary,
      endpoints_affected: ['GET /api/public/items'],
      crons_affected: ['reset-rate-buckets'],
      history: [
        {
          pr_number: 415,
          title: 'Tune rate limit buckets',
          merged_at: '2026-07-04T16:30:00.000Z',
          author: 'diego.reyes',
          files_overlap: ['src/config.ts', 'src/middleware/ratelimit.ts'],
          notes: 'merged',
        },
      ],
      truncated: false,
      degraded: false,
      reason: '',
    };

    const parsed = BlastRadiusResult.parse(body);

    expect(parsed).toEqual({
      changed_symbols,
      downstream,
      summary,
      degraded: false,
      reason: '',
    });
    expect(parsed).not.toHaveProperty('repo');
    expect(parsed).not.toHaveProperty('pr');
    expect(parsed).not.toHaveProperty('history');
    expect(parsed).not.toHaveProperty('endpoints_affected');
    expect(parsed).not.toHaveProperty('crons_affected');
    expect(parsed).not.toHaveProperty('truncated');
  });
});

describe('toBlastPayload', () => {
  it('pre-caps at 10 symbols and 5 callers per symbol, staying valid JSON after capPayload', () => {
    const changed_symbols = Array.from({ length: 25 }, (_, i) => ({
      name: `symbol${i}`,
      file: `src/file${i}.ts`,
      kind: 'function',
    }));
    const downstream = Array.from({ length: 25 }, (_, i) => ({
      symbol: `symbol${i}`,
      callers: Array.from({ length: 20 }, (_, j) => ({
        name: `caller${j}`,
        file: `src/caller${j}.ts`,
        line: j,
      })),
      endpoints_affected: [] as string[],
      crons_affected: [] as string[],
    }));

    const payload = toBlastPayload({
      repo: 'acme/payments-api',
      pr: 482,
      changed_symbols,
      downstream,
      summary: '25 changed symbols, 20 callers across 20 files, 0 endpoints, 0 cron jobs.',
      endpoints_affected: [],
      crons_affected: [],
      history: [],
      truncated: true,
      degraded: false,
      reason: '',
    });

    const shownSymbols = payload['changed_symbols'] as unknown[];
    expect(shownSymbols.length).toBeLessThanOrEqual(10);

    const shownDownstream = payload['downstream'] as Array<{ callers: unknown[] }>;
    expect(shownDownstream.length).toBeLessThanOrEqual(10);
    for (const entry of shownDownstream) {
      expect(entry.callers.length).toBeLessThanOrEqual(5);
    }

    const capped = capPayload(payload);
    expect(() => JSON.parse(capped)).not.toThrow();
  });
});
