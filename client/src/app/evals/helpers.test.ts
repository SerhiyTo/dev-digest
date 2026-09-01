import { describe, it, expect } from "vitest";
import type { EvalDashboard, EvalRunRecord, EvalSuiteRunRecord } from "@devdigest/shared";
import { agentRowTestId, latestRunFromDashboard, recentRunsAcrossAgents } from "./helpers";

function makeCaseRun(overrides: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    id: "run-1",
    case_id: "case-1",
    case_name: null,
    suite_run_id: "suite-1",
    agent_version: 7,
    ran_at: "2026-05-29T09:14:00Z",
    actual_output: null,
    pass: true,
    recall: null,
    precision: null,
    citation_accuracy: null,
    duration_ms: null,
    cost_usd: null,
    ...overrides,
  };
}

function makeDashboard(overrides: Partial<EvalDashboard> = {}): EvalDashboard {
  return {
    owner_kind: "agent",
    owner_id: "agent-1",
    cases_total: 20,
    current: {
      recall: 0.82,
      precision: 0.91,
      citation_accuracy: 0.95,
      traces_passed: 17,
      traces_total: 20,
      cost_usd: 0.5,
    },
    delta: { recall: null, precision: null, citation_accuracy: null },
    trend: [],
    recent_runs: [makeCaseRun()],
    alert: null,
    ...overrides,
  };
}

function makeSuiteRun(overrides: Partial<EvalSuiteRunRecord>): EvalSuiteRunRecord {
  return {
    id: "suite-1",
    agent_id: "agent-1",
    agent_version: 7,
    status: "done",
    started_at: "2026-05-29T09:14:00Z",
    finished_at: "2026-05-29T09:15:00Z",
    cases_total: 20,
    cases_passed: 17,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    cost_usd: 0.5,
    duration_ms: 60_000,
    ...overrides,
  };
}

describe("latestRunFromDashboard", () => {
  it("takes the suite metrics from current and the version and time from the newest case row", () => {
    expect(latestRunFromDashboard(makeDashboard())).toEqual({
      agentVersion: 7,
      ranAt: "2026-05-29T09:14:00Z",
      casesPassed: 17,
      casesTotal: 20,
      recall: 0.82,
      precision: 0.91,
      citationAccuracy: 0.95,
    });
  });

  it("reports no run at all when the dashboard carries no case rows", () => {
    expect(latestRunFromDashboard(makeDashboard({ recent_runs: [] }))).toBeNull();
  });
});

describe("recentRunsAcrossAgents", () => {
  it("interleaves every agent's runs newest first and tags each with its agent", () => {
    const merged = recentRunsAcrossAgents([
      {
        agentId: "agent-a",
        runs: [
          makeSuiteRun({ id: "a-old", started_at: "2026-05-25T11:02:00Z" }),
          makeSuiteRun({ id: "a-new", started_at: "2026-05-29T09:14:00Z" }),
        ],
      },
      { agentId: "agent-b", runs: [makeSuiteRun({ id: "b-mid", started_at: "2026-05-28T13:20:00Z" })] },
    ]);

    expect(merged.map((entry) => entry.run.id)).toEqual(["a-new", "b-mid", "a-old"]);
    expect(merged.map((entry) => entry.agentId)).toEqual(["agent-a", "agent-b", "agent-a"]);
  });

  it("leaves out every run that did not complete", () => {
    const merged = recentRunsAcrossAgents([
      {
        agentId: "agent-a",
        runs: [
          makeSuiteRun({ id: "running", status: "running" }),
          makeSuiteRun({ id: "cancelled", status: "cancelled" }),
          makeSuiteRun({ id: "failed", status: "failed" }),
          makeSuiteRun({ id: "done" }),
        ],
      },
    ]);

    expect(merged.map((entry) => entry.run.id)).toEqual(["done"]);
  });

  it("caps the merged list at the requested limit", () => {
    const runs = Array.from({ length: 5 }, (_, i) =>
      makeSuiteRun({ id: `run-${i}`, started_at: `2026-05-2${i}T00:00:00Z` }),
    );

    expect(recentRunsAcrossAgents([{ agentId: "agent-a", runs }], 2)).toHaveLength(2);
  });

  it("returns nothing when no agent has run anything", () => {
    expect(recentRunsAcrossAgents([{ agentId: "agent-a", runs: [] }])).toEqual([]);
  });
});

describe("agentRowTestId", () => {
  it("slugs the agent name into a stable hook the e2e flow can select on", () => {
    expect(agentRowTestId("Security Reviewer")).toBe("eval-agent-security-reviewer");
    expect(agentRowTestId("API Contract Reviewer")).toBe("eval-agent-api-contract-reviewer");
  });

  it("collapses punctuation and trims the separators it would otherwise leave behind", () => {
    expect(agentRowTestId("  Test/Quality — Reviewer!  ")).toBe("eval-agent-test-quality-reviewer");
  });
});
