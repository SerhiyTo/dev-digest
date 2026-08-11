import { SEV, type Severity } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

export const RISK_SEVERITY: Record<RiskSeverity, Severity> = {
  high: "CRITICAL",
  medium: "WARNING",
  low: "SUGGESTION",
};

export function riskToken(severity: RiskSeverity) {
  return SEV[RISK_SEVERITY[severity]];
}
