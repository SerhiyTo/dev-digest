import type { ReviewRecord, RunSummary, Verdict } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import type { BriefVerdictStripReview } from "../BriefVerdictStrip";
import { DEGRADED_REASONS } from "./constants";

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function degradedReasonKey(reason: string): string {
  return DEGRADED_REASONS.has(reason) ? reason : "unknown";
}

export function latestCompletedReview(reviews: ReviewRecord[] | undefined): ReviewRecord | null {
  return (reviews ?? []).find((review) => review.verdict != null) ?? null;
}

export function stripReviewFrom(
  reviews: ReviewRecord[] | undefined,
  runs: RunSummary[] | undefined,
): BriefVerdictStripReview | null {
  const review = latestCompletedReview(reviews);
  if (!review || review.verdict == null) return null;
  const run = (runs ?? []).find((candidate) => candidate.run_id === review.run_id);
  const verdict: Verdict = review.verdict;
  return {
    verdict,
    summary: review.summary,
    score: review.score,
    findingsCount: review.findings.length,
    review,
    ciFailOn: run?.ci_fail_on ?? null,
  };
}

export function crossModelIds(reviewModels: string[] | undefined): string {
  return (reviewModels ?? []).join(", ");
}
