import { z } from 'zod';
import type {
  Agent,
  BlastRadiusResponse,
  ConventionCandidate,
  ConventionScanState,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunTarget,
  RunSummary,
} from '@devdigest/shared';
import type {
  AgentRow,
  BlastRadiusRow,
  ConventionCandidateRow,
  ConventionEvidenceRow,
  ConventionsRow,
  FindingRow,
  PullRow,
  RepoRow,
  ReviewRow,
  RunRow,
  StartedRun,
} from '../ports.js';

type Extends<A, B> = A extends B ? true : never;

export const AgentRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    model: z.string(),
    enabled: z.boolean(),
  })
  .passthrough();
export const AgentListSchema = z.array(AgentRowSchema);

type _AgentRowOk = Extends<
  Pick<Agent, 'id' | 'name' | 'description' | 'model' | 'enabled'>,
  AgentRow
>;
const _agentRowOk: _AgentRowOk = true;
void _agentRowOk;

export const RepoRowSchema = z
  .object({
    id: z.string(),
    owner: z.string(),
    name: z.string(),
    full_name: z.string(),
  })
  .passthrough();
export const RepoListSchema = z.array(RepoRowSchema);

type _RepoRowOk = Extends<Pick<Repo, 'id' | 'owner' | 'name' | 'full_name'>, RepoRow>;
const _repoRowOk: _RepoRowOk = true;
void _repoRowOk;

export const PullRowSchema = z
  .object({
    id: z.string().nullish(),
    number: z.number(),
    title: z.string(),
  })
  .passthrough();
export const PullListSchema = z.array(PullRowSchema);

type _PullRowOk = Extends<Pick<PrMeta, 'id' | 'number' | 'title'>, PullRow>;
const _pullRowOk: _PullRowOk = true;
void _pullRowOk;

export const StartedRunSchema = z
  .object({
    run_id: z.string(),
    agent_id: z.string(),
    agent_name: z.string(),
  })
  .passthrough();
export const StartedRunListSchema = z.array(StartedRunSchema);

type _StartedRunOk = Extends<
  Pick<ReviewRunTarget, 'run_id' | 'agent_id' | 'agent_name'>,
  StartedRun
>;
const _startedRunOk: _StartedRunOk = true;
void _startedRunOk;

export const ReviewRunResponseSchema = z
  .object({
    runs: StartedRunListSchema,
  })
  .passthrough();

export const RunRowSchema = z
  .object({
    run_id: z.string(),
    agent_id: z.string().nullable(),
    agent_name: z.string().nullable(),
    status: z.string().nullable(),
    ran_at: z.string().nullable(),
    error: z.string().nullable(),
    score: z.number().nullable(),
    findings_count: z.number().nullable(),
  })
  .passthrough();
export const RunListSchema = z.array(RunRowSchema);

type _RunRowOk = Extends<
  Pick<
    RunSummary,
    'run_id' | 'agent_id' | 'agent_name' | 'status' | 'ran_at' | 'error' | 'score' | 'findings_count'
  >,
  RunRow
>;
const _runRowOk: _RunRowOk = true;
void _runRowOk;

export const FindingRowSchema = z
  .object({
    severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
    category: z.enum(['bug', 'security', 'perf', 'style', 'test']),
    file: z.string(),
    start_line: z.number(),
    end_line: z.number(),
    title: z.string(),
    rationale: z.string(),
    suggestion: z.string().nullish(),
  })
  .passthrough();

type _FindingRowOk = Extends<
  Pick<
    FindingRecord,
    'severity' | 'category' | 'file' | 'start_line' | 'end_line' | 'title' | 'rationale' | 'suggestion'
  >,
  FindingRow
>;
const _findingRowOk: _FindingRowOk = true;
void _findingRowOk;

export const ReviewRowSchema = z
  .object({
    id: z.string(),
    run_id: z.string().nullable(),
    agent_name: z.string().nullish(),
    verdict: z.enum(['request_changes', 'approve', 'comment']).nullable(),
    summary: z.string().nullable(),
    score: z.number().nullable(),
    grounding: z.string().nullish(),
    created_at: z.string(),
    findings: z.array(FindingRowSchema),
  })
  .passthrough();
