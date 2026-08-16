import type { AgentRow, BlastRadiusRow, ConventionsRow, FindingRow } from '../ports.js';
import { MAX_PAYLOAD_CHARS } from '../constants.js';

const STRING_FIELD_MAX_CHARS = 500;
const AGENT_DESCRIPTION_MAX_CHARS = 80;
const TRUNCATE_NARROW_WITH = ['min_severity', 'limit'] as const;
const BLAST_MAX_SYMBOLS = 10;
const BLAST_MAX_CALLERS_PER_SYMBOL = 5;

const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g;

function sanitizeText(value: string, maxChars: number): string {
  const stripped = value.replace(CONTROL_CHARS_RE, '');
  return stripped.length > maxChars ? stripped.slice(0, maxChars) : stripped;
}

export interface FindingItem {
  severity: FindingRow['severity'];
  file: string;
  line: number;
  title: string;
  fix: string | null;
}

export function toFindingsPayload(findings: readonly FindingRow[]): FindingItem[] {
  return findings.map((finding) => ({
    severity: finding.severity,
    file: sanitizeText(finding.file, STRING_FIELD_MAX_CHARS),
    line: finding.start_line,
    title: sanitizeText(finding.title, STRING_FIELD_MAX_CHARS),
    fix:
      finding.suggestion != null
        ? sanitizeText(finding.suggestion, STRING_FIELD_MAX_CHARS)
        : null,
  }));
}

export interface AgentItem {
  name: string;
  model: string;
  enabled: boolean;
  description: string;
}

export interface AgentsPayload {
  agents: AgentItem[];
}

export function toAgentsPayload(agents: readonly AgentRow[]): AgentsPayload {
  return {
    agents: agents.map((agent) => ({
      name: sanitizeText(agent.name, STRING_FIELD_MAX_CHARS),
      model: sanitizeText(agent.model, STRING_FIELD_MAX_CHARS),
      enabled: agent.enabled,
      description: sanitizeText(agent.description, AGENT_DESCRIPTION_MAX_CHARS),
    })),
  };
}

export interface ConventionItem {
  rule: string;
  confidence: number;
  status: ConventionsRow['candidates'][number]['status'];
  occurrence_files: number | null;
  evidence: string[];
}

export interface ConventionsPayload {
  status: ConventionsRow['state']['status'];
  scanned_at: string | null;
  conventions: ConventionItem[];
}

function formatEvidence(evidence: ConventionsRow['candidates'][number]['evidence'][number]): string {
  const location =
    evidence.start_line === evidence.end_line
      ? `${evidence.start_line}`
      : `${evidence.start_line}-${evidence.end_line}`;
  return sanitizeText(`${evidence.path}:${location}`, STRING_FIELD_MAX_CHARS);
}

export function toConventionsPayload(row: ConventionsRow): ConventionsPayload {
  return {
    status: row.state.status,
    scanned_at: row.state.last_scan_at ?? null,
    conventions: row.candidates.map((candidate) => ({
      rule: sanitizeText(candidate.rule, STRING_FIELD_MAX_CHARS),
      confidence: candidate.confidence,
      status: candidate.status,
      occurrence_files: candidate.occurrence_files ?? null,
      evidence: candidate.evidence.map(formatEvidence),
    })),
  };
}

export interface BlastPayloadInput extends BlastRadiusRow {
  repo: string;
  pr: number;
}

export function toBlastPayload(input: BlastPayloadInput): Record<string, unknown> {
  const changedSymbols = input.changed_symbols.slice(0, BLAST_MAX_SYMBOLS).map((symbol) => ({
    name: sanitizeText(symbol.name, STRING_FIELD_MAX_CHARS),
    file: sanitizeText(symbol.file, STRING_FIELD_MAX_CHARS),
    kind: sanitizeText(symbol.kind, STRING_FIELD_MAX_CHARS),
  }));

  const downstream = input.downstream.slice(0, BLAST_MAX_SYMBOLS).map((entry) => ({
    symbol: sanitizeText(entry.symbol, STRING_FIELD_MAX_CHARS),
    callers: entry.callers.slice(0, BLAST_MAX_CALLERS_PER_SYMBOL).map((caller) => ({
      name: sanitizeText(caller.name, STRING_FIELD_MAX_CHARS),
      file: sanitizeText(caller.file, STRING_FIELD_MAX_CHARS),
      line: caller.line,
    })),
    endpoints_affected: entry.endpoints_affected.map((endpoint) =>
      sanitizeText(endpoint, STRING_FIELD_MAX_CHARS),
    ),
    crons_affected: entry.crons_affected.map((cron) => sanitizeText(cron, STRING_FIELD_MAX_CHARS)),
  }));

  const history = input.history.map((item) => ({
    pr_number: item.pr_number,
    title: sanitizeText(item.title, STRING_FIELD_MAX_CHARS),
    merged_at: item.merged_at,
    author: sanitizeText(item.author, STRING_FIELD_MAX_CHARS),
    files_overlap: item.files_overlap.map((path) => sanitizeText(path, STRING_FIELD_MAX_CHARS)),
    notes: sanitizeText(item.notes, STRING_FIELD_MAX_CHARS),
  }));

  return {
    repo: sanitizeText(input.repo, STRING_FIELD_MAX_CHARS),
    pr: input.pr,
    summary: sanitizeText(input.summary, STRING_FIELD_MAX_CHARS),
    changed_symbols: changedSymbols,
    downstream,
    endpoints_affected: input.endpoints_affected.map((endpoint) =>
      sanitizeText(endpoint, STRING_FIELD_MAX_CHARS),
    ),
    crons_affected: input.crons_affected.map((cron) => sanitizeText(cron, STRING_FIELD_MAX_CHARS)),
    history,
    truncated: input.truncated,
    degraded: input.degraded,
    reason: sanitizeText(input.reason, STRING_FIELD_MAX_CHARS),
  };
}

function findTopLevelArrayKey(value: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(value)) {
    if (Array.isArray(value[key])) return key;
  }
  return undefined;
}

export function capPayload(value: unknown): string {
  const compact = JSON.stringify(value) ?? 'null';
  if (compact.length <= MAX_PAYLOAD_CHARS) return compact;

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return compact;
  }

  const record = value as Record<string, unknown>;
  const arrayKey = findTopLevelArrayKey(record);
  if (arrayKey === undefined) return compact;

  const items = record[arrayKey] as unknown[];
  const total = items.length;

  const build = (shown: number): unknown => ({
    ...record,
    [arrayKey]: items.slice(0, shown),
    truncated: { shown, total, narrow_with: [...TRUNCATE_NARROW_WITH] },
  });

  let low = 0;
  let high = total;
  let best = JSON.stringify(build(0)) ?? 'null';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const serialized = JSON.stringify(build(mid)) ?? 'null';
    if (serialized.length <= MAX_PAYLOAD_CHARS) {
      best = serialized;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}
