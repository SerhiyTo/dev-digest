import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ShareLinkButton } from "./ShareLinkButton";

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ShareLinkButton />
    </NextIntlClientProvider>,
  );
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

describe("ShareLinkButton", () => {
  it("copies the current page URL and confirms visibly, with no token and no public URL involved", async () => {
    writeText.mockResolvedValue(undefined);
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: /share link/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Link copied");
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(writeText.mock.calls[0]![0]).not.toContain("token");
  });

  it("reports a denied clipboard write inline and leaves the URL selectable, with no fallback dialog", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: /share link/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn.t copy the link/i);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const urlField = screen.getByRole("textbox") as HTMLInputElement;
    expect(urlField).toHaveValue(window.location.href);
    urlField.focus();
    expect(document.activeElement).toBe(urlField);
  });
});
