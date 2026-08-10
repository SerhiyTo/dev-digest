/**
 * Re-scan decision carry-over. A rescan replaces the repo's rows, but a rule
 * the user already triaged keeps its verdict — resetting accept/reject on every
 * scan would discard the exact work the page just asked for.
 */
import type { ConventionStatus } from '@devdigest/shared';
import { normaliseRule } from './grounding.js';

export interface PriorDecision {
  rule: string;
  status: ConventionStatus;
}

export function mergeDecisions<T extends { rule: string }>(
  prior: readonly PriorDecision[],
  incoming: readonly T[],
): (T & { status: ConventionStatus })[] {
  const byRule = new Map<string, ConventionStatus>();
  for (const decision of prior) byRule.set(normaliseRule(decision.rule), decision.status);

  return incoming.map((candidate) => ({
    ...candidate,
    status: byRule.get(normaliseRule(candidate.rule)) ?? 'pending',
  }));
}
