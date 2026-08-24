import { SEV, type Severity } from "@devdigest/ui";
import { formatCost } from "./cost";

export const MERGE_RISK_BANDS = ["low", "medium", "high"] as const;
export type MergeRiskBand = (typeof MERGE_RISK_BANDS)[number];

const MERGE_RISK_SEVERITY: Record<MergeRiskBand, Severity> = {
  low: "SUGGESTION",
  medium: "WARNING",
  high: "CRITICAL",
};

export function mergeRiskToken(band: MergeRiskBand) {
  return SEV[MERGE_RISK_SEVERITY[band]];
}

export function shortSha(sha: string | null | undefined): string {
  if (!sha) return "—";
  return sha.slice(0, 7);
}

export interface FileRefParts {
  path: string;
  startLine: number | null;
  endLine: number | null;
}

const FILE_REF_PATTERN = /^(.+?)(?::(\d+)(?:-(\d+))?)?$/;

export function formatFileRef(ref: string): FileRefParts {
  const match = FILE_REF_PATTERN.exec(ref);
  if (!match) return { path: ref, startLine: null, endLine: null };
  const [, path, start, end] = match;
  return {
    path: path || ref,
    startLine: start != null ? Number(start) : null,
    endLine: end != null ? Number(end) : null,
  };
}

export function costLine(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
  costUsd: number | null | undefined,
): string {
  const tokens = `${(tokensIn ?? 0).toLocaleString()} in / ${(tokensOut ?? 0).toLocaleString()} out`;
  return costUsd == null ? tokens : `${tokens} · ${formatCost(costUsd)}`;
}
