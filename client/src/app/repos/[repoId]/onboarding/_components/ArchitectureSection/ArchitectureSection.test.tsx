import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ArchitectureSection } from "./ArchitectureSection";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mermaidMocks = vi.hoisted(() => {
  const state: { valid: boolean; svg: string } = {
    valid: true,
    svg: '<svg data-testid="diagram-svg"></svg>',
  };
  const initialize = vi.fn();
  const parse = vi.fn(async () => state.valid);
  const render = vi.fn(async () => ({ svg: state.svg }));
  return { state, initialize, parse, render };
});

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidMocks.initialize,
    parse: mermaidMocks.parse,
    render: mermaidMocks.render,
  },
}));

const mermaidState = mermaidMocks.state;
const mermaidRender = mermaidMocks.render;

function section(overrides: Partial<OnboardingSection> = {}): OnboardingSection {
  return {
    kind: "architecture",
    title: "Architecture",
    body: "# System\n\nThe API talks to Postgres.",
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
      <ArchitectureSection section={sec} />
    </NextIntlClientProvider>,
  );
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ArchitectureSection", () => {
  it("renders the prose and the diagram when the diagram is valid mermaid", async () => {
    mermaidState.valid = true;
    renderSection(section({ diagram: "flowchart TD\n  A --> B" }));

    expect(screen.getByRole("heading", { name: "System" })).toBeInTheDocument();
    expect(await screen.findByTestId("diagram-svg")).toBeInTheDocument();
  });

  it("renders the prose without a diagram panel or error graphic when the diagram is invalid", async () => {
    mermaidState.valid = false;
    renderSection(section({ diagram: "flowchart TD\n  A --> B" }));

    expect(screen.getByRole("heading", { name: "System" })).toBeInTheDocument();
    await flushMicrotasks();

    expect(screen.queryByTestId("diagram-svg")).not.toBeInTheDocument();
    expect(mermaidRender).not.toHaveBeenCalled();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("shows the section's empty state when no body was generated", () => {
    renderSection(section({ body: "" }));
    expect(screen.getByText("No architecture overview was generated.")).toBeInTheDocument();
  });
});
