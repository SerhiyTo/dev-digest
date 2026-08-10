import type { PrIntentRecord } from '@devdigest/shared';
import type { IntentPull, IntentRow } from './ports.js';

export function intentRowToRecord(row: IntentRow, pull: IntentPull): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    risk_areas: row.riskAreas,
    evidence: row.evidence,
    confidence: row.confidence,
    model: row.model,
    head_sha: row.headSha,
    computed_at: row.computedAt.toISOString(),
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    stale: row.headSha !== null && row.headSha !== pull.headSha,
  };
}
