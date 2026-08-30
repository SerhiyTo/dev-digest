import type { BlastRadiusResponse, Severity, SmartDiffRole } from '@devdigest/shared';

export interface BlastSource {
  get(workspaceId: string, prId: string): Promise<BlastRadiusResponse | undefined>;
}

export interface FileRoleSource {
  get(workspaceId: string, prId: string): Promise<ReadonlyMap<string, SmartDiffRole> | undefined>;
}

export interface BriefDocumentRow {
  json: unknown;
  headSha: string | null;
  model: string | null;
  provider: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  degradedReason: string | null;
  truncated: boolean;
  generatedAt: Date;
}

export interface UpsertBriefDocument {
  prId: string;
  json: unknown;
  headSha: string;
  model: string | null;
  provider: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  degradedReason: string | null;
  truncated: boolean;
}

export interface BriefStore {
  readBrief(prId: string): Promise<BriefDocumentRow | undefined>;
  upsertBrief(values: UpsertBriefDocument): Promise<void>;
}

export type BriefGenerationStatus = 'running' | 'done' | 'failed';

export interface BriefGenerationRow {
  prId: string;
  workspaceId: string;
  status: BriefGenerationStatus;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  degradedReason: string | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface BeginBriefGeneration {
  prId: string;
  workspaceId: string;
}

export interface FinishBriefGeneration {
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  degradedReason: string | null;
}

export interface FailBriefGeneration {
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  error: string;
}

export interface BriefGenerationStore {
  readGeneration(prId: string): Promise<BriefGenerationRow | undefined>;
  beginGeneration(values: BeginBriefGeneration): Promise<boolean>;
  finishGeneration(prId: string, patch: FinishBriefGeneration): Promise<void>;
  failGeneration(prId: string, patch: FailBriefGeneration): Promise<void>;
  reapRunning(error: string): Promise<number>;
}

export interface BriefIntentRiskArea {
  label: string;
  severity: 'high' | 'medium' | 'low';
}

export interface BriefIntentEvidence {
  kind: string;
  detail: string;
  weight: number;
}

export interface BriefIntentRow {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  riskAreas: BriefIntentRiskArea[];
  evidence: BriefIntentEvidence[];
  confidence: number | null;
}

export interface IntentSource {
  readIntent(prId: string): Promise<BriefIntentRow | undefined>;
}

export interface BriefLatestReview {
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
  findingsCount: number;
  blockers: number;
}

export interface BriefReviewsRead {
  latest: BriefLatestReview | null;
  distinctModels: string[];
}

export interface BriefFindingRow {
  file: string;
  startLine: number;
  endLine: number;
  severity: Severity;
}

export interface ReviewSource {
  readReviews(prId: string): Promise<BriefReviewsRead>;
  readFindings(prId: string): Promise<BriefFindingRow[]>;
}

export interface BriefCommit {
  sha: string;
  message: string;
}

export interface BriefPullSummary {
  id: string;
  repoId: string;
  workspaceId: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  base: string;
  headSha: string;
  commits: BriefCommit[];
}

export interface PullSource {
  getPullSummary(workspaceId: string, prId: string): Promise<BriefPullSummary | undefined>;
}

export interface BriefChangedFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface FileSource {
  getChangedFiles(prId: string): Promise<BriefChangedFile[]>;
}

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};
