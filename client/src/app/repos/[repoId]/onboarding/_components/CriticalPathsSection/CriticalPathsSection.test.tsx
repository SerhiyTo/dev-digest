import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { CriticalPathsSection } from "./CriticalPathsSection";

afterEach(cleanup);

function section(overrides: Partial<OnboardingSection> = {}): OnboardingSection {
  return {
    kind: "critical_paths",
    title: "Critical paths",
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
      <CriticalPathsSection section={sec} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("CriticalPathsSection", () => {
  it("renders one row per structured entry with an encoded Open link, and no duplicate body list", () => {
    renderSection(
      section({
        body: "- src/app.ts — entrypoint",
        critical_paths: [
          { path: "src/app.ts", reason: "Boots the server" },
          { path: "src/db/index.ts", reason: "Owns the pool" },
        ],
      }),
    );

    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("Boots the server")).toBeInTheDocument();
    expect(screen.getByText("src/db/index.ts")).toBeInTheDocument();
    expect(screen.getByText("Owns the pool")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(document.querySelector(".dd-md")).not.toBeInTheDocument();

    const openLinks = screen.getAllByRole("link", { name: "Open" });
    expect(openLinks).toHaveLength(2);
    expect(openLinks[0]).toHaveAttribute("href", "/repos/r1/files?path=src%2Fapp.ts");
    expect(openLinks[1]).toHaveAttribute("href", "/repos/r1/files?path=src%2Fdb%2Findex.ts");
  });

  it("renders body alone when no structured payload is present", () => {
    renderSection(section({ body: "General notes on hot paths.", critical_paths: null }));

    expect(screen.getByText("General notes on hot paths.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
  });

  it("shows the section's empty state at zero surviving entries", () => {
    renderSection(section({ body: "", critical_paths: [] }));

    expect(screen.getByText("No critical paths were identified.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
  });
});
