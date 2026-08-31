import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord, EvalSuiteRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";
import { EvalRunTable, type EvalRunTableProps } from "./EvalRunTable";

afterEach(cleanup);

function run(overrides: Partial<EvalSuiteRunRecord> = {}): EvalSuiteRunRecord {
  return {
    id: "suite-1",
    agent_id: "agent-1",
    agent_version: 7,
    status: "done",
    started_at: "2026-08-29T09:14:00Z",
    finished_at: "2026-08-29T09:15:00Z",
    cases_total: 20,
    cases_passed: 17,
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    cost_usd: 0.23,
    duration_ms: 60_000,
    ...overrides,
  };
}

const CASE_RUN: EvalRunRecord = {
  id: "case-run-1",
  case_id: "case-1",
  case_name: "stripe-key-leak",
  suite_run_id: "suite-1",
  agent_version: 7,
  ran_at: "2026-08-29T09:14:30Z",
  actual_output: null,
  pass: true,
  recall: 1,
  precision: 1,
  citation_accuracy: 1,
  duration_ms: 500,
  cost_usd: 0.01,
};

function renderTable(overrides: Partial<EvalRunTableProps> = {}) {
  const props: EvalRunTableProps = {
    runs: [run()],
    caseRuns: [],
    selectedRunIds: [],
    expandedRunId: null,
    onToggleSelection: vi.fn(),
    onToggleExpanded: vi.fn(),
    onCancel: vi.fn(),
    onCompare: vi.fn(),
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalRunTable {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("EvalRunTable", () => {
  it("renders a row per run with version, metrics, pass tally and cost", () => {
    renderTable();

    expect(screen.getByText("v7")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("17/20")).toBeInTheDocument();
    expect(screen.getByText("17/20 passed")).toBeInTheDocument();
    expect(screen.getByText("$0.23")).toBeInTheDocument();
  });

  it("states there are no runs yet when the list is empty", () => {
    renderTable({ runs: [] });
    expect(screen.getByText("No runs yet. Create an eval case and run it.")).toBeInTheDocument();
  });

  it("prefers the caller's empty message when a filter emptied the list", () => {
    renderTable({ runs: [], emptyMessage: "No runs in the selected range." });
    expect(screen.getByText("No runs in the selected range.")).toBeInTheDocument();
  });

  it("enables Compare only at exactly two selections", () => {
    cleanup();
    renderTable({ runs: [run(), run({ id: "suite-2" })], selectedRunIds: [] });
    expect(screen.getByRole("button", { name: "Compare selected runs" })).toBeDisabled();

    cleanup();
    renderTable({ runs: [run(), run({ id: "suite-2" })], selectedRunIds: ["suite-1"] });
    expect(screen.getByRole("button", { name: "Compare selected runs" })).toBeDisabled();

    cleanup();
    const props = renderTable({
      runs: [run(), run({ id: "suite-2" })],
      selectedRunIds: ["suite-1", "suite-2"],
    });
    const compare = screen.getByRole("button", { name: "Compare selected runs" });
    expect(compare).toBeEnabled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(compare);
    expect(props.onCompare).toHaveBeenCalled();
  });

  it("offers a selection checkbox only for a completed run", () => {
    renderTable({
      runs: [run(), run({ id: "suite-2", status: "running" }), run({ id: "suite-3", status: "cancelled" })],
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("offers cancellation only while a run is in flight", () => {
    renderTable({ runs: [run({ status: "running" })] });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    cleanup();
    renderTable({ runs: [run()] });
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("labels a cancelled run and shows no aggregate percentage or cost for it", () => {
    renderTable({ runs: [run({ status: "cancelled" })] });

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("82%")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.23")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("draws no metric bar at all for a metric it cannot compute, so an empty track cannot read as 0%", () => {
    renderTable({ runs: [run()] });
    expect(document.querySelectorAll("[data-metric-bar='true']")).toHaveLength(3);

    cleanup();
    renderTable({ runs: [run({ status: "cancelled" })] });
    expect(document.querySelectorAll("[data-metric-bar='true']")).toHaveLength(0);
    expect(document.querySelectorAll("[data-metric-bar='false']")).toHaveLength(3);
  });

  it("keeps a cancelled run's per-case rows readable", () => {
    renderTable({
      runs: [run({ status: "cancelled" })],
      caseRuns: [CASE_RUN],
      expandedRunId: "suite-1",
    });

    expect(screen.getByText("Per-case results")).toBeInTheDocument();
    expect(screen.getByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("pass")).toBeInTheDocument();
  });

  it("toggles the per-case detail from the timestamp cell", () => {
    const props = renderTable();
    const toggle = screen.getByRole("button", { expanded: false });

    fireEvent.click(toggle);
    expect(props.onToggleExpanded).toHaveBeenCalledWith("suite-1");
  });
});
