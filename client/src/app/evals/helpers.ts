import type { EvalDashboard, EvalSuiteRunRecord } from "@devdigest/shared";
import type { AgentSuiteRuns } from "@/lib/hooks/evals";
import { completedRunsNewestFirst } from "@/lib/evals";

export const RECENT_RUNS_LIMIT = 8;

export function agentRowTestId(agentName: string): string {
  const slug = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `eval-agent-${slug}`;
}

export interface EvalAgentRowRun {
  agentVersion: number | null;
  ranAt: string;
  casesPassed: number | null;
  casesTotal: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
}

export function latestRunFromDashboard(dashboard: EvalDashboard): EvalAgentRowRun | null {
  const [mostRecentCaseRun] = dashboard.recent_runs;
  if (!mostRecentCaseRun) return null;
  return {
    agentVersion: mostRecentCaseRun.agent_version,
    ranAt: mostRecentCaseRun.ran_at,
    casesPassed: dashboard.current.traces_passed,
    casesTotal: dashboard.current.traces_total,
    recall: dashboard.current.recall,
    precision: dashboard.current.precision,
    citationAccuracy: dashboard.current.citation_accuracy,
  };
}

export interface RecentRunAcrossAgents {
  run: EvalSuiteRunRecord;
  agentId: string;
}

export function recentRunsAcrossAgents(
  perAgent: AgentSuiteRuns[],
  limit = RECENT_RUNS_LIMIT,
): RecentRunAcrossAgents[] {
  return perAgent
    .flatMap(({ agentId, runs }) =>
      completedRunsNewestFirst(runs).map((run) => ({ run, agentId })),
    )
    .sort((a, b) => Date.parse(b.run.started_at) - Date.parse(a.run.started_at))
    .slice(0, limit);
}
