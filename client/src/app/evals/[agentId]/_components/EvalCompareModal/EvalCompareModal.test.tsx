import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/eval.json";
import { EvalCompareModal, type EvalCompareRunInput } from "./EvalCompareModal";

afterEach(cleanup);

const OLDER: EvalCompareRunInput = {
  runId: "run-older",
  ranAt: "2026-08-01T00:00:00.000Z",
  agentVersion: 3,
  recall: 0.5,
  precision: 0.6,
  citationAccuracy: 0.4,
  costUsd: 0.1,
};

const NEWER: EvalCompareRunInput = {
  runId: "run-newer",
  ranAt: "2026-08-10T00:00:00.000Z",
  agentVersion: 4,
  recall: 0.75,
  precision: 0.55,
  citationAccuracy: 0.45,
  costUsd: 0.15,
};

const PROMPT_DIFF = [
  "@@ -1 +1 @@",
  "-You are a careful reviewer.",
  "+You are a thorough, careful reviewer.",
].join("\n");

function promptPatchBlocks(): HTMLElement[] {
  return screen.queryAllByText(
    (_content, element) => element?.tagName === "PRE" && element.textContent === PROMPT_DIFF,
  );
}

function renderModal(
  runA: EvalCompareRunInput,
  runB: EvalCompareRunInput,
  { promptDiff = PROMPT_DIFF, onClose = vi.fn() }: { promptDiff?: string | null; onClose?: () => void } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalCompareModal runA={runA} runB={runB} promptDiff={promptDiff} onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

describe("EvalCompareModal", () => {
  it("renders the older run on the left regardless of selection order, and closes on Escape", () => {
    const { container: forward, unmount } = renderModal(OLDER, NEWER);
    const forwardText = forward.textContent;
    unmount();

    const onClose = vi.fn();
    const { container: reversed } = renderModal(NEWER, OLDER, { onClose });
    expect(reversed.textContent).toBe(forwardText);

    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("+25 pts")).toBeInTheDocument();
    expect(screen.getByText("-5 pts")).toBeInTheDocument();
    expect(screen.getByText("+5 pts")).toBeInTheDocument();
    expect(screen.getByText("$0.10")).toBeInTheDocument();
    expect(screen.getByText("$0.15")).toBeInTheDocument();
    expect(screen.getByText("+$0.05")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("states the prompt difference is unavailable while still rendering the metric differences", () => {
    renderModal(OLDER, NEWER, { promptDiff: null });

    expect(
      screen.getByText(
        "The prompt used for one of these runs could not be read, so the prompt difference is unavailable.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("+25 pts")).toBeInTheDocument();
    expect(promptPatchBlocks()).toHaveLength(0);
  });

  it("states the configuration did not change when both runs share an agent version", () => {
    renderModal(OLDER, { ...NEWER, agentVersion: OLDER.agentVersion });

    expect(
      screen.getByText("These runs share the same agent configuration — nothing changed between them."),
    ).toBeInTheDocument();
    expect(promptPatchBlocks()).toHaveLength(0);
  });
});

describe("EvalCompareModal — the system-prompt difference (AC-46)", () => {
  it("renders the server-computed prompt patch once when the two versions differ", () => {
    renderModal(OLDER, NEWER);

    expect(screen.getByText("System prompt")).toBeInTheDocument();
    expect(promptPatchBlocks()).toHaveLength(1);
    expect(
      screen.queryByText(
        "The prompt used for one of these runs could not be read, so the prompt difference is unavailable.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("These runs share the same agent configuration — nothing changed between them."),
    ).not.toBeInTheDocument();
  });
});
