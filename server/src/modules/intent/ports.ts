import type { IntentEvidence, RepoRef, RiskSeverity } from '@devdigest/shared';

export interface FetchedDoc {
  path: string;
  content: string;
}

export interface FetchedIssue {
  ref: string;
  title: string;
  state: string;
  body: string;
}

export interface FetchedLink {
  url: string;
  title: string | null;
  text: string;
}

export interface ClassifierInput {
  title: string;
  body: string | null;
  branch: string;
  changedPaths: readonly string[];
  commitMessages: readonly string[];
  docs: readonly FetchedDoc[];
  issues: readonly FetchedIssue[];
  links: readonly FetchedLink[];
}

export interface PrIntentClassificationData {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  risk_areas: { label: string; severity: RiskSeverity }[];
}

export interface ClassifierResult {
  data: PrIntentClassificationData;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

export interface IntentPull {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
  repo: RepoRef;
}

export interface IntentRow {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  riskAreas: { label: string; severity: RiskSeverity }[];
  evidence: IntentEvidence[];
  confidence: number | null;
  model: string | null;
  headSha: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  computedAt: Date;
}

export type IntentUpsert = Omit<IntentRow, 'computedAt'>;

export interface IntentStore {
  getPull(workspaceId: string, prId: string): Promise<IntentPull | undefined>;
  getFilePaths(prId: string): Promise<string[]>;
  getCommitMessages(prId: string): Promise<string[]>;
  getIntentRow(prId: string): Promise<IntentRow | undefined>;
  upsertIntent(values: IntentUpsert): Promise<void>;
}

export interface DocSource {
  read(repo: RepoRef, path: string): Promise<string>;
}

export interface IssueSource {
  get(repo: RepoRef, number: number): Promise<{ title: string; body: string; state: string }>;
}

export interface LinkSource {
  allowlist(workspaceId: string): Promise<readonly string[]>;
  fetch(url: string, allowlist: readonly string[]): Promise<FetchedLink>;
}

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

export interface IntentClassifier {
  classify(workspaceId: string, input: ClassifierInput): Promise<ClassifierResult>;
}
