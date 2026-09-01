import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseRecord, EvalExpectation } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import { EvalCaseList } from "./EvalCaseList";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function makeExpectation(overrides: Partial<EvalExpectation> = {}): EvalExpectation {
  return {
    kind: "must_find",
    file: "src/config.ts",
    line: 10,
    end_line: null,
    category: "security",
    severity: "CRITICAL",
    title_contains: null,
    ...overrides,
  };
}

function makeCase(overrides: Partial<EvalCaseRecord>): EvalCaseRecord {
  return {
    id: "case-1",
    owner_kind: "agent",
    owner_id: "agent-1",
    name: "stripe-key-leak",
    input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n",
    input_files: null,
    input_meta: null,
    expected_output: [],
    notes: null,
    source_finding_id: null,
    expectation_kinds: ["must_find"],
    last_run_at: null,
    last_run_pass: null,
    created_at: "2026-08-30T00:00:00Z",
    ...overrides,
  };
}

describe("EvalCaseList", () => {
  it("gives every case a status icon whose accessible name states pass, fail or never run", () => {
    renderWithIntl(
      <EvalCaseList
        cases={[
          makeCase({ id: "p", name: "passed-case", last_run_at: "2026-08-29T00:00:00Z", last_run_pass: true }),
          makeCase({ id: "f", name: "failed-case", last_run_at: "2026-08-29T00:00:00Z", last_run_pass: false }),
          makeCase({ id: "n", name: "never-run-case" }),
        ]}
        onCreate={vi.fn()}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    const passedRow = screen.getByText("passed-case").closest("li")!;
    expect(within(passedRow).getByRole("img", { name: "Passed" })).toBeInTheDocument();

    const failedRow = screen.getByText("failed-case").closest("li")!;
    expect(within(failedRow).getByRole("img", { name: "Failed" })).toBeInTheDocument();

    const neverRunRow = screen.getByText("never-run-case").closest("li")!;
    expect(within(neverRunRow).getByRole("img", { name: "Never run" })).toBeInTheDocument();
  });

  it("counts the passing cases in the header badge", () => {
    renderWithIntl(
      <EvalCaseList
        cases={[
          makeCase({ id: "a", name: "a", last_run_at: "2026-08-29T00:00:00Z", last_run_pass: true }),
          makeCase({ id: "b", name: "b", last_run_at: "2026-08-29T00:00:00Z", last_run_pass: true }),
          makeCase({ id: "c", name: "c", last_run_at: "2026-08-29T00:00:00Z", last_run_pass: false }),
        ]}
        onCreate={vi.fn()}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("2 / 3 passing")).toBeInTheDocument();
  });

  it("states what a case expected and what the last suite run actually returned", () => {
    renderWithIntl(
      <EvalCaseList
        cases={[makeCase({ id: "case-1", name: "stripe-key-leak", expected_output: [makeExpectation()] })]}
        gotFindingCountByCase={new Map([["case-1", 1]])}
        onCreate={vi.fn()}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
  });

  it("omits the got clause entirely for a case the latest suite run did not cover", () => {
    renderWithIntl(
      <EvalCaseList
        cases={[makeCase({ id: "case-1", name: "stripe-key-leak", expected_output: [makeExpectation()] })]}
        gotFindingCountByCase={new Map()}
        onCreate={vi.fn()}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("expected 1 finding")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/got/);
  });

  it("chips the first expectation's severity and category, and marks an empty expectation list as empty", () => {
    renderWithIntl(
      <EvalCaseList
        cases={[
          makeCase({ id: "a", name: "with-expectation", expected_output: [makeExpectation()] }),
          makeCase({ id: "b", name: "no-expectation", expected_output: [] }),
        ]}
        onCreate={vi.fn()}
        onRun={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const withExpectation = screen.getByText("with-expectation").closest("li")!;
    expect(within(withExpectation).getByText("CRITICAL · security")).toBeInTheDocument();

    const withoutExpectation = screen.getByText("no-expectation").closest("li")!;
    expect(within(withoutExpectation).getByText("empty []")).toBeInTheDocument();
  });

  it("shows a create-offering empty state when the agent owns no cases", () => {
    const onCreate = vi.fn();
    renderWithIntl(<EvalCaseList cases={[]} onCreate={onCreate} onRun={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByText(/No eval cases yet/)).toBeInTheDocument();

    const createButtons = screen.getAllByRole("button", { name: "New eval case" });
    expect(createButtons).toHaveLength(2);
    fireEvent.click(createButtons[1]!);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("wires run, edit and delete actions per case", () => {
    const onRun = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderWithIntl(
      <EvalCaseList
        cases={[makeCase({ id: "case-runnable", name: "runnable-case" })]}
        onCreate={vi.fn()}
        onRun={onRun}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onRun).toHaveBeenCalledWith("case-runnable");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith("case-runnable");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("case-runnable");
  });

  it("disables Run and renames it while that case is in flight", () => {
    const onRun = vi.fn();

    renderWithIntl(
      <EvalCaseList
        cases={[makeCase({ id: "case-runnable", name: "runnable-case" })]}
        runningCaseId="case-runnable"
        onCreate={vi.fn()}
        onRun={onRun}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Running…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
    expect(onRun).not.toHaveBeenCalled();
  });
});
