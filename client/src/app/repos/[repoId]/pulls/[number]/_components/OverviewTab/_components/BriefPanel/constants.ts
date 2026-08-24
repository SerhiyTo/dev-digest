import type { IconName } from "@devdigest/ui";
import type { MergeRiskBand } from "@/lib/brief";

export const DEFAULT_MERGE_RISK: MergeRiskBand = "low";
export const RISKS_ICON: IconName = "AlertTriangle";
export const REGENERATE_ICON: IconName = "RefreshCw";

export const DEGRADED_REASONS = new Set([
  "no_data",
  "no_files",
  "flag_off",
  "index_failed",
  "index_partial",
  "repo_too_large",
]);
