import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../../../../../messages/en/brief.json";
import type { BlockingReason } from "../../helpers";
import { OPEN_DELAY_MS } from "./constants";
import { BlockingReasonsCard } from "./BlockingReasonsCard";

function reason(o: Partial<BlockingReason> = {}): BlockingReason {
  return {
    severity: "CRITICAL",
    title: "Hardcoded Stripe secret key in commit",
    ref: { path: "src/config.ts", startLine: 12, endLine: 12 },
    ...o,
  };
}

const RATIONALE_TEXT = "The loop calls findMany once per user, causing N+1 queries.";
const EXPLANATION_TEXT = "This endpoint has no auth guard, so any caller can invoke it.";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function renderCard(props: Partial<React.ComponentProps<typeof BlockingReasonsCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <BlockingReasonsCard reasons={[reason()]} {...props}>
        <span>trigger</span>
      </BlockingReasonsCard>
    </NextIntlClientProvider>,
  );
}

function hoverIn() {
  fireEvent.mouseEnter(screen.getByText("trigger").parentElement!);
  act(() => {
    vi.advanceTimersByTime(OPEN_DELAY_MS + 10);
  });
}

function focusIn() {
  fireEvent.focus(screen.getByText("trigger").parentElement!);
  act(() => {
    vi.advanceTimersByTime(OPEN_DELAY_MS + 10);
  });
}

describe("BlockingReasonsCard", () => {
  it("renders a tooltip-role card on hover, listing severity and title with no rationale or explanation", () => {
    renderCard();
    hoverIn();
    const card = screen.getByRole("tooltip");
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("Hardcoded Stripe secret key in commit");
    expect(card.textContent).not.toContain(RATIONALE_TEXT);
    expect(card.textContent).not.toContain(EXPLANATION_TEXT);
  });

  it("opens on keyboard focus, not only on hover", () => {
    renderCard();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    focusIn();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderCard();
    hoverIn();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders the card through a portal, outside the anchor's own subtree", () => {
    const { container } = renderCard();
    hoverIn();
    const card = screen.getByRole("tooltip");
    expect(container.contains(card)).toBe(false);
    expect(document.body.contains(card)).toBe(true);
  });

  it("links the reference to GitHub when repoFullName and headSha are both known", () => {
    renderCard({ repoFullName: "acme/payments-api", headSha: "abc123" });
    hoverIn();
    const link = screen.getByText("src/config.ts:12").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/config.ts#L12",
    );
  });

  it("renders the reference as plain mono text, not a link, without repoFullName/headSha", () => {
    renderCard();
    hoverIn();
    expect(screen.getByText("src/config.ts:12").closest("a")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the overflow line once there are more than 8 reasons", () => {
    const nineReasons = Array.from({ length: 9 }, (_, i) =>
      reason({ title: `finding ${i}`, ref: { path: `src/f${i}.ts`, startLine: 1, endLine: 1 } }),
    );
    renderCard({ reasons: nineReasons });
    hoverIn();
    const card = screen.getByRole("tooltip");
    expect(card).toHaveTextContent("1 more not shown");
    expect(screen.queryByText("finding 8")).not.toBeInTheDocument();
  });

  it("omits the overflow line at 8 or fewer reasons", () => {
    renderCard();
    hoverIn();
    expect(screen.queryByText(/more not shown/)).not.toBeInTheDocument();
  });

  it("shows the empty message when it opens with nothing in it", () => {
    renderCard({ reasons: [] });
    hoverIn();
    expect(screen.getByRole("tooltip")).toHaveTextContent("No blocking reasons.");
  });
});
