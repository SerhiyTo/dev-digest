import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/skills.json";
import { CreateSkillModal } from "./CreateSkillModal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithProviders() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <CreateSkillModal onClose={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function fill(placeholder: RegExp, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
}

const NAME_PLACEHOLDER = /^pr-quality-rubric$/;
const BODY_PLACEHOLDER = /Describe the rule/;

describe("CreateSkillModal", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps submit disabled and issues no request while the body the server requires is empty", () => {
    renderWithProviders();
    fill(NAME_PLACEHOLDER, "pr-quality-rubric");

    const submit = screen.getByRole("button", { name: /Create skill/ });
    expect(submit).toBeDisabled();

    fireEvent.click(submit);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server error instead of swallowing the rejection", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: { message: "name: String must contain at least 1 character(s)" } }),
    });

    renderWithProviders();
    fill(NAME_PLACEHOLDER, "pr-quality-rubric");
    fill(BODY_PLACEHOLDER, "# Rule\nList uncovered branches.");

    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));

    await waitFor(() => {
      expect(screen.getByText("Could not create the skill")).toBeInTheDocument();
    });
    expect(screen.getByText("name: String must contain at least 1 character(s)")).toBeInTheDocument();
  });
});
