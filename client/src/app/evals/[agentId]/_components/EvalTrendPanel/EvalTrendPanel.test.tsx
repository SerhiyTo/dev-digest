import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";
import { EvalTrendPanel } from "./EvalTrendPanel";

afterEach(cleanup);

function point(ranAt: string, recall: number | null): EvalTrendPoint {
  return { ran_at: ranAt, recall, precision: 0.9, citation_accuracy: 0.95, pass_rate: 0.85, cost_usd: 0.2 };
}

function renderPanel(trend: EvalTrendPoint[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalTrendPanel trend={trend} />
    </NextIntlClientProvider>,
  );
}

describe("EvalTrendPanel", () => {
  it("states there is nothing to plot when no run has completed", () => {
    renderPanel([]);

    expect(screen.getByText("No completed runs yet.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("carries an accessible textual reading of every plotted point", () => {
    renderPanel([point("2026-08-27T00:00:00Z", 0.78), point("2026-08-29T00:00:00Z", 0.82)]);

    expect(screen.getByText("2 completed runs plotted, oldest to newest")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Recall 78%")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Recall 82%")).toBeInTheDocument();
  });

  it("plots the server's order without re-sorting it", () => {
    renderPanel([point("2026-08-29T00:00:00Z", 0.6), point("2026-08-27T00:00:00Z", 0.9)]);

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Recall 60%")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Recall 90%")).toBeInTheDocument();
  });

  it("renders a dash, never a zero, for a point whose metric has no denominator", () => {
    renderPanel([point("2026-08-29T00:00:00Z", null)]);

    const item = screen.getAllByRole("listitem")[0]!;
    expect(within(item).getByText("Recall —")).toBeInTheDocument();
    expect(within(item).queryByText("Recall 0%")).not.toBeInTheDocument();
  });

  it("labels the panel and its three series", () => {
    renderPanel([point("2026-08-29T00:00:00Z", 0.8)]);

    expect(screen.getByRole("region", { name: "Metric trend" })).toBeInTheDocument();
    expect(screen.getAllByText("Recall").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Precision").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Citation").length).toBeGreaterThan(0);
  });
});
