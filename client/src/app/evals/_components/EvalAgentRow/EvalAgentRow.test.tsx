import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { EvalAgentRow } from "./EvalAgentRow";
import type { EvalAgentRowRun } from "../../helpers";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

const TREND: EvalTrendPoint[] = [
  { ran_at: "2026-05-27T00:00:00Z", recall: 0.7, precision: 0.9, citation_accuracy: 0.9, pass_rate: 0.8, cost_usd: null },
  { ran_at: "2026-05-29T00:00:00Z", recall: 0.82, precision: 0.91, citation_accuracy: 0.95, pass_rate: 0.85, cost_usd: null },
];

function renderRow(latestRun: EvalAgentRowRun | null, caseCount = 8, trend: EvalTrendPoint[] = TREND) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <ul>
        <EvalAgentRow
          agentId="agent-1"
          agentName="Security Reviewer"
          model="gpt-4.1"
          caseCount={caseCount}
          latestRun={latestRun}
          trend={trend}
        />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe("EvalAgentRow", () => {
  it("renders the agent's latest run — three metrics, model, version, time and passed-of-total", () => {
    renderRow({
      agentVersion: 7,
      ranAt: "2026-05-29T09:14:00Z",
      casesPassed: 17,
      casesTotal: 20,
      recall: 0.82,
      precision: 0.91,
      citationAccuracy: 0.95,
    });

    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Precision")).toBeInTheDocument();
    expect(screen.getByText("Citation")).toBeInTheDocument();
    expect(screen.getByText(/Last run v7/)).toBeInTheDocument();
    expect(screen.getByText(/17\/20 passed/)).toBeInTheDocument();
    expect(screen.queryByText("never run")).not.toBeInTheDocument();
  });

  it("makes the agent name the only link into its dashboard, so its accessible name is exactly the agent name", () => {
    renderRow({
      agentVersion: 7,
      ranAt: "2026-05-29T09:14:00Z",
      casesPassed: 17,
      casesTotal: 20,
      recall: 0.82,
      precision: 0.91,
      citationAccuracy: 0.95,
    });

    expect(screen.getByRole("link", { name: "Security Reviewer" })).toHaveAttribute(
      "href",
      "/evals/agent-1",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("renders a not-computed metric as a dash rather than 0% on a run that did compute the others", () => {
    renderRow({
      agentVersion: 2,
      ranAt: "2026-05-29T09:14:00Z",
      casesPassed: 1,
      casesTotal: 2,
      recall: null,
      precision: 0.5,
      citationAccuracy: null,
    });

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows never-run for an agent that owns cases but has no completed run, with no percentage anywhere", () => {
    const { container } = renderRow(null, 3);

    expect(screen.getByRole("link", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/%/);
    expect(screen.queryByText("Recall")).not.toBeInTheDocument();
  });

  it("offers a create affordance and no percentage at all for an agent that owns no eval cases", () => {
    const { container } = renderRow(null, 0);

    expect(screen.getByRole("link", { name: "Security Reviewer" })).toHaveAttribute(
      "href",
      "/evals/agent-1",
    );
    expect(screen.getByText(/No runs yet\. Create an eval case and run it\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configure eval cases →" })).toHaveAttribute(
      "href",
      "/agents/agent-1?tab=evals",
    );
    expect(container.textContent).not.toMatch(/%/);
  });
});
