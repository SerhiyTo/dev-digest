import type {
  CiFailOn,
  EvalExpectation,
  EvalOwnerKind,
  FindingCategory,
  Provider,
  ReviewStrategy,
  Severity,
} from '@devdigest/shared';

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput: EvalExpectation[];
  notes?: string | null;
  sourceFindingId?: string | null;
}

export interface UpdateEvalCase {
  name?: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: EvalExpectation[];
  notes?: string | null;
}

export interface StoredEvalCase {
  id: string;
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputFiles: unknown;
  inputMeta: unknown;
  expectedOutput: EvalExpectation[];
  notes: string | null;
  sourceFindingId: string | null;
  createdAt: string;
}

export interface EvalCaseStore {
  insertCase(values: InsertEvalCase): Promise<StoredEvalCase>;
  updateCase(
    workspaceId: string,
    id: string,
    patch: UpdateEvalCase,
  ): Promise<StoredEvalCase | undefined>;
  getCaseById(workspaceId: string, id: string): Promise<StoredEvalCase | undefined>;
  getCaseBySourceFindingId(
    workspaceId: string,
    sourceFindingId: string,
  ): Promise<StoredEvalCase | undefined>;
  listCasesByOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<StoredEvalCase[]>;
  countCasesForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<number>;
  deleteCaseById(workspaceId: string, id: string): Promise<boolean>;
  deleteCasesForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<number>;
}

export interface InsertEvalRun {
  workspaceId: string;
  caseId: string;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
  suiteRunId: string | null;
  agentVersion: number | null;
}

export interface StoredEvalRun {
  id: string;
  caseId: string;
  ranAt: string;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
  suiteRunId: string | null;
  agentVersion: number | null;
}

export interface EvalRunStore {
  insertRun(values: InsertEvalRun): Promise<StoredEvalRun>;
  getRunById(workspaceId: string, id: string): Promise<StoredEvalRun | undefined>;
  listRunsByCase(workspaceId: string, caseId: string, limit?: number): Promise<StoredEvalRun[]>;
  listRunsBySuiteRun(workspaceId: string, suiteRunId: string): Promise<StoredEvalRun[]>;
  latestRunsByCaseIds(
    workspaceId: string,
    caseIds: string[],
  ): Promise<Map<string, StoredEvalRun>>;
}

export type EvalSuiteRunStatus = 'running' | 'done' | 'cancelled' | 'failed';

export interface StartEvalSuiteRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  casesTotal: number;
}

export interface FinishEvalSuiteRun {
  status: 'done' | 'failed';
  casesPassed: number | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  durationMs: number | null;
}

export interface StoredEvalSuiteRun {
  id: string;
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  status: EvalSuiteRunStatus;
  startedAt: string;
  finishedAt: string | null;
  casesTotal: number | null;
  casesPassed: number | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  durationMs: number | null;
}

export type CancelSuiteRunOutcome = 'cancelled' | 'not_running' | 'not_found';

export interface EvalSuiteRunStore {
  startIfNoneRunning(values: StartEvalSuiteRun): Promise<StoredEvalSuiteRun | undefined>;
  getSuiteRunById(workspaceId: string, id: string): Promise<StoredEvalSuiteRun | undefined>;
  getRunningForAgent(workspaceId: string, agentId: string): Promise<StoredEvalSuiteRun | undefined>;
  listForAgent(workspaceId: string, agentId: string, limit: number): Promise<StoredEvalSuiteRun[]>;
  trend(workspaceId: string, agentId: string, limit: number): Promise<StoredEvalSuiteRun[]>;
  recentCompleted(
    workspaceId: string,
    agentId: string,
    limit: number,
  ): Promise<StoredEvalSuiteRun[]>;
  getCompletedById(
    workspaceId: string,
    agentId: string,
    id: string,
  ): Promise<StoredEvalSuiteRun | undefined>;
  finish(
    workspaceId: string,
    id: string,
    patch: FinishEvalSuiteRun,
  ): Promise<StoredEvalSuiteRun | undefined>;
  cancelIfRunning(workspaceId: string, id: string): Promise<CancelSuiteRunOutcome>;
  reapStale(): Promise<number>;
}

export interface AgentSummary {
  id: string;
  name: string;
  version: number;
  enabled: boolean;
}

export interface AgentVersionSnapshot {
  agentId: string;
  version: number;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema: unknown;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  skillBlocks: string[];
  createdAt: string;
}

export interface AgentConfigSource {
  listAgents(workspaceId: string): Promise<AgentSummary[]>;
  getAgent(workspaceId: string, agentId: string): Promise<AgentSummary | undefined>;
  getVersionSnapshot(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersionSnapshot | undefined>;
}

export interface SourceFindingSnapshot {
  id: string;
  agentId: string | null;
  file: string;
  startLine: number;
  endLine: number;
  category: FindingCategory;
  severity: Severity;
  title: string;
  acceptedAt: string | null;
  dismissedAt: string | null;
}

export interface SourceFindingWithDiff {
  finding: SourceFindingSnapshot;
  fileDiff: string | null;
}

export interface SourceDiffSource {
  getFindingWithDiff(
    workspaceId: string,
    findingId: string,
  ): Promise<SourceFindingWithDiff | undefined>;
}

export interface StartSuiteExecution {
  workspaceId: string;
  agentId: string;
  suiteRunId: string;
  agentVersion: number;
}

export interface RunSingleCaseExecution {
  workspaceId: string;
  agentId: string;
  caseId: string;
  agentVersion: number;
}

export interface SuiteExecutor {
  startSuite(input: StartSuiteExecution): void;
  cancelSuite(suiteRunId: string): void;
  runSingleCase(input: RunSingleCaseExecution): Promise<void>;
}
