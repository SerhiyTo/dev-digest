import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { OPEN_DELAY_MS } from "./constants";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (...args: unknown[]) => usePrReviews(...args),
}));

import { FindingsHoverCard } from "./FindingsHoverCard";

const REVIEWS = [
  {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "ag",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "s",
    score: 38,
    model: "gpt-4.1",
    created_at: "2026-08-02T00:00:00.000Z",
    findings: [
      {
        id: "f2",
        review_id: "rev-1",
        severity: "WARNING",
        category: "perf",
        title: "N+1 query in user list endpoint",
        file: "src/api/users.ts",
        start_line: 45,
        end_line: 52,
        rationale: "The loop calls findMany once per user.",
        suggestion: null,
        confidence: 0.86,
        kind: "finding",
        accepted_at: null,
        dismissed_at: null,
      },
      {
        id: "f1",
        review_id: "rev-1",
        severity: "CRITICAL",
        category: "security",
        title: "Hardcoded Stripe secret key in commit",
        file: "src/config.ts",
        start_line: 12,
        end_line: 12,
        rationale: "Line 12 contains a literal starting with sk_live_.",
        suggestion: null,
        confidence: 0.98,
        kind: "finding",
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
] as unknown as ReviewRecord[];

beforeEach(() => {
  vi.useFakeTimers();
  usePrReviews.mockReturnValue({ data: REVIEWS, isLoading: false, isError: false });
});

afterEach(() => {
  vi.useRealTimers();
  usePrReviews.mockReset();
  push.mockReset();
  cleanup();
});

function renderCard(props: Partial<React.ComponentProps<typeof FindingsHoverCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsHoverCard
        prId="pr-1"
        repoId="r1"
        prNumber={482}
        repoFullName="acme/payments-api"
        headSha="abc123"
        {...props}
      >
        <span>counters</span>
      </FindingsHoverCard>
    </NextIntlClientProvider>,
  );
}

function hoverIn() {
  fireEvent.mouseEnter(screen.getByText("counters").parentElement!);
  act(() => {
    vi.advanceTimersByTime(OPEN_DELAY_MS + 10);
  });
}

describe("FindingsHoverCard", () => {
  it("stays closed until the hover intent delay elapses", () => {
    renderCard();
    fireEvent.mouseEnter(screen.getByText("counters").parentElement!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(OPEN_DELAY_MS + 10);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("does not fetch until it is actually open", () => {
    renderCard();
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1", { enabled: false });
    hoverIn();
    expect(usePrReviews).toHaveBeenLastCalledWith("pr-1", { enabled: true });
  });

  it("lists every finding, worst severity first, with the total in the header", () => {
    renderCard();
    hoverIn();
    expect(screen.getByRole("tooltip")).toHaveTextContent("2 findings");
    const titles = screen
      .getAllByText(/Hardcoded Stripe secret key|N\+1 query/)
      .map((el) => el.textContent);
    expect(titles).toEqual([
      "Hardcoded Stripe secret key in commit",
      "N+1 query in user list endpoint",
    ]);
  });

  it("shows file:line and links it to the pinned GitHub blob", () => {
    renderCard();
    hoverIn();
    const link = screen.getByText("src/config.ts:12").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/config.ts#L12",
    );
    expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderCard();
    hoverIn();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("never opens for a PR that was never reviewed", () => {
    renderCard({ disabled: true });
    hoverIn();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows an empty message when the PR has no findings", () => {
    usePrReviews.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderCard();
    hoverIn();
    expect(screen.getByRole("tooltip")).toHaveTextContent("No findings recorded");
  });

  it("opens the finding on the PR page when a row is clicked", () => {
    renderCard();
    hoverIn();
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key in commit"));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482?tab=findings&finding=f1", {
      scroll: false,
    });
  });

  it("opens the finding from the keyboard", () => {
    renderCard();
    hoverIn();
    const row = screen.getByText("N+1 query in user list endpoint").closest("[role='button']")!;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482?tab=findings&finding=f2", {
      scroll: false,
    });
  });

  it("stays open while scrolling inside the card, so long lists stay reachable", () => {
    renderCard();
    hoverIn();
    const card = screen.getByRole("tooltip");
    fireEvent.scroll(card);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("closes when the page behind it scrolls", () => {
    renderCard();
    hoverIn();
    fireEvent.scroll(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("surfaces a load failure instead of an empty card", () => {
    usePrReviews.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderCard();
    hoverIn();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Couldn’t load findings.");
  });
});