export const ReviewListSchema = z.array(ReviewRowSchema);

type _ReviewRowOk = Extends<
  Pick<
    ReviewRecord,
    'id' | 'run_id' | 'agent_name' | 'verdict' | 'summary' | 'score' | 'grounding' | 'created_at'
  >,
  Omit<ReviewRow, 'findings'>
>;
const _reviewRowOk: _ReviewRowOk = true;
void _reviewRowOk;

export const ConventionEvidenceRowSchema = z
  .object({
    path: z.string(),
    start_line: z.number(),
    end_line: z.number(),
  })
  .passthrough();

type _ConventionEvidenceRowOk = Extends<
  Pick<ConventionCandidate['evidence'][number], 'path' | 'start_line' | 'end_line'>,
  ConventionEvidenceRow
>;
const _conventionEvidenceRowOk: _ConventionEvidenceRowOk = true;
void _conventionEvidenceRowOk;

export const ConventionCandidateRowSchema = z
  .object({
    id: z.string(),
    rule: z.string(),
    confidence: z.number(),
    status: z.enum(['pending', 'accepted', 'rejected']),
    occurrence_files: z.number().nullish(),
    evidence: z.array(ConventionEvidenceRowSchema),
  })
  .passthrough();

type _ConventionCandidateRowOk = Extends<
  Pick<ConventionCandidate, 'id' | 'rule' | 'confidence' | 'status' | 'occurrence_files'>,
  Omit<ConventionCandidateRow, 'evidence'>
>;
const _conventionCandidateRowOk: _ConventionCandidateRowOk = true;
void _conventionCandidateRowOk;

export const ConventionsRowSchema = z
  .object({
    state: z
      .object({
        status: z.enum(['never', 'running', 'done', 'failed']),
        last_scan_at: z.string().nullish(),
      })
      .passthrough(),
    candidates: z.array(ConventionCandidateRowSchema),
  })
  .passthrough();

type _ConventionsStateOk = Extends<
  Pick<ConventionScanState, 'status' | 'last_scan_at'>,
  ConventionsRow['state']
>;
const _conventionsStateOk: _ConventionsStateOk = true;
void _conventionsStateOk;

export const ChangedSymbolRowSchema = z
  .object({
    name: z.string(),
    file: z.string(),
    kind: z.string(),
  })
  .passthrough();

export const BlastCallerRowSchema = z
  .object({
    name: z.string(),
    file: z.string(),
    line: z.number(),
  })
  .passthrough();

export const DownstreamImpactRowSchema = z
  .object({
    symbol: z.string(),
    callers: z.array(BlastCallerRowSchema),
    endpoints_affected: z.array(z.string()),
    crons_affected: z.array(z.string()),
  })
  .passthrough();

export const PrHistoryItemRowSchema = z
  .object({
    pr_number: z.number(),
    title: z.string(),
    merged_at: z.string(),
    author: z.string(),
    files_overlap: z.array(z.string()),
    notes: z.string(),
  })
  .passthrough();

export const BlastRadiusRowSchema = z
  .object({
    changed_symbols: z.array(ChangedSymbolRowSchema),
    downstream: z.array(DownstreamImpactRowSchema),
    summary: z.string(),
    endpoints_affected: z.array(z.string()),
    crons_affected: z.array(z.string()),
    history: z.array(PrHistoryItemRowSchema),
    truncated: z.boolean(),
    degraded: z.boolean(),
    reason: z.string(),
  })
  .passthrough();

type _BlastRadiusRowOk = Extends<
  Pick<
    BlastRadiusResponse,
    | 'changed_symbols'
    | 'downstream'
    | 'summary'
    | 'endpoints_affected'
    | 'crons_affected'
    | 'history'
    | 'truncated'
    | 'degraded'
    | 'reason'
  >,
  BlastRadiusRow
>;
const _blastRadiusRowOk: _BlastRadiusRowOk = true;
void _blastRadiusRowOk;
