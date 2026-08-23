import type { Onboarding, RepoRef } from '@devdigest/shared';

export interface OnboardingRepoRef {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

export interface RepoRefStore {
  getRepoRef(workspaceId: string, repoId: string): Promise<OnboardingRepoRef | undefined>;
}

export interface OnboardingTourRow {
  repoId: string;
  tourJson: unknown;
  generatedAt: Date;
  filesIndexed: number | null;
  indexedSha: string | null;
  model: string | null;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface UpsertTour {
  repoId: string;
  tour: Onboarding;
  filesIndexed: number | null;
  indexedSha: string | null;
  model: string | null;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface TourStore {
  readTour(repoId: string): Promise<OnboardingTourRow | undefined>;
  upsertTour(values: UpsertTour): Promise<void>;
}

export type OnboardingGenerationStatus = 'running' | 'done' | 'failed';

export interface GenerationStateRow {
  repoId: string;
  workspaceId: string;
  status: OnboardingGenerationStatus;
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

export interface BeginGeneration {
  repoId: string;
  workspaceId: string;
}

export interface FinishGeneration {
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  degradedReason: string | null;
}

export interface FailGeneration {
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  error: string;
}

export interface GenerationStore {
  readState(repoId: string): Promise<GenerationStateRow | undefined>;
  beginGeneration(values: BeginGeneration): Promise<boolean>;
  finishGeneration(repoId: string, patch: FinishGeneration): Promise<void>;
  failGeneration(repoId: string, patch: FailGeneration): Promise<void>;
  reapRunning(error: string): Promise<number>;
}

export interface OnboardingIndexState {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  lastIndexedSha: string;
  filesIndexed: number;
}

export interface OnboardingRepoMap {
  text: string;
  tokens: number;
  degraded?: boolean;
}

export interface OnboardingFileRank {
  path: string;
  percentile: number;
}

export interface RepoFacts {
  getIndexState(repoId: string): Promise<OnboardingIndexState>;
  getRepoMap(repoId: string, tokenBudget?: number): Promise<OnboardingRepoMap>;
  getTopFilesByRank(repoId: string, n: number, opts?: { exclude?: string[] }): Promise<string[]>;
  getCriticalPaths(repoId: string): Promise<string[][]>;
  getIndexedPaths(repoId: string): Promise<string[]>;
  getFileRank(repoId: string, paths: string[]): Promise<OnboardingFileRank[]>;
}

export interface GitReader {
  readFile(repo: RepoRef, path: string): Promise<string>;
}

export type { FeatureModelResolver } from '@devdigest/shared';

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};
