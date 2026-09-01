import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";
import { EvalDashboardHeader, type EvalDashboardHeaderProps } from "./EvalDashboardHeader";

afterEach(cleanup);

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Security Reviewer",
    description: "Finds security defects",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "",
    output_schema: null,
    enabled: true,
    version: 7,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    ...overrides,
  };
}

function renderHeader(overrides: Partial<EvalDashboardHeaderProps> = {}) {
  const props: EvalDashboardHeaderProps = {
    agent: agent(),
    agents: [agent(), agent({ id: "agent-2", name: "Performance Reviewer" })],
    runCount: 5,
    caseCount: 20,
    range: 30,
    onRangeChange: vi.fn(),
    onSelectAgent: vi.fn(),
    onRunEval: vi.fn(),
    runActive: false,
    startPending: false,
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalDashboardHeader {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("EvalDashboardHeader", () => {
  it("names the agent, its model and the size of the harness", () => {
    renderHeader();

    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(
      screen.getByText("Regression harness · 5 runs on the 20-case gold set"),
    ).toBeInTheDocument();
  });

  it("links out to the agent tab that owns the eval cases", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: "Configure eval cases →" })).toHaveAttribute(
      "href",
      "/agents/agent-1?tab=evals",
    );
  });

  it("uses the singular run form for a single run", () => {
    renderHeader({ runCount: 1 });
    expect(
      screen.getByText("Regression harness · 1 run on the 20-case gold set"),
    ).toBeInTheDocument();
  });

  it("navigates to another agent's dashboard from the switcher", () => {
    const props = renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Security Reviewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Performance Reviewer" }));

    expect(props.onSelectAgent).toHaveBeenCalledWith("agent-2");
  });

  it("shows the active range and changes it from the range picker", () => {
    const props = renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    fireEvent.click(screen.getByRole("button", { name: "All time" }));

    expect(props.onRangeChange).toHaveBeenCalledWith(null);
  });

  it("starts a suite run", () => {
    const props = renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Run eval (20)" }));
    expect(props.onRunEval).toHaveBeenCalled();
  });

  it("blocks a second start while a run is already in flight", () => {
    renderHeader({ runActive: true });

    const button = screen.getByRole("button", { name: "Running…" });
    expect(button).toBeDisabled();
  });
});
