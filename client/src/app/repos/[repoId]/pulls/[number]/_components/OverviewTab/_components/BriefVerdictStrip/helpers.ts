import type {
  CiFailOn,
  FindingRecord,
  MergeRisk,
  ReviewRecord,
  Risk,
  Severity,
  Verdict,
} from "@devdigest/shared";
import { meetsGate, sortBySeverity } from "@/lib/severity";
import { formatFileRef } from "@/lib/brief";
import { MAX_BLOCKING_ROWS } from "./constants";

export interface BlockingReasonRef {
  path: string;
  startLine: number | null;
  endLine: number | null;
}

export interface BlockingReason {
  severity: Severity;
  title: string;
  ref: BlockingReasonRef;
}

export interface BlockingReasonsSource {
  review: ReviewRecord | null | undefined;
  run: { ci_fail_on?: CiFailOn | null } | null | undefined;
  risks: Risk[] | null | undefined;
}

function findingReason(f: FindingRecord): BlockingReason {
  return {
    severity: f.severity,
    title: f.title,
    ref: { path: f.file, startLine: f.start_line, endLine: f.end_line },
  };
}

function riskReason(r: Risk): BlockingReason {
  const parts = formatFileRef(r.file_refs[0] ?? "");
  return {
    severity: "CRITICAL",
    title: r.title,
    ref: { path: parts.path, startLine: parts.startLine, endLine: parts.endLine },
  };
}

export function composeBlockingReasons({
  review,
  run,
  risks,
}: BlockingReasonsSource): BlockingReason[] {
  const gate = run?.ci_fail_on ?? null;
  const findings = (review?.findings ?? []).filter(
    (f) => !f.dismissed_at && meetsGate(f.severity, gate),
  );
  const findingReasons = sortBySeverity(findings).map(findingReason);

  const highRisks = (risks ?? []).filter((r) => r.severity === "high");
  const riskReasons = highRisks.map(riskReason);

  return [...findingReasons, ...riskReasons];
}

export function visibleBlockingReasons(reasons: BlockingReason[]): {
  rows: BlockingReason[];
  hiddenCount: number;
} {
  if (reasons.length <= MAX_BLOCKING_ROWS) return { rows: reasons, hiddenCount: 0 };
  return {
    rows: reasons.slice(0, MAX_BLOCKING_ROWS),
    hiddenCount: reasons.length - MAX_BLOCKING_ROWS,
  };
}

export function judgementsDisagree({
  verdict,
  blockerCount,
  mergeRisk,
}: {
  verdict: Verdict | null | undefined;
  blockerCount: number;
  mergeRisk: MergeRisk | null | undefined;
}): boolean {
  return mergeRisk === "high" && (verdict === "approve" || blockerCount === 0);
}
