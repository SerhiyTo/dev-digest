import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, Risk } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { BriefVerdictStrip, type BriefVerdictStripReview } from "./BriefVerdictStrip";
import { OPEN_DELAY_MS } from "./_components/BlockingReasonsCard/constants";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    review_id: "review-1",
    severity: "CRITICAL",
    category: "bug",
    title: "Finding",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "why",
    confidence: 0.9,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function reviewRecord(findings: FindingRecord[], overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "review-1",
    pr_id: "pr-1",
    agent_id: "agent-1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Introduces a hardcoded secret.",
    score: 42,
    model: "claude-5-sonnet",
    grounding: null,
    created_at: "2026-08-20T09:00:00.000Z",
    findings,
    ...overrides,
  } as ReviewRecord;
}

function stripReview(
  findings: FindingRecord[],
  overrides: Partial<ReviewRecord> = {},
): BriefVerdictStripReview {
  const review = reviewRecord(findings, overrides);
  return {
    verdict: review.verdict!,
    summary: review.summary,
    score: review.score,
    findingsCount: review.findings.length,
    review,
    ciFailOn: "critical",
  };
}

function risk(o: Partial<Risk> = {}): Risk {
  return {
    kind: "security",
    title: "risk title",
    explanation: "why it matters",
    severity: "high",
    file_refs: ["src/risky.ts:10-14"],
    ...o,
  } as Risk;
}

describe("BriefVerdictStrip — with a review", () => {
  it("renders the verdict label, review summary, finding/blocker counts and the score alongside the merge-risk band (AC-6, AC-83)", () => {
    renderWithIntl(
      <BriefVerdictStrip
        summary="Fallback brief summary."
        mergeRisk="high"
        review={stripReview([finding({ title: "Hardcoded secret" })])}
        risks={[]}
      />,
    );

    expect(screen.getByText("Merge risk: High")).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("Introduces a hardcoded secret.")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows the info control when at least one blocking reason exists (AC-86)", () => {
    renderWithIntl(
      <BriefVerdictStrip
        summary="s"
        mergeRisk="low"
        review={stripReview([finding({ title: "Hardcoded secret" })])}
        risks={[]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Why this may not be safe to merge" }),
    ).toBeInTheDocument();
  });

  it("omits the info control when there are no blocking reasons (AC-86)", () => {
    renderWithIntl(
      <BriefVerdictStrip summary="s" mergeRisk="low" review={stripReview([])} risks={[]} />,
    );
    expect(
      screen.queryByRole("button", { name: "Why this may not be safe to merge" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the badge count and the opened list's row count in sync after a dismissal (AC-85)", () => {
    vi.useFakeTimers();
    const dismissed = finding({
      id: "d1",
      title: "Dismissed finding",
      dismissed_at: "2026-08-24T00:00:00.000Z",
    });
    const active = finding({ id: "a1", title: "Active finding" });
    renderWithIntl(
      <BriefVerdictStrip
        summary="s"
        mergeRisk="medium"
        review={stripReview([dismissed, active])}
        risks={[]}
      />,
    );

    expect(screen.getByText(/2 findings · 1 blockers/)).toBeInTheDocument();

    const control = screen.getByRole("button", { name: "Why this may not be safe to merge" });
    fireEvent.focus(control);
    act(() => {
      vi.advanceTimersByTime(OPEN_DELAY_MS + 10);
    });

    const card = screen.getByRole("tooltip");
    expect(within(card).getByText("Active finding")).toBeInTheDocument();
    expect(within(card).queryByText("Dismissed finding")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("states the disagreement when the verdict approves but merge risk is high (AC-92)", () => {
    renderWithIntl(
      <BriefVerdictStrip
        summary="s"
        mergeRisk="high"
        review={stripReview([], { verdict: "approve", summary: "Looks safe overall.", score: 90 })}
        risks={[]}
      />,
    );
    expect(
      screen.getByText("The review says Approve, the brief rates merge risk High."),
    ).toBeInTheDocument();
  });

  it("omits the disagreement sentence when the judgements agree", () => {
    renderWithIntl(
      <BriefVerdictStrip
        summary="s"
        mergeRisk="medium"
        review={stripReview([], { verdict: "approve" })}
        risks={[]}
      />,
    );
    expect(screen.queryByText(/The review says/)).not.toBeInTheDocument();
  });

  it("renders the cost line beneath the score column when a review's score renders the donut (AC-96)", () => {
    renderWithIntl(
      <BriefVerdictStrip
        summary="s"
        mergeRisk="low"
        review={stripReview([])}
        risks={[]}
        cost={{ tokensIn: 12000, tokensOut: 800, costUsd: 0.014 }}
      />,
    );
    expect(screen.getByText(`12,000 in · 800 out · ${formatCost(0.014)}`)).toBeInTheDocument();
  });
});

describe("BriefVerdictStrip — without a review", () => {
  it("renders the brief summary and the merge-risk band, omitting label, counts and the score (AC-7, AC-83)", () => {
    renderWithIntl(
      <BriefVerdictStrip summary="No review has run yet." mergeRisk="medium" risks={[]} />,
    );

    expect(screen.getByText("No review has run yet.")).toBeInTheDocument();
    const bandLabel = screen.getByText("Merge risk: Medium");
    expect(bandLabel).toBeInTheDocument();
    expect(bandLabel.textContent?.toLowerCase()).not.toContain("score");

    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings ·/)).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
  });

  it("labels the band with a word distinct from the score label, for every band", () => {
    (["low", "medium", "high"] as const).forEach((band) => {
      const { unmount } = renderWithIntl(
        <BriefVerdictStrip summary="s" mergeRisk={band} risks={[]} />,
      );
      expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
      unmount();
    });
  });

  it("renders the cost line as the last element of the main column without a donut (AC-96)", () => {
    renderWithIntl(
      <BriefVerdictStrip
        summary="s"
        mergeRisk="low"
        risks={[]}
        cost={{ tokensIn: 500, tokensOut: 40, costUsd: null }}
      />,
    );
    expect(screen.getByText("500 in · 40 out")).toBeInTheDocument();
  });
});
