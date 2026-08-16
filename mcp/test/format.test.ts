import { describe, expect, it } from 'vitest';
import type { Severity } from '@devdigest/shared';
import {
  capPayload,
  toAgentsPayload,
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
  it('accepts the stub payload, stripping the unknown repo/pr keys BlastRadius never declared', () => {
    const stub = {
      repo: 'acme/api',
      pr: 42,
      changed_symbols: [],
      downstream: [],
      summary: '',
      degraded: true,
      reason: 'not_implemented',
    };

    const parsed = BlastRadiusResult.parse(stub);

    expect(parsed).toEqual({
      changed_symbols: [],
      downstream: [],
      summary: '',
      degraded: true,
      reason: 'not_implemented',
    });
    expect(parsed).not.toHaveProperty('repo');
    expect(parsed).not.toHaveProperty('pr');
  });
});
