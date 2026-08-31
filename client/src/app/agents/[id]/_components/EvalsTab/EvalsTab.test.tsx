import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseRecord, EvalRunRecord, EvalSuiteRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";

const state: {
  cases: EvalCaseRecord[];
  runs: EvalSuiteRunRecord[];
  caseRuns: EvalRunRecord[];
} = { cases: [], runs: [], caseRuns: [] };

vi.mock("@/lib/hooks/evals", () => ({
  useEvalCases: () => ({
    data: { cases: state.cases },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useEvalSuiteRuns: () => ({
    data: { runs: state.runs },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useEvalSuiteRun: () => ({ data: { runs: state.caseRuns }, isLoading: false, isError: false }),
  useCreateEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useRunEvalCase: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

const { EvalsTab } = await import("./EvalsTab");

const DONE_RUN: EvalSuiteRunRecord = {
  id: "suite-1",
  agent_id: "agent-1",
  agent_version: 3,
  status: "done",
  started_at: "2026-08-29T00:00:00Z",
  finished_at: "2026-08-29T00:01:00Z",
  cases_total: 1,
  cases_passed: 1,
  recall: 0.8,
  precision: 0.5,
  citation_accuracy: 1,
  cost_usd: 0.012,
  duration_ms: 60_000,
};

const CASE: EvalCaseRecord = {
  id: "case-1",
  owner_kind: "agent",
  owner_id: "agent-1",
  name: "stripe-key-leak",
  input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n",
  input_files: null,
  input_meta: null,
  expected_output: [],
  notes: null,
  source_finding_id: null,
  expectation_kinds: ["must_find"],
  last_run_at: "2026-08-29T00:00:00Z",
  last_run_pass: true,
  created_at: "2026-08-28T00:00:00Z",
};

const CASE_RUN: EvalRunRecord = {
  id: "run-1",
  case_id: "case-1",
  case_name: "stripe-key-leak",
  suite_run_id: "suite-1",
  agent_version: 3,
  ran_at: "2026-08-29T00:00:00Z",
  actual_output: { findings: [{}, {}] },
  pass: true,
  recall: 0.8,
  precision: 0.5,
  citation_accuracy: 1,
  duration_ms: 1000,
  cost_usd: 0.012,
};

beforeEach(() => {
  state.cases = [];
  state.runs = [];
  state.caseRuns = [];
});

afterEach(cleanup);

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalsTab agentId="agent-1" />
    </NextIntlClientProvider>,
  );
}

describe("EvalsTab", () => {
  it("offers case creation for an agent that owns zero cases", () => {
    renderTab();

    expect(
      screen.getByText(
        "No eval cases yet. Create one to assert this agent's expected findings on a sample diff.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();

    const createButtons = screen.getAllByRole("button", { name: "New eval case" });
    expect(createButtons.length).toBeGreaterThan(0);
    fireEvent.click(createButtons[createButtons.length - 1]!);

    const editor = screen.getByRole("dialog");
    expect(within(editor).getByText("New eval case")).toBeInTheDocument();
    expect(within(editor).getByLabelText("Name")).toBeInTheDocument();
  });

  it("lists the agent's cases and links out to the eval dashboard", () => {
    state.cases = [CASE];
    state.runs = [DONE_RUN];

    renderTab();

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute(
      "href",
      "/evals/agent-1",
    );
  });

  it("summarises the latest completed run as four metric cards above the cases", () => {
    state.cases = [CASE];
    state.runs = [DONE_RUN];

    renderTab();

    expect(document.body.textContent).toMatch(/80%/);
    expect(document.body.textContent).toMatch(/50%/);
    expect(document.body.textContent).toMatch(/100%/);
    expect(screen.getByText("1/1")).toBeInTheDocument();
  });

  it("keeps the trend and the run history on the dashboard page", () => {
    state.cases = [CASE];
    state.runs = [DONE_RUN];

    renderTab();

    expect(screen.getByText("Eval metrics")).toBeInTheDocument();
    expect(screen.getByText("Eval cases")).toBeInTheDocument();
    expect(screen.queryByText("Metric trend")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent runs")).not.toBeInTheDocument();
  });

  it("reads the got-finding counts from the latest completed suite run", () => {
    state.cases = [CASE];
    state.runs = [DONE_RUN];
    state.caseRuns = [CASE_RUN];

    renderTab();

    expect(screen.getByText("expected 0 findings, got 2")).toBeInTheDocument();
  });
});
