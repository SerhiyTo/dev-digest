import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";
import { EvalMetricCards } from "./EvalMetricCards";
import type { EvalMetricSnapshot } from "@/lib/evals";

afterEach(cleanup);

const COMPUTED: EvalMetricSnapshot = { recall: 0.82, precision: 0.91, citation_accuracy: 0.95 };
const NOT_COMPUTED: EvalMetricSnapshot = { recall: null, precision: null, citation_accuracy: null };

const TREND: EvalTrendPoint[] = [
  { ran_at: "2026-08-27T00:00:00Z", recall: 0.78, precision: 0.93, citation_accuracy: 0.94, pass_rate: 0.8, cost_usd: 0.21 },
  { ran_at: "2026-08-29T00:00:00Z", recall: 0.82, precision: 0.91, citation_accuracy: 0.95, pass_rate: 0.85, cost_usd: 0.23 },
];

function renderCards(
  current: EvalMetricSnapshot,
  previous: EvalMetricSnapshot | null,
  hasCompletedRun = true,
  trend: EvalTrendPoint[] = TREND,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalMetricCards
        current={current}
        previous={previous}
        trend={trend}
        hasCompletedRun={hasCompletedRun}
      />
    </NextIntlClientProvider>,
  );
}

describe("EvalMetricCards", () => {
  it("renders a card per metric with its rounded percentage", () => {
    renderCards(COMPUTED, null);

    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("PRECISION")).toBeInTheDocument();
    expect(screen.getByText("CITATION ACCURACY")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("states there is no previous run and shows no delta when only one run has completed", () => {
    const { container } = renderCards(COMPUTED, null);

    expect(screen.getByText("No previous run to compare against")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/0\.\d\d/);
  });

  it("shows the delta against the previous run once there is one", () => {
    renderCards(COMPUTED, { recall: 0.78, precision: 0.93, citation_accuracy: 0.94 });

    expect(screen.queryByText("No previous run to compare against")).not.toBeInTheDocument();
    expect(screen.getByText("+4 pts")).toBeInTheDocument();
    expect(screen.getByText("-2 pts")).toBeInTheDocument();
    expect(screen.getByText("+1 pts")).toBeInTheDocument();
  });

  it("renders no percentage at all for a metric with no denominator", () => {
    const { container } = renderCards(NOT_COMPUTED, null);

    expect(screen.getAllByText("not computed")).toHaveLength(3);
    expect(container.textContent).not.toMatch(/%/);
  });

  it("renders no metric row at all for an agent that has never run", () => {
    const { container } = renderCards(NOT_COMPUTED, null, false, []);

    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.queryByText("RECALL")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/%/);
  });
});
