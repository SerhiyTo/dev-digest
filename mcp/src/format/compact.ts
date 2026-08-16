import type { AgentRow, ConventionsRow, FindingRow } from '../ports.js';
import { MAX_PAYLOAD_CHARS } from '../constants.js';

const STRING_FIELD_MAX_CHARS = 500;
const AGENT_DESCRIPTION_MAX_CHARS = 80;
const TRUNCATE_NARROW_WITH = ['min_severity', 'limit'] as const;

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
