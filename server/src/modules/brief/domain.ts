import { z } from 'zod';
import {
  RiskSeverity,
  Severity,
  MergeRisk,
  type SmartDiffRole,
  type DiffHunk,
  type UnifiedDiff,
} from '@devdigest/shared';
import {
  MAX_FILE_SUMMARY_CHARS,
  MAX_FOCUS_REASON_CHARS,
  MAX_RISK_EXPLANATION_CHARS,
  MAX_RISK_TITLE_CHARS,
  MAX_SUMMARY_CHARS,
} from './constants.js';

export const GeneratedRisk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type GeneratedRisk = z.infer<typeof GeneratedRisk>;

export const GeneratedReviewFocusRow = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  reason: z.string(),
});
export type GeneratedReviewFocusRow = z.infer<typeof GeneratedReviewFocusRow>;

export const GeneratedFileSummary = z.object({
  path: z.string(),
  summary: z.string(),
});
export type GeneratedFileSummary = z.infer<typeof GeneratedFileSummary>;

export const GeneratedBrief = z.object({
  summary: z.string(),
  risks: z.array(GeneratedRisk),
  review_focus: z.array(GeneratedReviewFocusRow),
  file_summaries: z.array(GeneratedFileSummary),
});
export type GeneratedBrief = z.infer<typeof GeneratedBrief>;

export interface ParsedFileRef {
  path: string;
  startLine?: number;
  endLine?: number;
}

const FILE_REF_PATTERN = /^([^:]+)(?::(\d+)(?:-(\d+))?)?$/;

export function parseFileRef(ref: string): ParsedFileRef | null {
  if (typeof ref !== 'string' || ref.length === 0) return null;
  const match = FILE_REF_PATTERN.exec(ref);
  if (!match) return null;
  const path = match[1];
  if (!path) return null;
  const startStr = match[2];
  const endStr = match[3];
  if (startStr === undefined) return { path };
  const startLine = Number(startStr);
  if (endStr === undefined) return { path, startLine };
  const endLine = Number(endStr);
  if (endLine < startLine) return null;
  return { path, startLine, endLine };
}

export interface GroundFileRefsResult {
  risks: GeneratedRisk[];
  droppedRefCount: number;
}

export function groundFileRefs(
  risks: readonly GeneratedRisk[],
  allowedPaths: ReadonlySet<string>,
): GroundFileRefsResult {
  let droppedRefCount = 0;
  const grounded = risks.map((risk) => {
    const survivors: string[] = [];
    for (const ref of risk.file_refs) {
      const parsed = parseFileRef(ref);
      if (parsed !== null && allowedPaths.has(parsed.path)) {
        survivors.push(ref);
      } else {
        droppedRefCount += 1;
      }
    }
    return { ...risk, file_refs: survivors };
  });
  return { risks: grounded, droppedRefCount };
}

export interface DropRisksWithoutRefsResult {
  risks: GeneratedRisk[];
  droppedCount: number;
}

export function dropRisksWithoutRefs(risks: readonly GeneratedRisk[]): DropRisksWithoutRefsResult {
  const survivors = risks.filter((risk) => risk.file_refs.length > 0);
  return { risks: survivors, droppedCount: risks.length - survivors.length };
}

const RISK_SEVERITY_RANK: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

export interface CapRisksResult {
  risks: GeneratedRisk[];
  droppedCount: number;
}

function bySeverityDescendingStableOnGenerationOrder(
  risks: readonly GeneratedRisk[],
): GeneratedRisk[] {
  return [...risks].sort(
    (a, b) => RISK_SEVERITY_RANK[a.severity] - RISK_SEVERITY_RANK[b.severity],
  );
}

export function capRisks(
  risks: readonly GeneratedRisk[],
  maxRisks: number,
  maxRefsPerRisk: number,
): CapRisksResult {
  const ordered = bySeverityDescendingStableOnGenerationOrder(risks);
  const kept = ordered.slice(0, maxRisks).map((risk) => ({
    ...risk,
    file_refs: risk.file_refs.slice(0, maxRefsPerRisk),
  }));
  return { risks: kept, droppedCount: Math.max(0, risks.length - kept.length) };
}

