import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/eval.json";
import { EvalMetricsSummary } from "./EvalMetricsSummary";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const CURRENT = { recall: 0.82, precision: 0.91, citation_accuracy: 0.95 };
const PREVIOUS = { recall: 0.78, precision: 0.93, citation_accuracy: 0.94 };

describe("EvalMetricsSummary", () => {
  it("renders the three metrics plus the traces tally, and links to the full dashboard", () => {
    renderWithIntl(
      <EvalMetricsSummary
        agentId="agent-1"
        current={CURRENT}
        previous={null}
        tally={{ passed: 17, total: 20 }}
        hasCompletedRun
      />,
    );

    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("PRECISION")).toBeInTheDocument();
    expect(screen.getByText("CITATION ACCURACY")).toBeInTheDocument();
    expect(screen.getByText("TRACES PASSED")).toBeInTheDocument();

    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
    expect(screen.getByText("17/20")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute(
      "href",
      "/evals/agent-1",
    );
  });

  it("states there is no previous run and draws no delta with a single completed run", () => {
    renderWithIntl(
      <EvalMetricsSummary
        agentId="agent-1"
        current={CURRENT}
        previous={null}
        tally={{ passed: 17, total: 20 }}
        hasCompletedRun
      />,
    );

    expect(screen.getByText("No previous run to compare against")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pts/);
  });

  it("reports each delta in points against the previous run", () => {
    renderWithIntl(
      <EvalMetricsSummary
        agentId="agent-1"
        current={CURRENT}
        previous={PREVIOUS}
        tally={{ passed: 17, total: 20 }}
        hasCompletedRun
      />,
    );

    expect(screen.getByText("+4 pts")).toBeInTheDocument();
    expect(screen.getByText("-2 pts")).toBeInTheDocument();
    expect(screen.getByText("+1 pts")).toBeInTheDocument();
    expect(screen.queryByText("No previous run to compare against")).not.toBeInTheDocument();
  });

  it("says a metric was not computed instead of rendering a fabricated percentage", () => {
    renderWithIntl(
      <EvalMetricsSummary
        agentId="agent-1"
        current={{ recall: null, precision: null, citation_accuracy: null }}
        previous={null}
        tally={null}
        hasCompletedRun
      />,
    );

    expect(screen.getAllByText("not computed").length).toBe(4);
    expect(document.body.textContent).not.toMatch(/%/);
  });

  it("draws no metric row at all for an agent that has never completed a run", () => {
    renderWithIntl(
      <EvalMetricsSummary
        agentId="agent-1"
        current={{ recall: null, precision: null, citation_accuracy: null }}
        previous={null}
        tally={null}
        hasCompletedRun={false}
      />,
    );

    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.queryByText("RECALL")).not.toBeInTheDocument();
    expect(screen.queryByText("TRACES PASSED")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/%/);
  });
});
