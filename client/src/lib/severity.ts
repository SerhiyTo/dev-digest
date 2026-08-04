import type { FindingRecord, ReviewRecord, Severity } from "@devdigest/shared";

export const SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

export type SeverityCounts = Record<Severity, number>;

export function emptySeverityCounts(): SeverityCounts {
  return { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
}

export function parseSeverity(raw: string | null | undefined): Severity | null {
  return raw != null && (SEVERITIES as readonly string[]).includes(raw) ? (raw as Severity) : null;
}

export function countActiveBySeverity(findings: FindingRecord[]): SeverityCounts {
  const counts = emptySeverityCounts();
  for (const f of findings) {
    if (f.dismissed_at) continue;
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

export function countsByRunId(reviews: ReviewRecord[]): Record<string, SeverityCounts> {
  const byRun: Record<string, SeverityCounts> = {};
  for (const r of reviews) {
    if (!r.run_id) continue;
    byRun[r.run_id] = countActiveBySeverity(r.findings);
  }
  return byRun;
}

export function isEmptyCounts(counts: SeverityCounts): boolean {
  return SEVERITIES.every((sev) => counts[sev] === 0);
}

export function severityRank(severity: string): number {
  const i = (SEVERITIES as readonly string[]).indexOf(severity);
  return i === -1 ? SEVERITIES.length : i;
}

export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

export function hasFindingAtSeverity(
  findings: FindingRecord[],
  severity: Severity | null,
): boolean {
  return severity == null || findings.some((f) => f.severity === severity);
}

export function runsMatchingSeverity(
  reviews: ReviewRecord[],
  severity: Severity | null,
): ReviewRecord[] {
  return severity == null
    ? reviews
    : reviews.filter((r) => hasFindingAtSeverity(r.findings, severity));
}
