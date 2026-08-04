/* SeverityFilterBar — the PR-wide "3 CRITICAL · 5 WARNING · 2 SUGGESTION" row
   and the single-select toggle behind it.
   Spec: specs/2026-08-01-findings-by-severity.md */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityFilterBar } from "./SeverityFilterBar";

afterEach(cleanup);

const COUNTS = { CRITICAL: 3, WARNING: 5, SUGGESTION: 2 };

function renderBar(
  props: Partial<React.ComponentProps<typeof SeverityFilterBar>> = {},
) {
  const onSelect = props.onSelect ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityFilterBar counts={COUNTS} active={null} onSelect={onSelect} {...props} />
    </NextIntlClientProvider>,
  );
  return { onSelect };
}

describe("SeverityFilterBar", () => {
  it("renders a labelled chip with a count per severity", () => {
    renderBar();
    for (const [sev, n] of Object.entries(COUNTS)) {
      const chip = screen.getByLabelText(new RegExp(`${n} active ${sev} findings`));
      expect(chip).toHaveTextContent(sev);
      expect(chip).toHaveTextContent(String(n));
    }
  });

  it("renders all three levels even at zero — an absent chip and a 0 chip differ", () => {
    renderBar({ counts: { CRITICAL: 0, WARNING: 2, SUGGESTION: 0 } });
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("SUGGESTION")).toBeInTheDocument();
  });

  it("selects a severity on click", () => {
    const { onSelect } = renderBar();
    fireEvent.click(screen.getByLabelText(/3 active CRITICAL findings/));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("clicking the active severity clears the filter (single-select toggle)", () => {
    const { onSelect } = renderBar({ active: "WARNING" });
    fireEvent.click(screen.getByLabelText(/Showing WARNING only/));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("switches directly between levels without an intermediate clear", () => {
    const { onSelect } = renderBar({ active: "WARNING" });
    fireEvent.click(screen.getByLabelText(/3 active CRITICAL findings/));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("does not fire for a severity with no findings", () => {
    const { onSelect } = renderBar({ counts: { CRITICAL: 0, WARNING: 2, SUGGESTION: 0 } });
    fireEvent.click(screen.getByLabelText(/0 active CRITICAL findings/));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
