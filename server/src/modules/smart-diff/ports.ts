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

export interface SmartDiffStore {
  getPullSummary(workspaceId: string, prId: string): Promise<{ id: string } | undefined>;
  getFiles(prId: string): Promise<SmartDiffFileRow[]>;
  getFindings(prId: string): Promise<PrFindings>;
}

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};
