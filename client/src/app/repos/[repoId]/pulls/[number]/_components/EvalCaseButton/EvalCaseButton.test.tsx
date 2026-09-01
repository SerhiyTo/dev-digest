import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { EvalCaseButton } from "./EvalCaseButton";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("EvalCaseButton", () => {
  it("disables the control for an undecided finding and enables it once accepted or dismissed", () => {
    const { rerender } = renderWithIntl(
      <EvalCaseButton acceptedAt={null} dismissedAt={null} onCreate={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /turn into eval case/i })).toBeDisabled();
    expect(screen.getByText(/accept or dismiss this finding first/i)).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <EvalCaseButton acceptedAt="2026-08-30T00:00:00Z" dismissedAt={null} onCreate={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: /turn into eval case/i })).not.toBeDisabled();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <EvalCaseButton acceptedAt={null} dismissedAt="2026-08-30T00:00:00Z" onCreate={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: /turn into eval case/i })).not.toBeDisabled();
  });

  it("shows a confirmation naming the created case, and offers a way to open it, after onCreate resolves", async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: "case-1", name: "SQL injection in login" });
    const onOpen = vi.fn();
    renderWithIntl(
      <EvalCaseButton
        acceptedAt="2026-08-30T00:00:00Z"
        dismissedAt={null}
        onCreate={onCreate}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /turn into eval case/i }));
    expect(await screen.findByText(/SQL injection in login/)).toBeInTheDocument();
    expect(onCreate).toHaveBeenCalledTimes(1);

    const open = screen.getByRole("button", { name: /open eval case/i });
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledWith("case-1");
  });
});
