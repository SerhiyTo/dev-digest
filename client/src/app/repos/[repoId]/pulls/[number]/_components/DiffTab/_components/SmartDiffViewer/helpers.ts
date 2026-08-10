import type { FindingRecord, PrFile, SmartDiffRole } from "@devdigest/shared";
import { parseSeverity, severityRank } from "@/lib/severity";

export function liveFindings(findings: FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => !f.dismissed_at);
}

export function worstFinding(findings: readonly FindingRecord[]): FindingRecord | null {
  let worst: FindingRecord | null = null;
  for (const f of findings) {
    if (!parseSeverity(f.severity)) continue;
    if (!worst || severityRank(f.severity) < severityRank(worst.severity)) worst = f;
  }
  return worst ?? findings[0] ?? null;
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

export function shouldDefaultOpen(
  role: SmartDiffRole,
  hasFindings: boolean,
  hasPatch: boolean,
): boolean | undefined {
  if (role === "boilerplate") return false;
  if (hasFindings) return hasPatch;
  return undefined;
}
