import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSuiteRunRecord } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { EvalRecentRunsTable } from "./EvalRecentRunsTable";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function makeRun(overrides: Partial<EvalSuiteRunRecord> = {}): EvalSuiteRunRecord {
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

const NAMES: Record<string, string> = { "agent-1": "Security Reviewer", "agent-2": "Performance Reviewer" };
const agentNameFor = (id: string) => NAMES[id] ?? id;

function renderTable(runs: { run: EvalSuiteRunRecord; agentId: string }[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalRecentRunsTable runs={runs} agentNameFor={agentNameFor} />
    </NextIntlClientProvider>,
  );
}

describe("EvalRecentRunsTable", () => {
  it("renders a row per run with its agent, version, three metrics and pass tally", () => {
    renderTable([{ run: makeRun(), agentId: "agent-1" }]);

    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(row).getByText("82%")).toBeInTheDocument();
    expect(within(row).getByText("91%")).toBeInTheDocument();
    expect(within(row).getByText("95%")).toBeInTheDocument();
    expect(within(row).getByText("17/20")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "v7" })).toHaveAttribute("href", "/evals/agent-1");
  });

  it("names its columns", () => {
    renderTable([{ run: makeRun(), agentId: "agent-1" }]);

    const header = screen.getAllByRole("row")[0]!;
    for (const label of ["Agent", "Ran at", "Version", "Recall", "Precision", "Citation", "Pass"]) {
      expect(within(header).getByText(label)).toBeInTheDocument();
    }
  });

  it("never turns an agent name into a link, so the dashboard's own agent links stay unambiguous", () => {
    renderTable([
      { run: makeRun({ id: "a" }), agentId: "agent-1" },
      { run: makeRun({ id: "b" }), agentId: "agent-2" },
    ]);

    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Security Reviewer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Performance Reviewer" })).not.toBeInTheDocument();
  });

  it("renders a dash and never a 0% for a metric the run did not compute", () => {
    renderTable([{ run: makeRun({ recall: null }), agentId: "agent-1" }]);

    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).queryByText("0%")).not.toBeInTheDocument();
    expect(row.querySelectorAll("[data-metric-bar='true']")).toHaveLength(2);
    expect(row.querySelectorAll("[data-metric-bar='false']")).toHaveLength(1);
  });

  it("states there are no runs rather than rendering an empty table", () => {
    renderTable([]);

    expect(screen.getByText("No runs yet. Create an eval case and run it.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