function truncateString(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export interface TruncateStringsInput {
  summary: string;
  risks: readonly GeneratedRisk[];
  reviewFocus: readonly GeneratedReviewFocusRow[];
  fileSummaries: readonly GeneratedFileSummary[];
}

export interface TruncateStringsResult {
  summary: string;
  risks: GeneratedRisk[];
  reviewFocus: GeneratedReviewFocusRow[];
  fileSummaries: GeneratedFileSummary[];
}

export function truncateStrings(input: TruncateStringsInput): TruncateStringsResult {
  return {
    summary: truncateString(input.summary, MAX_SUMMARY_CHARS),
    risks: input.risks.map((risk) => ({
      ...risk,
      title: truncateString(risk.title, MAX_RISK_TITLE_CHARS),
      explanation: truncateString(risk.explanation, MAX_RISK_EXPLANATION_CHARS),
    })),
    reviewFocus: input.reviewFocus.map((row) => ({
      ...row,
      reason: truncateString(row.reason, MAX_FOCUS_REASON_CHARS),
    })),
    fileSummaries: input.fileSummaries.map((fileSummary) => ({
      ...fileSummary,
      summary: truncateString(fileSummary.summary, MAX_FILE_SUMMARY_CHARS),
    })),
  };
}

function buildLineIndex(diff: UnifiedDiff): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  for (const file of diff.files) {
    const lines = new Set<number>();
    for (const hunk of file.hunks as DiffHunk[]) {
      if (hunk.newLineNumbers && hunk.newLineNumbers.length > 0) {
        for (const line of hunk.newLineNumbers) lines.add(line);
      } else {
        for (let line = hunk.newStart; line < hunk.newStart + Math.max(hunk.newLines, 1); line++) {
          lines.add(line);
        }
      }
    }
    index.set(file.path, lines);
  }
  return index;
}

function rangeIntersects(lines: ReadonlySet<number>, start: number, end: number): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let line = lo; line <= hi; line++) {
    if (lines.has(line)) return true;
  }
  return false;
}

export interface GroundFocusRowsResult {
  rows: GeneratedReviewFocusRow[];
  droppedCount: number;
}

export function groundFocusRows(
  rows: readonly GeneratedReviewFocusRow[],
  diff: UnifiedDiff,
): GroundFocusRowsResult {
  const lineIndex = buildLineIndex(diff);
  const survivors: GeneratedReviewFocusRow[] = [];
  let droppedCount = 0;
  for (const row of rows) {
    const lines = lineIndex.get(row.file);
    if (lines && rangeIntersects(lines, row.start_line, row.end_line)) {
      survivors.push(row);
    } else {
      droppedCount += 1;
    }
  }
  return { rows: survivors, droppedCount };
}

const FOCUS_SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
const NO_FINDING_RANK = 3;

export function orderFocusRows(
  rows: readonly GeneratedReviewFocusRow[],
  findingSeverityForRow: (row: GeneratedReviewFocusRow) => Severity | undefined,
): GeneratedReviewFocusRow[] {
  const rankOf = (row: GeneratedReviewFocusRow): number => {
    const severity = findingSeverityForRow(row);
    return severity ? FOCUS_SEVERITY_RANK[severity] : NO_FINDING_RANK;
  };
  return [...rows].sort((a, b) => {
    const rankDiff = rankOf(a) - rankOf(b);
    if (rankDiff !== 0) return rankDiff;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.start_line - b.start_line;
  });
}

export interface CapFocusRowsResult {
  rows: GeneratedReviewFocusRow[];
  droppedCount: number;
}

export function capFocusRows(
  rows: readonly GeneratedReviewFocusRow[],
  max: number,
): CapFocusRowsResult {
  const kept = rows.slice(0, max);
  return { rows: kept, droppedCount: Math.max(0, rows.length - kept.length) };
}

export function deriveMergeRisk(survivingRisks: readonly { severity: RiskSeverity }[]): MergeRisk {
  if (survivingRisks.some((risk) => risk.severity === 'high')) return 'high';
  if (survivingRisks.some((risk) => risk.severity === 'medium')) return 'medium';
  return 'low';
}

export function selectFileSummaries(
  fileSummaries: readonly GeneratedFileSummary[],
  roleByPath: ReadonlyMap<string, SmartDiffRole>,
): GeneratedFileSummary[] {
  return fileSummaries.filter((fileSummary) => {
    const role = roleByPath.get(fileSummary.path);
    return role === 'core' || role === 'wiring';
  });
}
