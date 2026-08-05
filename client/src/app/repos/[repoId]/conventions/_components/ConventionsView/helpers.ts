import type { ConventionCandidate, ConventionScanState } from "@devdigest/shared";
import { relativeTime } from "@/lib/time";

export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function acceptedIds(candidates: readonly ConventionCandidate[]): string[] {
  return candidates.filter((c) => c.status === "accepted").map((c) => c.id);
}

export interface SubtitleChipsInput {
  state: ConventionScanState;
  sampleLabel: (count: number) => string;
  droppedLabel: (kept: number, dropped: number) => string;
  costLabel: (cost: string, tokens: string) => string;
  lastScanLabel: (ago: string) => string;
}

/**
 * A chip is omitted when the scan did not measure it. Null means "not
 * measured", so rendering `$0.00` or "0 dropped" would present an absent
 * measurement as a real one.
 */
export function subtitleChips(input: SubtitleChipsInput): string[] {
  const { state } = input;
  const chips: string[] = [];

  if (state.sampled_files > 0) chips.push(input.sampleLabel(state.sampled_files));
  if (state.dropped_count > 0) {
    chips.push(input.droppedLabel(state.candidate_count, state.dropped_count));
  }
  if (state.cost_usd != null) {
    chips.push(input.costLabel(formatCost(state.cost_usd), formatTokens(state)));
  }
  if (state.last_scan_at) chips.push(input.lastScanLabel(relativeTime(state.last_scan_at)));

  return chips;
}

function formatCost(cost: number): string {
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

function formatTokens(state: ConventionScanState): string {
  const total = (state.tokens_in ?? 0) + (state.tokens_out ?? 0);
  return total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total);
}
