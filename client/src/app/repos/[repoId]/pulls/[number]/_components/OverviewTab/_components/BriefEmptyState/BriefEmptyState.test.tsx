import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { BriefEmptyState } from "./BriefEmptyState";

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ brief: messages }}>{ui}</NextIntlClientProvider>);
}

afterEach(cleanup);

describe("BriefEmptyState", () => {
  it("names generation as the deliberate paid trigger and no other trigger", () => {
    renderWithIntl(<BriefEmptyState onGenerate={vi.fn()} />);

    expect(screen.getByText("Brief not available yet.")).toBeInTheDocument();
    const hint = screen.getByText(/press generate/i);
    expect(hint.textContent).not.toMatch(/review/i);
    expect(hint.textContent).not.toMatch(/open the pr/i);
  });

  it("renders an enabled Generate control and calls onGenerate on click", () => {
    const onGenerate = vi.fn();
    renderWithIntl(<BriefEmptyState onGenerate={onGenerate} />);

    const button = screen.getByRole("button", { name: "Generate brief" });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("disables the Generate control when disabled is true", () => {
    const onGenerate = vi.fn();
    renderWithIntl(<BriefEmptyState onGenerate={onGenerate} disabled />);

    const button = screen.getByRole("button", { name: "Generate brief" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
