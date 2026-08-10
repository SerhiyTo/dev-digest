import type { FindingRecord, PrFile, SmartDiffRole } from "@devdigest/shared";

/** Findings of the newest review only, so badge counts cannot contradict the
    server's finding_lines, which are computed from that same review. */
export function latestReviewFindings(findings: FindingRecord[]): FindingRecord[] {
  const latestId = findings[0]?.review_id;
  if (latestId == null) return [];
  return findings.filter((f) => f.review_id === latestId && !f.dismissed_at);
}

export function findingsByFile(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const byFile = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const bucket = byFile.get(f.file);
    if (bucket) bucket.push(f);
    else byFile.set(f.file, [f]);
  }
  return byFile;
}

export function filesByPath(files: PrFile[]): Map<string, PrFile> {
  return new Map(files.map((f) => [f.path, f]));
}

/** Boilerplate stays collapsed; a findings file only opens when it has a patch
    to show, so a null-patch file never expands into an empty body. */
export function shouldDefaultOpen(
  role: SmartDiffRole,
  hasFindings: boolean,
  hasPatch: boolean,
): boolean | undefined {
  if (role === "boilerplate") return false;
  if (hasFindings) return hasPatch;
  return undefined;
}
