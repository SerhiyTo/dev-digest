import type { FindingRecord, Severity } from "@devdigest/shared";
import { severityRank } from "@/lib/severity";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}
