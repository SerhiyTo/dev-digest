import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, Severity } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "WARNING",
    category: "bug",
    title: "N+1 query in user list",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "Loop issues one query per user.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

const REVIEW: ReviewRecord = {
  id: "rev-1",
  pr_id: "pr-1",
  agent_id: "ag-1",
  run_id: "run-1",
  agent_name: "Performance Reviewer",
  kind: "review",
  verdict: "comment",
  summary: "One perf issue.",
  score: 64,
  model: "gpt-4.1",
  created_at: "2026-08-02T00:00:00.000Z",
  findings: [finding({})],
} as ReviewRecord;

function renderAccordion(severity: Severity | null, defaultOpen = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <ReviewRunAccordion
        review={REVIEW}
        prId="pr-1"
        defaultOpen={defaultOpen}
        severity={severity}
      />
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion — severity filter", () => {
  it("stays collapsed with no filter", () => {
    renderAccordion(null);
    expect(screen.queryByText("N+1 query in user list")).not.toBeInTheDocument();
  });

  it("expands itself when a severity filter is applied", () => {
    const { rerender } = renderAccordion(null);
    expect(screen.queryByText("N+1 query in user list")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ReviewRunAccordion review={REVIEW} prId="pr-1" defaultOpen={false} severity="WARNING" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
  });

  it("mounts already expanded when the filter is set up front", () => {
    renderAccordion("WARNING", true);
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
  });
});
