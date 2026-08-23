import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

const SPECS_BLOCK = [
  '<untrusted source="spec-0">',
  "specs/2026-08-20-project-context.md",
  "",
  "# Project Context",
  "A reviewer agent reads the project's own written intent.",
  "</untrusted>",
  "",
  '<untrusted source="spec-1">',
  "docs/architecture.md",
  "",
  "# Architecture",
  "The review engine is pure.",
  "</untrusted>",
].join("\n");

const SPECS_READ = ["specs/2026-08-20-project-context.md", "docs/architecture.md"];

const SPECS_LABEL = "Project context — attached specs (untrusted)";

const BASE_TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 0, grounding: "2/2 passed" },
  prompt_assembly: {
    system: "You are a reviewer.",
    skills: null,
    memory: null,
    specs: null,
    callers: null,
    repo_map: null,
    pr_description: null,
    intent: null,
    user: "## Diff to review",
  },
  tool_calls: [],
  raw_output: '{"verdict":"approve"}',
  memory_pulled: [],
  specs_read: [],
  log: [],
};

const WITH_CONTEXT: RunTrace = {
  ...BASE_TRACE,
  prompt_assembly: { ...BASE_TRACE.prompt_assembly, specs: SPECS_BLOCK },
  specs_read: SPECS_READ,
};

function renderTrace(trace: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">
        <TraceBody trace={trace} findings={[]} />
      </div>
    </NextIntlClientProvider>,
  );
}

function openPromptAssembly() {
  fireEvent.click(screen.getByText("Prompt assembly"));
}

function specsReadRow() {
  return screen.getByText("Specs read").parentElement as HTMLElement;
}

afterEach(cleanup);

describe("TraceBody — project context (L05)", () => {
  it("labels the segment as untrusted attached specs and shows the block as sent (AC-45, AC-46)", () => {
    renderTrace(WITH_CONTEXT);
    openPromptAssembly();

    const label = screen.getByText(SPECS_LABEL);
    expect(label).toBeInTheDocument();

    fireEvent.click(label);

    const block = screen.getByText(SPECS_BLOCK, { normalizer: (v) => v });
    expect(block.textContent).toBe(WITH_CONTEXT.prompt_assembly.specs);
  });

  it("offers copy and fullscreen on the segment (AC-46)", () => {
    renderTrace(WITH_CONTEXT);
    openPromptAssembly();

    const segment = screen.getByText(SPECS_LABEL).parentElement as HTMLElement;
    expect(within(segment).getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(within(segment).getByRole("button", { name: "Open fullscreen" })).toBeInTheDocument();
  });

  it("lists the injected paths under Specs read, in injection order (AC-47)", () => {
    renderTrace(WITH_CONTEXT);

    const row = specsReadRow();
    for (const path of SPECS_READ) {
      expect(within(row).getByText(path)).toBeInTheDocument();
    }
    expect(within(row).queryByText("none")).not.toBeInTheDocument();
    expect(row.textContent).toContain(SPECS_READ.join(""));
  });

  it("omits the segment and shows the Specs read none state when nothing was injected (AC-48)", () => {
    renderTrace(BASE_TRACE);
    openPromptAssembly();

    expect(screen.queryByText(SPECS_LABEL)).not.toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(within(specsReadRow()).getByText("none")).toBeInTheDocument();
  });
});
