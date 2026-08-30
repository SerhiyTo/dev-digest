import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { RunLocallySection } from "./RunLocallySection";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BASE_SECTION: OnboardingSection = {
  kind: "run_locally",
  title: "How to run locally",
  body: "Run `pnpm install` then `pnpm dev`.",
  diagram: null,
  links: [],
  run_locally: null,
};

describe("RunLocallySection", () => {
  it("copies a command verbatim, confirms visibly, and renders no control besides copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithIntl(
      <RunLocallySection
        section={{
          ...BASE_SECTION,
          run_locally: [{ command: "pnpm install # installs deps", note: "Run once" }],
        }}
      />,
    );

    expect(screen.getByText("pnpm install # installs deps")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: messages.copy.action }));

    expect(writeText).toHaveBeenCalledWith("pnpm install # installs deps");
    expect(await screen.findByRole("button", { name: messages.copy.copied })).toBeInTheDocument();
  });

  it("reports a denied clipboard write inline and leaves the command selectable", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithIntl(
      <RunLocallySection section={{ ...BASE_SECTION, run_locally: [{ command: "pnpm dev" }] }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: messages.copy.action }));

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.copy.failed);
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.copy.action })).toBeInTheDocument();
  });

  it("renders body alone when no steps were structured, and an empty state at zero entries", () => {
    renderWithIntl(<RunLocallySection section={BASE_SECTION} />);
    expect(screen.getByText(/pnpm install/)).toBeInTheDocument();

    cleanup();
    renderWithIntl(<RunLocallySection section={{ ...BASE_SECTION, run_locally: [] }} />);
    expect(screen.getByText(messages.sections.run_locally.empty)).toBeInTheDocument();
  });
});
