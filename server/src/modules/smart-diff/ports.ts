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

export type ReviewKind = 'summary' | 'review';

export interface LatestReviewFindings {
  reviewId: string | null;
  kind: ReviewKind | null;
  fellBackToSummary: boolean;
  findings: SmartDiffFindingRow[];
  droppedSeverities: { severity: string; count: number }[];
}

export interface SmartDiffStore {
  getPullSummary(workspaceId: string, prId: string): Promise<{ id: string } | undefined>;
  getFiles(prId: string): Promise<SmartDiffFileRow[]>;
  getLatestReviewFindings(prId: string): Promise<LatestReviewFindings>;
}

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};
