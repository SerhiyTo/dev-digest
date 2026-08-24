import { describe, it, expect } from 'vitest';
import type { UnifiedDiff, Severity } from '@devdigest/shared';
import {
  GeneratedBrief,
  capFocusRows,
  capRisks,
  deriveMergeRisk,
  dropRisksWithoutRefs,
  groundFileRefs,
  groundFocusRows,
  orderFocusRows,
  parseFileRef,
  selectFileSummaries,
  truncateStrings,
  type GeneratedFileSummary,
  type GeneratedReviewFocusRow,
  type GeneratedRisk,
} from '../src/modules/brief/domain.js';
import {
  MAX_FILE_SUMMARY_CHARS,
  MAX_FOCUS_REASON_CHARS,
  MAX_FOCUS_ROWS,
  MAX_REFS_PER_RISK,
  MAX_RISKS,
  MAX_RISK_EXPLANATION_CHARS,
  MAX_RISK_TITLE_CHARS,
  MAX_SUMMARY_CHARS,
} from '../src/modules/brief/constants.js';

function risk(overrides: Partial<GeneratedRisk> = {}): GeneratedRisk {
  return {
    kind: 'data-loss',
    title: 'Possible data loss',
    explanation: 'Explanation',
    severity: 'medium',
    file_refs: ['src/a.ts'],
    ...overrides,
  };
}

function focusRow(overrides: Partial<GeneratedReviewFocusRow> = {}): GeneratedReviewFocusRow {
  return {
    file: 'src/a.ts',
    start_line: 5,
    end_line: 8,
    reason: 'Look here',
    ...overrides,
  };
}

function diffWithHunk(file: string, newLineNumbers: number[]): UnifiedDiff {
  return {
    raw: '',
    files: [
      {
        path: file,
        additions: newLineNumbers.length,
        deletions: 0,
        hunks: [
          {
            file,
            oldStart: 1,
            oldLines: 1,
            newStart: newLineNumbers[0] ?? 1,
            newLines: newLineNumbers.length,
            newLineNumbers,
          },
        ],
      },
    ],
  };
}

describe('parseFileRef', () => {
  it('parses path, path:line and path:start-end', () => {
    expect(parseFileRef('src/a.ts')).toEqual({ path: 'src/a.ts' });
    expect(parseFileRef('src/a.ts:10')).toEqual({ path: 'src/a.ts', startLine: 10 });
    expect(parseFileRef('src/a.ts:10-20')).toEqual({ path: 'src/a.ts', startLine: 10, endLine: 20 });
  });

  it('rejects a malformed ref', () => {
    expect(parseFileRef('')).toBeNull();
    expect(parseFileRef('src/a.ts:10-5')).toBeNull();
    expect(parseFileRef('src/a.ts:abc')).toBeNull();
  });
});

describe('groundFileRefs (AC-12, AC-13, AC-14, AC-32)', () => {
  it('drops a ref whose path is outside the allowed set and counts it', () => {
    const allowed = new Set(['src/a.ts']);
    const result = groundFileRefs(
      [risk({ file_refs: ['src/a.ts:1-3', 'src/fabricated.ts'] })],
      allowed,
    );
    expect(result.risks[0]?.file_refs).toEqual(['src/a.ts:1-3']);
    expect(result.droppedRefCount).toBe(1);
  });

  it('drops a malformed ref the same way as an out-of-union one', () => {
    const allowed = new Set(['src/a.ts']);
    const result = groundFileRefs([risk({ file_refs: ['src/a.ts', 'not:a:valid:ref:'] })], allowed);
    expect(result.droppedRefCount).toBe(1);
  });

  it('a degraded result restricts refs to changed files only, rejecting a blast-only path', () => {
    const changedFilesOnly = new Set(['src/a.ts']);
    const result = groundFileRefs(
      [risk({ file_refs: ['src/a.ts', 'src/blast-only.ts'] })],
      changedFilesOnly,
    );
    expect(result.risks[0]?.file_refs).toEqual(['src/a.ts']);
    expect(result.droppedRefCount).toBe(1);
  });

  it('caps refs are unaffected here — grounding 30 refs on one risk keeps every valid one', () => {
    const paths = Array.from({ length: 30 }, (_, i) => `src/f${i}.ts`);
    const allowed = new Set(paths);
    const result = groundFileRefs([risk({ file_refs: paths })], allowed);
    expect(result.risks[0]?.file_refs).toHaveLength(30);
    expect(result.droppedRefCount).toBe(0);
  });
});

