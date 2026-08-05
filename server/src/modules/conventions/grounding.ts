/**
 * The evidence gate: the model proposes, the repository decides.
 *
 * Every snippet is re-found in the file it names and its line numbers are
 * recomputed from the match, so the `path:lines` this feature prints is true
 * whatever the model reported. Rationale in
 * `server/specs/2026-08-05-conventions.md`.
 */
import { MAX_RULE_CHARS, MAX_SNIPPET_LINES, MIN_RULE_CHARS } from './constants.js';

export const DROP_RULE_LENGTH = 'rule_length';
export const DROP_UNKNOWN_PATH = 'unknown_path';
export const DROP_SNIPPET_NOT_FOUND = 'snippet_not_found';
export const DROP_SNIPPET_TOO_LONG = 'snippet_too_long';
export const DROP_NO_EVIDENCE = 'no_evidence';
export const DROP_DUPLICATE_RULE = 'duplicate_rule';

export interface RawEvidence {
  path: string;
  start_line: number;
  end_line: number;
  snippet: string;
}

export interface RawConvention {
  rule: string;
  evidence: RawEvidence[];
  probe?: string | null;
  confidence: number;
}

export interface GroundedEvidence {
  path: string;
  start_line: number;
  end_line: number;
  snippet: string;
}

export interface GroundedConvention {
  rule: string;
  evidence: GroundedEvidence[];
  probe: string | null;
  confidence: number;
}

export interface DroppedConvention {
  rule: string;
  reason: string;
}

export interface GroundingResult {
  kept: GroundedConvention[];
  dropped: DroppedConvention[];
}

interface NormalisedLine {
  text: string;
  line: number;
}

export function normaliseRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function groundConventions(
  raw: readonly RawConvention[],
  files: ReadonlyMap<string, string>,
): GroundingResult {
  const normalisedFiles = new Map<string, NormalisedLine[]>();
  for (const [path, content] of files) normalisedFiles.set(path, normaliseContent(content));

  const kept: GroundedConvention[] = [];
  const dropped: DroppedConvention[] = [];
  const seen = new Map<string, number>();

  for (const candidate of raw) {
    const rule = candidate.rule.trim();
    if (rule.length < MIN_RULE_CHARS || rule.length > MAX_RULE_CHARS) {
      dropped.push({ rule, reason: DROP_RULE_LENGTH });
      continue;
    }

    const evidence: GroundedEvidence[] = [];
    const failures: string[] = [];
    for (const entry of candidate.evidence ?? []) {
      const outcome = groundEvidence(entry, normalisedFiles);
      if ('reason' in outcome) failures.push(outcome.reason);
      else evidence.push(outcome.evidence);
    }

    if (evidence.length === 0) {
      dropped.push({ rule, reason: failures[0] ?? DROP_NO_EVIDENCE });
      continue;
    }

    const grounded: GroundedConvention = {
      rule,
      evidence,
      probe: candidate.probe ?? null,
      confidence: clamp01(candidate.confidence),
    };

    const key = normaliseRule(rule);
    const existingIndex = seen.get(key);
    if (existingIndex === undefined) {
      seen.set(key, kept.length);
      kept.push(grounded);
      continue;
    }
    const existing = kept[existingIndex]!;
    if (grounded.confidence > existing.confidence) {
      dropped.push({ rule: existing.rule, reason: DROP_DUPLICATE_RULE });
      kept[existingIndex] = grounded;
    } else {
      dropped.push({ rule, reason: DROP_DUPLICATE_RULE });
    }
  }

  return { kept, dropped };
}

function groundEvidence(
  entry: RawEvidence,
  files: ReadonlyMap<string, NormalisedLine[]>,
): { evidence: GroundedEvidence } | { reason: string } {
  const fileLines = files.get(entry.path);
  if (!fileLines) return { reason: DROP_UNKNOWN_PATH };

  const snippet = entry.snippet ?? '';
  if (snippet.split('\n').length > MAX_SNIPPET_LINES) return { reason: DROP_SNIPPET_TOO_LONG };

  const needle = normaliseContent(snippet);
  if (needle.length === 0) return { reason: DROP_SNIPPET_NOT_FOUND };

  const at = findWindow(fileLines, needle);
  if (at < 0) return { reason: DROP_SNIPPET_NOT_FOUND };

  return {
    evidence: {
      path: entry.path,
      start_line: fileLines[at]!.line,
      end_line: fileLines[at + needle.length - 1]!.line,
      snippet: trimBlankEdges(snippet),
    },
  };
}

/**
 * Compare on whitespace-normalised, blank-stripped lines: a model that
 * re-indented an honest citation still matches, one that invented it does not.
 */
function normaliseContent(text: string): NormalisedLine[] {
  const out: NormalisedLine[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const normalised = lines[i]!.trim().replace(/\s+/g, ' ');
    if (normalised !== '') out.push({ text: normalised, line: i + 1 });
  }
  return out;
}

function findWindow(haystack: readonly NormalisedLine[], needle: readonly NormalisedLine[]): number {
  const limit = haystack.length - needle.length;
  for (let start = 0; start <= limit; start++) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset]!.text !== needle[offset]!.text) {
        matched = false;
        break;
      }
    }
    if (matched) return start;
  }
  return -1;
}

function trimBlankEdges(snippet: string): string {
  return snippet.replace(/^\s*\n/, '').replace(/\s+$/, '');
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
