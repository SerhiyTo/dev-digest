import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboardingMessages from "../../../../../../../messages/en/onboarding.json";
import commonMessages from "../../../../../../../messages/en/common.json";

const mutate = vi.fn();
let isPending = false;

vi.mock("@/lib/hooks/onboarding", () => ({
  useGenerateOnboarding: () => ({ mutate, isPending }),
}));

const { RegenerateButton } = await import("./RegenerateButton");

function renderButton(props: Partial<{ repoId: string; model: string; disabled?: boolean }> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages, common: commonMessages }}>
      <RegenerateButton repoId="acme/payments-api" model="gpt-5" {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockClear();
  isPending = false;
});
afterEach(cleanup);

describe("RegenerateButton", () => {
  it("confirms before regenerating, names the model in the confirmation, and fires no mutation when dismissed", () => {
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("gpt-5");

    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^regenerate$/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("disables the trigger while a generation is already running", () => {
    isPending = true;
    renderButton();
    expect(screen.getByRole("button", { name: /regenerating/i })).toBeDisabled();
  });
});
