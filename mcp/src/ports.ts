import type {
  ConventionScanStatus,
  ConventionStatus,
  FindingCategory,
  Severity,
  Verdict,
} from '@devdigest/shared';

export interface AgentRow {
  id: string;
  name: string;
  description: string;
  model: string;
  enabled: boolean;
}

export interface RepoRow {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

export interface PullRow {
  id?: string | null;
  number: number;
  title: string;
}

export interface StartedRun {
  run_id: string;
  agent_id: string;
  agent_name: string;
}

export interface RunRow {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  status: string | null;
  ran_at: string | null;
  error: string | null;
  score: number | null;
  findings_count: number | null;
}

export interface FindingRow {
  severity: Severity;
  category: FindingCategory;
  file: string;
  start_line: number;
  end_line: number;
  title: string;
  rationale: string;
  suggestion?: string | null;
}

export interface ReviewRow {
  id: string;
  run_id: string | null;
  agent_name?: string | null;
  verdict: Verdict | null;
  summary: string | null;
  score: number | null;
  grounding?: string | null;
  created_at: string;
  findings: FindingRow[];
}

export interface ConventionEvidenceRow {
  path: string;
  start_line: number;
  end_line: number;
}

export interface ConventionCandidateRow {
  id: string;
  rule: string;
  confidence: number;
  status: ConventionStatus;
  occurrence_files?: number | null;
  evidence: ConventionEvidenceRow[];
}

export interface ConventionsRow {
  state: {
    status: ConventionScanStatus;
    last_scan_at?: string | null;
  };
  candidates: ConventionCandidateRow[];
}

export interface ChangedSymbolRow {
  name: string;
  file: string;
  kind: string;
}

export interface BlastCallerRow {
  name: string;
  file: string;
  line: number;
}

export interface DownstreamImpactRow {
  symbol: string;
  callers: BlastCallerRow[];
  endpoints_affected: string[];
  crons_affected: string[];
}

export interface PrHistoryItemRow {
  pr_number: number;
  title: string;
  merged_at: string;
  author: string;
  files_overlap: string[];
  notes: string;
}

export interface BlastRadiusRow {
  changed_symbols: ChangedSymbolRow[];
  downstream: DownstreamImpactRow[];
  summary: string;
  endpoints_affected: string[];
  crons_affected: string[];
  history: PrHistoryItemRow[];
  truncated: boolean;
  degraded: boolean;
  reason: string;
}

export interface DevDigestApi {
  listAgents(signal?: AbortSignal): Promise<AgentRow[]>;
  listRepos(signal?: AbortSignal): Promise<RepoRow[]>;
  listPulls(repoId: string, signal?: AbortSignal): Promise<PullRow[]>;
  startReview(prId: string, agentId: string, signal?: AbortSignal): Promise<StartedRun[]>;
  listRuns(prId: string, signal?: AbortSignal): Promise<RunRow[]>;
  listReviews(prId: string, signal?: AbortSignal): Promise<ReviewRow[]>;
  getConventions(repoId: string, signal?: AbortSignal): Promise<ConventionsRow>;
  getBlastRadius(prId: string, signal?: AbortSignal): Promise<BlastRadiusRow>;
}
