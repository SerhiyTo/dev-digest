import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../../../../messages/en/eval.json";
import { EvalAlertBanner } from "./EvalAlertBanner";
import type { EvalMetricSnapshot } from "@/lib/evals";

afterEach(cleanup);

const CURRENT: EvalMetricSnapshot = { recall: 0.82, precision: 0.89, citation_accuracy: 0.95 };
const PREVIOUS: EvalMetricSnapshot = { recall: 0.78, precision: 0.91, citation_accuracy: 0.94 };

function renderBanner(
  current: EvalMetricSnapshot,
  previous: EvalMetricSnapshot | null,
  alert: string | null = null,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalAlertBanner current={current} previous={previous} alert={alert} />
    </NextIntlClientProvider>,
  );
}

describe("EvalAlertBanner", () => {
  it("names the fallen metric and its magnitude in text, not by colour alone", () => {
    renderBanner(CURRENT, PREVIOUS);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Metrics fell since the last run")).toBeInTheDocument();
    expect(screen.getByText("Precision down 2 pts")).toBeInTheDocument();
  });

  it("says nothing about metrics that improved", () => {
    renderBanner(CURRENT, PREVIOUS);

    expect(screen.queryByText(/Recall down/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Citation down/)).not.toBeInTheDocument();
  });

  it("renders nothing when no metric fell and the server raised no alert", () => {
    const { container } = renderBanner(CURRENT, { ...CURRENT });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no previous run to compare against", () => {
    const { container } = renderBanner(CURRENT, null);
    expect(container).toBeEmptyDOMElement();
  });

  it("surfaces a server-supplied alert even when no metric fell", () => {
    renderBanner(CURRENT, { ...CURRENT }, "A new false positive slipped in on v7.");
    expect(screen.getByText("A new false positive slipped in on v7.")).toBeInTheDocument();
  });
});
