import type {
  BlastRadiusResponse,
  Intent,
  IntentEvidenceKind,
  PrBriefGenerationState,
  PrBriefResponse,
} from '@devdigest/shared';
import { PrBrief } from '@devdigest/shared';
import {
  deriveMergeRisk,
  type GeneratedFileSummary,
  type GeneratedReviewFocusRow,
  type GeneratedRisk,
} from './domain.js';
import type { BriefDocumentRow, BriefGenerationRow, BriefIntentRow } from './ports.js';

function toContractIntent(row: BriefIntentRow | undefined): Intent {
  if (!row) {
    return { intent: '', in_scope: [], out_of_scope: [], risk_areas: [], evidence: [], confidence: null };
  }
  return {
    intent: row.intent,
    in_scope: [...row.inScope],
    out_of_scope: [...row.outOfScope],
    risk_areas: row.riskAreas.map((area) => ({ label: area.label, severity: area.severity })),
    evidence: row.evidence.map((item) => ({
      kind: item.kind as IntentEvidenceKind,
      detail: item.detail,
      weight: item.weight,
    })),
    confidence: row.confidence,
  };
}

export interface BuildBriefDocumentInput {
  summary: string;
  risks: readonly GeneratedRisk[];
  reviewFocus: readonly GeneratedReviewFocusRow[];
  fileSummaries: readonly GeneratedFileSummary[];
  intent: BriefIntentRow | undefined;
  blast: BlastRadiusResponse;
  headSha: string;
  model: string;
  reviewModels: readonly string[];
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

export function buildBriefDocument(input: BuildBriefDocumentInput): PrBrief {
  const mergeRisk = deriveMergeRisk(input.risks);
  return {
    intent: toContractIntent(input.intent),
    blast: {
      changed_symbols: input.blast.changed_symbols,
      downstream: input.blast.downstream,
      summary: input.blast.summary,
    },
    risks: { risks: [...input.risks] },
    history: { history: [...input.blast.history] },
    summary: input.summary,
    merge_risk: mergeRisk,
    review_focus: [...input.reviewFocus],
    file_summaries: [...input.fileSummaries],
    degraded_reason: input.blast.reason.length > 0 ? input.blast.reason : null,
    truncated: input.blast.truncated,
    head_sha: input.headSha,
    model: input.model,
    review_models: [...input.reviewModels],
    tokens_in: input.tokensIn ?? undefined,
    tokens_out: input.tokensOut ?? undefined,
    cost_usd: input.costUsd,
  };
}

function toGenerationState(row: BriefGenerationRow | undefined): PrBriefGenerationState | null {
  if (!row) return null;
  return {
    status: row.status,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    error: row.error,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export interface BuildBriefResponseInput {
  storedBrief: BriefDocumentRow | undefined;
  generation: BriefGenerationRow | undefined;
  currentHeadSha: string;
}

export function buildBriefResponse(input: BuildBriefResponseInput): PrBriefResponse {
  const generation = toGenerationState(input.generation);
  if (!input.storedBrief) {
    return { brief: null, generation, stale: false };
  }
  const brief = PrBrief.parse(input.storedBrief.json);
  const stale = input.storedBrief.headSha !== input.currentHeadSha;
  return { brief, generation, stale };
}