describe('dropRisksWithoutRefs (AC-15)', () => {
  it('drops a risk whose only ref was fabricated and grounded away', () => {
    const grounded = groundFileRefs([risk({ file_refs: ['src/fabricated.ts'] })], new Set(['src/a.ts']));
    const result = dropRisksWithoutRefs(grounded.risks);
    expect(result.risks).toEqual([]);
    expect(result.droppedCount).toBe(1);
  });

  it('keeps a risk that still has at least one grounded ref', () => {
    const result = dropRisksWithoutRefs([risk({ file_refs: ['src/a.ts'] })]);
    expect(result.risks).toHaveLength(1);
    expect(result.droppedCount).toBe(0);
  });
});

describe('capRisks (AC-16, AC-17)', () => {
  it('40 risks are capped to 12, severity descending then generation order', () => {
    const risks = Array.from({ length: 40 }, (_, i) =>
      risk({ title: `risk-${i}`, severity: i % 2 === 0 ? 'low' : 'high' }),
    );
    const result = capRisks(risks, MAX_RISKS, MAX_REFS_PER_RISK);
    expect(result.risks).toHaveLength(12);
    expect(result.droppedCount).toBe(28);
    expect(result.risks.every((r) => r.severity === 'high')).toBe(true);
    expect(result.risks.map((r) => r.title)).toEqual(
      risks.filter((r) => r.severity === 'high').slice(0, 12).map((r) => r.title),
    );
  });

  it('caps file_refs per risk to 5', () => {
    const refs = Array.from({ length: 8 }, (_, i) => `src/f${i}.ts`);
    const result = capRisks([risk({ file_refs: refs })], MAX_RISKS, MAX_REFS_PER_RISK);
    expect(result.risks[0]?.file_refs).toHaveLength(5);
  });

  it('breaks severity ties by generation order', () => {
    const risks = [risk({ title: 'first', severity: 'medium' }), risk({ title: 'second', severity: 'medium' })];
    const result = capRisks(risks, 10, 5);
    expect(result.risks.map((r) => r.title)).toEqual(['first', 'second']);
  });
});

describe('truncateStrings (AC-2, AC-11, AC-23, AC-60)', () => {
  it('caps every string field to its own maximum', () => {
    const result = truncateStrings({
      summary: 'x'.repeat(MAX_SUMMARY_CHARS + 50),
      risks: [
        risk({
          title: 'y'.repeat(MAX_RISK_TITLE_CHARS + 10),
          explanation: 'z'.repeat(MAX_RISK_EXPLANATION_CHARS + 10),
        }),
      ],
      reviewFocus: [focusRow({ reason: 'r'.repeat(MAX_FOCUS_REASON_CHARS + 10) })],
      fileSummaries: [{ path: 'src/a.ts', summary: 's'.repeat(MAX_FILE_SUMMARY_CHARS + 10) }],
    });
    expect(result.summary).toHaveLength(MAX_SUMMARY_CHARS);
    expect(result.risks[0]?.title).toHaveLength(MAX_RISK_TITLE_CHARS);
    expect(result.risks[0]?.explanation).toHaveLength(MAX_RISK_EXPLANATION_CHARS);
    expect(result.reviewFocus[0]?.reason).toHaveLength(MAX_FOCUS_REASON_CHARS);
    expect(result.fileSummaries[0]?.summary).toHaveLength(MAX_FILE_SUMMARY_CHARS);
  });

  it('leaves short strings untouched', () => {
    const result = truncateStrings({
      summary: 'short',
      risks: [risk({ title: 'short', explanation: 'short' })],
      reviewFocus: [focusRow({ reason: 'short' })],
      fileSummaries: [{ path: 'src/a.ts', summary: 'short' }],
    });
    expect(result.summary).toBe('short');
    expect(result.risks[0]?.title).toBe('short');
  });
});

