import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CONVENTION: ConventionCandidate = {
  id: "c1",
  rule: "Always use async/await instead of .then() chains.",
  evidence: [
    {
      path: "src/api/users.ts",
      start_line: 23,
      end_line: 31,
      snippet: "const user = await db.users.find(id);",
    },
  ],
  occurrence_files: 12,
  confidence: 0.91,
  status: "pending",
};

function renderCard(over: Partial<ConventionCandidate> = {}, handlers: Partial<Handlers> = {}) {
  const onAction = handlers.onAction ?? vi.fn();
  const onEdit = handlers.onEdit ?? vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        convention={{ ...CONVENTION, ...over }}
        onAction={onAction}
        onEdit={onEdit}
        busy={false}
      />
    </NextIntlClientProvider>,
  );
  return { ...view, onAction, onEdit };
}

interface Handlers {
  onAction: (action: "accept" | "reject") => void;
  onEdit: (rule: string) => void;
}

describe("ConventionCard", () => {
  it("leads with the rule and backs it with a file:line citation", () => {
    renderCard();

    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
  });

  it("labels a single-line citation without a range", () => {
    renderCard({
      evidence: [{ path: "src/lib/redis.ts", start_line: 9, end_line: 9, snippet: "x" }],
    });

    expect(screen.getByText("src/lib/redis.ts:9")).toBeInTheDocument();
  });

  it("renders extra citations under an 'Also in' lead", () => {
    renderCard({
      evidence: [
        ...CONVENTION.evidence,
        { path: "src/lib/redis.ts", start_line: 1, end_line: 1, snippet: "y" },
      ],
    });

    expect(screen.getByText("Also in")).toBeInTheDocument();
    expect(screen.getByText("src/lib/redis.ts:1")).toBeInTheDocument();
  });

  it("shows the occurrence chip only when the count was measured", () => {
    renderCard();
    expect(screen.getByText("seen in 12 files")).toBeInTheDocument();

    cleanup();
    renderCard({ occurrence_files: null });
    expect(screen.queryByText(/seen in/)).not.toBeInTheDocument();
  });

  it("reflects the persisted status on the action buttons", () => {
    renderCard({ status: "accepted" });

    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("fires accept and reject with the action name", () => {
    const { onAction } = renderCard();

    screen.getByText("Accept").click();
    expect(onAction).toHaveBeenCalledWith("accept");

    screen.getByText("Reject").click();
    expect(onAction).toHaveBeenCalledWith("reject");
  });

  it("edits the rule and reports only a real change", () => {
    const { onEdit } = renderCard();

    fireEvent.click(screen.getByLabelText("Edit rule"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Prefer async/await." } });
    fireEvent.click(screen.getByText("Save"));

    expect(onEdit).toHaveBeenCalledWith("Prefer async/await.");
  });

  it("does not report an edit that changed nothing", () => {
    const { onEdit } = renderCard();

    fireEvent.click(screen.getByLabelText("Edit rule"));
    fireEvent.click(screen.getByText("Save"));

    expect(onEdit).not.toHaveBeenCalled();
  });
});
