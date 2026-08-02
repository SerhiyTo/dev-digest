/* SeverityCounts — the shared "⊘2 ⚠1" cluster. Covers the three data states
   (unreviewed / clean / has findings) and the read-only variant.
   Spec: app specs/2026-08-01-findings-by-severity.md */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { SeverityCounts } from "./SeverityCounts";

afterEach(cleanup);

function renderCounts(props: Partial<React.ComponentProps<typeof SeverityCounts>>) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityCounts counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("SeverityCounts", () => {
  it("renders only the non-zero levels", () => {
    renderCounts({});
    expect(screen.getByLabelText(/2 active CRITICAL findings/)).toBeInTheDocument();
    expect(screen.getByLabelText(/1 active WARNING finding\b/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/SUGGESTION/)).not.toBeInTheDocument();
  });

  it("renders a dash for a PR that was never reviewed", () => {
    renderCounts({ counts: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders 0 for a reviewed PR with nothing outstanding", () => {
    renderCounts({ counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } });
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("renders non-interactive text when no handler is supplied", () => {
    renderCounts({});
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("does not bubble the click to a clickable ancestor row", () => {
    const onSelect = vi.fn();
    const onRowClick = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <div onClick={onRowClick}>
          <SeverityCounts
            counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 0 }}
            onSelect={onSelect}
          />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByLabelText(/2 active CRITICAL findings/));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