describe('groundFocusRows (AC-24)', () => {
  it('drops a row outside every hunk', () => {
    const diff = diffWithHunk('src/a.ts', [10, 11, 12]);
    const result = groundFocusRows(
      [focusRow({ file: 'src/a.ts', start_line: 10, end_line: 11 }), focusRow({ file: 'src/a.ts', start_line: 100, end_line: 101 })],
      diff,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.start_line).toBe(10);
    expect(result.droppedCount).toBe(1);
  });

  it('drops a row whose file has no hunks at all', () => {
    const diff = diffWithHunk('src/a.ts', [10]);
    const result = groundFocusRows([focusRow({ file: 'src/other.ts', start_line: 1, end_line: 1 })], diff);
    expect(result.rows).toEqual([]);
    expect(result.droppedCount).toBe(1);
  });
});

describe('orderFocusRows (AC-26)', () => {
  it('orders CRITICAL, WARNING, SUGGESTION, no finding, then path, then start line', () => {
    const rows: GeneratedReviewFocusRow[] = [
      focusRow({ file: 'b.ts', start_line: 1, reason: 'no finding' }),
      focusRow({ file: 'a.ts', start_line: 5, reason: 'warning' }),
      focusRow({ file: 'a.ts', start_line: 2, reason: 'critical' }),
      focusRow({ file: 'a.ts', start_line: 10, reason: 'suggestion' }),
    ];
    const severityByReason: Record<string, Severity | undefined> = {
      warning: 'WARNING',
      critical: 'CRITICAL',
      suggestion: 'SUGGESTION',
    };
    const ordered = orderFocusRows(rows, (row) => severityByReason[row.reason]);
    expect(ordered.map((r) => r.reason)).toEqual(['critical', 'warning', 'suggestion', 'no finding']);
  });

  it('breaks ties within the same severity by path then start line', () => {
    const rows: GeneratedReviewFocusRow[] = [
      focusRow({ file: 'b.ts', start_line: 1 }),
      focusRow({ file: 'a.ts', start_line: 9 }),
      focusRow({ file: 'a.ts', start_line: 3 }),
    ];
    const ordered = orderFocusRows(rows, () => undefined);
    expect(ordered.map((r) => `${r.file}:${r.start_line}`)).toEqual(['a.ts:3', 'a.ts:9', 'b.ts:1']);
  });
});

describe('capFocusRows (AC-25)', () => {
  it('keeps at most `max` rows', () => {
    const rows = Array.from({ length: 9 }, (_, i) => focusRow({ start_line: i }));
    const result = capFocusRows(rows, MAX_FOCUS_ROWS);
    expect(result.rows).toHaveLength(5);
    expect(result.droppedCount).toBe(4);
  });
});

describe('deriveMergeRisk (AC-78, AC-79)', () => {
  it('falls from high to medium when grounding drops the only high risk', () => {
    const risks: GeneratedRisk[] = [
      risk({ severity: 'high', file_refs: ['src/fabricated.ts'] }),
      risk({ severity: 'medium', file_refs: ['src/a.ts'] }),
    ];
    const grounded = groundFileRefs(risks, new Set(['src/a.ts']));
    const survivors = dropRisksWithoutRefs(grounded.risks).risks;
    expect(deriveMergeRisk(survivors)).toBe('medium');
  });

  it('yields low when zero risks survive', () => {
    expect(deriveMergeRisk([])).toBe('low');
  });

  it('ignores a band the model may have tried to supply — GeneratedBrief has no such field', () => {
    const parsed = GeneratedBrief.safeParse({
      summary: 'ok',
      risks: [],
      review_focus: [],
      file_summaries: [],
      merge_risk: 'high',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && (parsed.data as Record<string, unknown>).merge_risk).toBeUndefined();
  });
});

describe('selectFileSummaries (AC-60, AC-61)', () => {
  it('keeps only core/wiring paths and drops boilerplate', () => {
    const summaries: GeneratedFileSummary[] = [
      { path: 'src/core.ts', summary: 'core' },
      { path: 'src/wiring.ts', summary: 'wiring' },
      { path: 'src/generated.lock', summary: 'boilerplate' },
      { path: 'src/unknown.ts', summary: 'unknown role' },
    ];
    const roleByPath = new Map<string, 'core' | 'wiring' | 'boilerplate'>([
      ['src/core.ts', 'core'],
      ['src/wiring.ts', 'wiring'],
      ['src/generated.lock', 'boilerplate'],
    ]);
    const result = selectFileSummaries(summaries, roleByPath);
    expect(result.map((s) => s.path)).toEqual(['src/core.ts', 'src/wiring.ts']);
  });
});
