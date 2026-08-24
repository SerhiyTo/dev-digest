import type { PrBriefFileSummary } from '@devdigest/shared';

export interface SmartDiffFileRow {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffFindingRow {
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
}

export interface PrFindings {
  findings: SmartDiffFindingRow[];
  reviewCount: number;
  droppedSeverities: { severity: string; count: number }[];
}

export interface SmartDiffPullSummary {
  id: string;
  headSha: string;
}

export interface BriefSummaries {
  headSha: string | null;
  fileSummaries: PrBriefFileSummary[];
}

export interface SmartDiffStore {
  getPullSummary(workspaceId: string, prId: string): Promise<SmartDiffPullSummary | undefined>;
  getFiles(prId: string): Promise<SmartDiffFileRow[]>;
  getFindings(prId: string): Promise<PrFindings>;
  getBriefSummaries(prId: string): Promise<BriefSummaries | undefined>;
}

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};
