import type { ProposedSplit, SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_FILENAMES,
  BOILERPLATE_SEGMENTS,
  BOILERPLATE_SUFFIXES,
  MAX_FINDING_LINE_SPAN,
  MAX_PROPOSED_SPLITS,
  MIN_FILES_PER_SPLIT,
  MIN_SPLITS_TO_SUGGEST,
  ROLE_ORDER,
  SEVERITY_WEIGHT,
  SPLIT_KEY_SEGMENTS,
  SPLIT_ROOT_KEY,
  TEST_SEGMENTS,
  TEST_SUFFIXES,
  TOO_BIG_CORE_FILES,
  TOO_BIG_REVIEWABLE_LINES,
  WIRING_FILENAMES,
  WIRING_SEGMENTS,
  WIRING_SUFFIXES,
} from './constants.js';
import type { SmartDiffFileRow, SmartDiffFindingRow } from './ports.js';

export interface ClassifiedFile {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
  isTest: boolean;
  findingWeight: number;
  findingLines: number[];
}

export interface SmartDiffSplit {
  too_big: boolean;
  total_lines: number;
  proposed_splits: ProposedSplit[];
}

export interface SmartDiffModelStats {
  totalLines: number;
  reviewableLines: number;
  findingFiles: number;
  findingLines: number;
  duplicatePaths: string[];
  orphanFiles: string[];
  clampedFindings: number;
}

export interface SmartDiffModel {
  groups: { role: SmartDiffRole; files: ClassifiedFile[] }[];
  split: SmartDiffSplit;
  stats: SmartDiffModelStats;
}

const BOILERPLATE_FILENAME_SET: ReadonlySet<string> = new Set(BOILERPLATE_FILENAMES);
const BOILERPLATE_SEGMENT_SET: ReadonlySet<string> = new Set(BOILERPLATE_SEGMENTS);
const WIRING_FILENAME_SET: ReadonlySet<string> = new Set(WIRING_FILENAMES);
const WIRING_SEGMENT_SET: ReadonlySet<string> = new Set(WIRING_SEGMENTS);
const TEST_SEGMENT_SET: ReadonlySet<string> = new Set(TEST_SEGMENTS);

export function normalizePath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();
}

function basenameOf(normalized: string): string {
  const cut = normalized.lastIndexOf('/');
  return cut === -1 ? normalized : normalized.slice(cut + 1);
}

function hasSegment(normalized: string, segments: ReadonlySet<string>): boolean {
  for (const segment of normalized.split('/')) {
    if (segments.has(segment)) return true;
  }
  return false;
}

function endsWithAny(normalized: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => normalized.endsWith(suffix));
}

export function classifyPath(rawPath: string): SmartDiffRole {
  const normalized = normalizePath(rawPath);
  const basename = basenameOf(normalized);

  if (BOILERPLATE_FILENAME_SET.has(basename)) return 'boilerplate';
  if (hasSegment(normalized, BOILERPLATE_SEGMENT_SET)) return 'boilerplate';
  if (endsWithAny(normalized, BOILERPLATE_SUFFIXES)) return 'boilerplate';

  if (WIRING_FILENAME_SET.has(basename)) return 'wiring';
  if (hasSegment(normalized, WIRING_SEGMENT_SET)) return 'wiring';
  if (endsWithAny(normalized, WIRING_SUFFIXES)) return 'wiring';

  return 'core';
}

export function isTestPath(rawPath: string): boolean {
  const normalized = normalizePath(rawPath);
  return endsWithAny(normalized, TEST_SUFFIXES) || hasSegment(normalized, TEST_SEGMENT_SET);
}

export function findingWeight(findings: readonly SmartDiffFindingRow[]): number {
  let total = 0;
  for (const finding of findings) total += SEVERITY_WEIGHT[finding.severity] ?? 0;
  return total;
}

export function findingLinesFor(findings: readonly SmartDiffFindingRow[]): {
  lines: number[];
  clamped: number;
} {
  const lines = new Set<number>();
  let clamped = 0;

  for (const finding of findings) {
    const start = Math.min(finding.startLine, finding.endLine);
    const end = Math.max(finding.startLine, finding.endLine);
    if (!Number.isFinite(start) || start < 1) continue;

    const span = end - start;
    const last = span > MAX_FINDING_LINE_SPAN ? start + MAX_FINDING_LINE_SPAN : end;
    if (span > MAX_FINDING_LINE_SPAN) clamped += 1;

    for (let line = start; line <= last; line += 1) lines.add(line);
  }

  return { lines: [...lines].sort((a, b) => a - b), clamped };
}

