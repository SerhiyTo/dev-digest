import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ReadingPathSection } from "./ReadingPathSection";

afterEach(cleanup);

function section(overrides: Partial<OnboardingSection> = {}): OnboardingSection {
  return {
    kind: "reading_path",
    title: "Reading order",
    body: "",
    diagram: null,
    links: [],
    critical_paths: null,
    run_locally: null,
    reading_path: null,
    first_tasks: null,
    ...overrides,
  };
}

function renderSection(sec: OnboardingSection) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ReadingPathSection section={sec} />
    </NextIntlClientProvider>,
  );
}

describe("ReadingPathSection", () => {
  it("numbers the steps in the persisted order, not re-sorted", () => {
    renderSection(
      section({
        reading_path: [
          { path: "README.md", rationale: "Start here" },
          { path: "src/app.ts", rationale: "Entry point" },
          { path: "src/db/index.ts", rationale: "Data layer" },
        ],
      }),
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const [first, second, third] = items;
    if (!first || !second || !third) throw new Error("expected three list items");
    expect(within(first).getByText("1")).toBeInTheDocument();
    expect(within(first).getByText("README.md")).toBeInTheDocument();
    expect(within(second).getByText("2")).toBeInTheDocument();
    expect(within(second).getByText("src/app.ts")).toBeInTheDocument();
    expect(within(third).getByText("3")).toBeInTheDocument();
    expect(within(third).getByText("src/db/index.ts")).toBeInTheDocument();
  });

  it("renders body alone when no structured payload is present", () => {
    renderSection(section({ body: "Read the README first, then the entrypoint." }));

    expect(
      screen.getByText("Read the README first, then the entrypoint."),
    ).toBeInTheDocument();
  });

  it("shows the section's empty state at zero surviving entries", () => {
    renderSection(section({ body: "", reading_path: [] }));

    expect(screen.getByText("No reading order was identified.")).toBeInTheDocument();
  });
});
