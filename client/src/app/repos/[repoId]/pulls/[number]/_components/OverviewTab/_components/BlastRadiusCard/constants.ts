export const METHOD_TOKEN: Record<string, { c: string; bg: string }> = {
  GET: { c: "var(--accent)", bg: "var(--accent-bg)" },
  HEAD: { c: "var(--accent)", bg: "var(--accent-bg)" },
  OPTIONS: { c: "var(--accent)", bg: "var(--accent-bg)" },
  POST: { c: "var(--accent)", bg: "var(--accent-bg)" },
  PUT: { c: "var(--warn)", bg: "var(--warn-bg)" },
  PATCH: { c: "var(--warn)", bg: "var(--warn-bg)" },
  DELETE: { c: "var(--crit)", bg: "var(--crit-bg)" },
};

export const METHOD_FALLBACK = { c: "var(--info)", bg: "var(--info-bg)" };
export const CRON_TOKEN = { c: "var(--warn)", bg: "var(--warn-bg)" };

export const DEGRADED_REASONS = new Set([
  "no_data",
  "no_files",
  "flag_off",
  "index_failed",
  "index_partial",
  "repo_too_large",
]);

export const PR_STATUS_NOTES = new Set([
  "needs_review",
  "reviewed",
  "stale",
  "open",
  "closed",
  "merged",
]);