export function compareClassifiedFiles(a: ClassifiedFile, b: ClassifiedFile): number {
  if (a.findingWeight !== b.findingWeight) return b.findingWeight - a.findingWeight;
  if (a.isTest !== b.isTest) return a.isTest ? 1 : -1;
  const aLines = a.additions + a.deletions;
  const bLines = b.additions + b.deletions;
  if (aLines !== bLines) return bLines - aLines;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export function orderGroup(files: readonly ClassifiedFile[]): ClassifiedFile[] {
  return [...files].sort(compareClassifiedFiles);
}

function splitKeyFor(rawPath: string): string {
  const segments = rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').split('/');
  if (segments.length <= 1) return SPLIT_ROOT_KEY;
  return segments.slice(0, SPLIT_KEY_SEGMENTS).join('/');
}

export function proposeSplits(reviewable: readonly ClassifiedFile[]): ProposedSplit[] {
  const buckets = new Map<string, ClassifiedFile[]>();
  for (const file of reviewable) {
    const key = splitKeyFor(file.path);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(file);
    else buckets.set(key, [file]);
  }

  const linesOf = (files: readonly ClassifiedFile[]) =>
    files.reduce((sum, file) => sum + file.additions + file.deletions, 0);

  const eligible = [...buckets.entries()]
    .filter(([, files]) => files.length >= MIN_FILES_PER_SPLIT)
    .sort(([aKey, aFiles], [bKey, bFiles]) => {
      const diff = linesOf(bFiles) - linesOf(aFiles);
      if (diff !== 0) return diff;
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });

  const kept = eligible.slice(0, MAX_PROPOSED_SPLITS);
  if (kept.length < MIN_SPLITS_TO_SUGGEST) return [];

  const keptKeys = new Set(kept.map(([key]) => key));
  const leftovers = [...buckets.entries()]
    .filter(([key]) => !keptKeys.has(key))
    .flatMap(([, files]) => files);

  const splits = kept.map(([key, files]) => ({ name: key, files: [...files] }));
  const last = splits[splits.length - 1];
  if (last) last.files.push(...leftovers);

  return splits.map((split) => ({
    name: split.name,
    files: split.files.map((file) => file.path).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  }));
}

export function buildSmartDiffModel(
  files: readonly SmartDiffFileRow[],
  findings: readonly SmartDiffFindingRow[],
): SmartDiffModel {
  const findingsByPath = new Map<string, SmartDiffFindingRow[]>();
  for (const finding of findings) {
    const bucket = findingsByPath.get(finding.file);
    if (bucket) bucket.push(finding);
    else findingsByPath.set(finding.file, [finding]);
  }

  const seen = new Map<string, SmartDiffFileRow>();
  const duplicatePaths: string[] = [];
  for (const file of files) {
    if (seen.has(file.path)) duplicatePaths.push(file.path);
    seen.set(file.path, file);
  }

  const buckets: Record<SmartDiffRole, ClassifiedFile[]> = {
    core: [],
    wiring: [],
    boilerplate: [],
  };

  let totalLines = 0;
  let reviewableLines = 0;
  let findingFiles = 0;
  let findingLineCount = 0;
  let clampedFindings = 0;

  for (const file of seen.values()) {
    const role = classifyPath(file.path);
    const own = findingsByPath.get(file.path) ?? [];
    const { lines, clamped } = findingLinesFor(own);

    const classified: ClassifiedFile = {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      role,
      isTest: isTestPath(file.path),
      findingWeight: findingWeight(own),
      findingLines: lines,
    };

    buckets[role].push(classified);

    const fileLines = file.additions + file.deletions;
    totalLines += fileLines;
    if (role !== 'boilerplate') reviewableLines += fileLines;
    if (own.length > 0) findingFiles += 1;
    findingLineCount += lines.length;
    clampedFindings += clamped;
  }

  const orphanFiles = [...findingsByPath.keys()].filter((path) => !seen.has(path)).sort();

  const groups = ROLE_ORDER.filter((role) => buckets[role].length > 0).map((role) => ({
    role,
    files: orderGroup(buckets[role]),
  }));

  const reviewable = [...buckets.core, ...buckets.wiring];
  const tooBig =
    reviewableLines > TOO_BIG_REVIEWABLE_LINES || buckets.core.length > TOO_BIG_CORE_FILES;

  return {
    groups,
    split: {
      too_big: tooBig,
      total_lines: totalLines,
      proposed_splits: tooBig ? proposeSplits(reviewable) : [],
    },
    stats: {
      totalLines,
      reviewableLines,
      findingFiles,
      findingLines: findingLineCount,
      duplicatePaths,
      orphanFiles,
      clampedFindings,
    },
  };
}
