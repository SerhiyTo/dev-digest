import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type {
  BlastRadiusResponse,
  PrBrief,
  PrBriefGenerationState,
  PrBriefResponse,
  PrIntentRecord,
  ReviewRecord,
  RunSummary,
} from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/cost";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import blastMessages from "../../../../../../../../../../messages/en/blast.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import commonMessages from "../../../../../../../../../../messages/en/common.json";
import { BriefPanel } from "./BriefPanel";

const generateMutate = vi.fn();
const refetch = vi.fn();

let briefState: { data?: PrBriefResponse; isLoading: boolean; error: unknown };
let generateState: { isPending: boolean };
let reviewsState: { data?: ReviewRecord[] };
let runsState: { data?: RunSummary[] };
let intentState: { data?: PrIntentRecord; isLoading: boolean; error: unknown };
let blastState: { data?: BlastRadiusResponse; isLoading: boolean; error: unknown };
let notComputed: boolean;

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ ...briefState, refetch }),
  useGenerateBrief: () => ({ mutate: generateMutate, isPending: generateState.isPending }),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: reviewsState.data }),
  usePrRuns: () => ({ data: runsState.data }),
}));

vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ ...intentState, refetch: vi.fn() }),
  useComputeIntent: () => ({ mutate: vi.fn(), isPending: false }),
  isNotComputed: () => notComputed,
}));

vi.mock("@/lib/hooks/blast", () => ({
  usePrBlastRadius: () => ({ ...blastState, refetch: vi.fn() }),
}));

const INTENT_RECORD: PrIntentRecord = {
  pr_id: "pr-1",
  intent: "Adds rate limiting to public API endpoints.",
  in_scope: ["Add middleware"],
  out_of_scope: [],
  risk_areas: [],
  evidence: [],
  confidence: 0.5,
  model: "gpt-5.4-nano",
  head_sha: "a1b2c3d",
  computed_at: "2026-08-20T09:00:00.000Z",
  tokens_in: 100,
  tokens_out: 20,
  cost_usd: 0.0001,
  stale: false,
};

const BLAST_RESPONSE: BlastRadiusResponse = {
  changed_symbols: [],
  downstream: [],
  summary: "",
  endpoints_affected: [],
  crons_affected: [],
  history: [],
  truncated: false,
  degraded: false,
  reason: "",
};

const BASE_BRIEF: PrBrief = {
  intent: { intent: "", in_scope: [], out_of_scope: [], risk_areas: [], evidence: [], confidence: null },
  blast: { changed_symbols: [], downstream: [], summary: "" },
  risks: {
    risks: [
      {
        kind: "security",
        title: "Hardcoded secret",
        explanation: "A Stripe key is committed in plaintext.",
        severity: "high",
        file_refs: ["src/config.ts:12"],
      },
    ],
  },
  history: { history: [] },
  summary: "Adds rate limiting to public API endpoints.",
  merge_risk: "medium",
  review_focus: [
    { file: "src/config.ts", start_line: 10, end_line: 14, reason: "Review the hardcoded credential." },
  ],
  file_summaries: [],
  degraded_reason: null,
  truncated: false,
  head_sha: "abcdef1234567890",
  model: "gpt-5.4-mini",
  review_models: [],
  tokens_in: 12000,
  tokens_out: 800,
  cost_usd: 0.014,
};

const DONE_GENERATION: PrBriefGenerationState = {
  status: "done",
  provider: "openai",
  model: "gpt-5.4-mini",
  tokens_in: 12000,
  tokens_out: 800,
  cost_usd: 0.014,
  error: null,
  started_at: "2026-08-20T10:00:00.000Z",
  finished_at: "2026-08-20T10:01:00.000Z",
};

const REVIEW: ReviewRecord = {
  id: "review-1",
  pr_id: "pr-1",
  agent_id: "agent-1",
  run_id: "run-1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "approve",
  summary: "Looks safe overall.",
  score: 82,
  model: "claude-5-sonnet",
  grounding: null,
  created_at: "2026-08-20T09:00:00.000Z",
  findings: [],
};

const RUN: RunSummary = {
  run_id: "run-1",
  agent_id: "agent-1",
  agent_name: "Security Reviewer",
  provider: "anthropic",
  model: "claude-5-sonnet",
  status: "done",
  error: null,
  duration_ms: 4000,
  tokens_in: 500,
  tokens_out: 300,
  cost_usd: 0.01,
  findings_count: 0,
  grounding: null,
  ran_at: "2026-08-20T09:00:00.000Z",
  score: 82,
  blockers: 2,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ brief: briefMessages, blast: blastMessages, prReview: prReviewMessages, common: commonMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  generateMutate.mockClear();
  refetch.mockClear();
  briefState = { data: undefined, isLoading: false, error: null };
  generateState = { isPending: false };
  reviewsState = { data: [] };
  runsState = { data: [] };
  intentState = { data: INTENT_RECORD, isLoading: false, error: null };
  blastState = { data: BLAST_RESPONSE, isLoading: false, error: null };
  notComputed = false;
});
afterEach(cleanup);

describe("BriefPanel — brief rendered", () => {
  it("renders the strip, risks, review focus, intent and blast cards without a review", () => {
    briefState = { data: { brief: BASE_BRIEF, generation: DONE_GENERATION, stale: false }, isLoading: false, error: null };
    renderWithIntl(<BriefPanel prId="pr-1" repoFullName="acme/widgets" headSha="abcdef1234567890" />);

    expect(screen.getByText(BASE_BRIEF.summary!)).toBeInTheDocument();
    expect(screen.getByText("Merge risk: Medium")).toBeInTheDocument();
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();

    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Review focus")).toBeInTheDocument();
    expect(screen.getByText("Review the hardcoded credential.")).toBeInTheDocument();
    expect(screen.getByText(INTENT_RECORD.intent)).toBeInTheDocument();
  });

  it("shows the latest review's verdict and score alongside the merge-risk band, never hiding it (AC-6, AC-83)", () => {
    briefState = { data: { brief: BASE_BRIEF, generation: DONE_GENERATION, stale: false }, isLoading: false, error: null };
    reviewsState = { data: [REVIEW] };
    runsState = { data: [RUN] };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("Merge risk: Medium")).toBeInTheDocument();
  });

  it("computes the live blocker count from the current findings and high risks, not the run's frozen count (AC-85)", () => {
    briefState = { data: { brief: BASE_BRIEF, generation: DONE_GENERATION, stale: false }, isLoading: false, error: null };
    reviewsState = { data: [REVIEW] };
    runsState = { data: [RUN] };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText(/0 findings · 1 blockers/)).toBeInTheDocument();
    expect(screen.queryByText(/2 blockers/)).not.toBeInTheDocument();
  });

  it("still renders every other card when the intent card has no record (AC-4)", () => {
    briefState = { data: { brief: BASE_BRIEF, generation: DONE_GENERATION, stale: false }, isLoading: false, error: null };
    intentState = { data: undefined, isLoading: false, error: new Error("not computed") };
    notComputed = true;
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText("Intent not derived yet.")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Merge risk: Medium")).toBeInTheDocument();
  });

  it("renders the partial, truncated and stale badges", () => {
    briefState = {
      data: {
        brief: { ...BASE_BRIEF, degraded_reason: "no_data", truncated: true },
        generation: DONE_GENERATION,
        stale: true,
      },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText(/Partial/)).toBeInTheDocument();
    expect(screen.getByText(/The repository has not been indexed yet\./)).toBeInTheDocument();
    expect(screen.queryByText(/no_data/)).not.toBeInTheDocument();
    expect(screen.getByText("Truncated")).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("does not leak the raw degraded_reason machine token to the user (AC-31, AC-77)", () => {
    briefState = {
      data: {
        brief: { ...BASE_BRIEF, degraded_reason: "no_data" },
        generation: DONE_GENERATION,
        stale: false,
      },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText(/Partial/)).toBeInTheDocument();
    expect(screen.queryByText(/no_data/)).not.toBeInTheDocument();
  });

  it("names both models in the cross-model note when a review exists, and only its own otherwise (AC-56, AC-57)", () => {
    briefState = {
      data: {
        brief: { ...BASE_BRIEF, review_models: ["claude-5-sonnet"] },
        generation: DONE_GENERATION,
        stale: false,
      },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BriefPanel prId="pr-1" />);
    expect(
      screen.getByText(
        "This brief was written by gpt-5.4-mini. The findings were written by claude-5-sonnet. A different model may reach a different conclusion.",
      ),
    ).toBeInTheDocument();
    cleanup();

    briefState = {
      data: { brief: { ...BASE_BRIEF, review_models: [] }, generation: DONE_GENERATION, stale: false },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BriefPanel prId="pr-1" />);
    expect(
      screen.getByText("This brief was written by gpt-5.4-mini. A different model may reach a different conclusion."),
    ).toBeInTheDocument();
  });

  it("shows the cost and token line for a rendered brief inside the strip, not the footer (AC-51, AC-96)", () => {
    briefState = { data: { brief: BASE_BRIEF, generation: DONE_GENERATION, stale: false }, isLoading: false, error: null };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    const costLine = screen.getByText(`12,000 in · 800 out · ${formatCost(0.014)}`);
    expect(costLine).toBeInTheDocument();

    const footer = screen.getByText(/Generated/).closest("div");
    expect(within(footer!).queryByText(/12,000 in/)).not.toBeInTheDocument();
  });

  it("labels the brief section and keeps the regenerate control's visible label after moving it into the strip (AC-94, AC-95, AC-81)", () => {
    briefState = { data: { brief: BASE_BRIEF, generation: DONE_GENERATION, stale: false }, isLoading: false, error: null };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeInTheDocument();
  });

  it("keeps the previous brief on screen and disables the regenerate control while running (AC-44, AC-45)", () => {
    const runningGeneration: PrBriefGenerationState = { ...DONE_GENERATION, status: "running", finished_at: null };
    briefState = {
      data: { brief: BASE_BRIEF, generation: runningGeneration, stale: false },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText(BASE_BRIEF.summary!)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
  });

  it("shows a failure notice while keeping the last successful cost, and names the two costs separately (AC-52, AC-73)", () => {
    const failedGeneration: PrBriefGenerationState = {
      status: "failed",
      provider: "openai",
      model: "gpt-5.4-mini",
      tokens_in: 900,
      tokens_out: 40,
      cost_usd: 0.002,
      error: "The provider timed out.",
      started_at: "2026-08-21T10:00:00.000Z",
      finished_at: "2026-08-21T10:02:00.000Z",
    };
    briefState = {
      data: { brief: BASE_BRIEF, generation: failedGeneration, stale: false },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText("Brief generation failed")).toBeInTheDocument();
    expect(screen.getByText("The provider timed out.")).toBeInTheDocument();
    expect(screen.getByText(`This attempt cost ${formatCost(0.002)}`)).toBeInTheDocument();
    expect(screen.getByText(`12,000 in · 800 out · ${formatCost(0.014)}`)).toBeInTheDocument();
    expect(formatCost(0.002)).not.toBe(formatCost(0.014));
  });

  it("gives the intent and blast-radius cards equal grid column widths (AC-97)", () => {
    briefState = { data: { brief: BASE_BRIEF, generation: DONE_GENERATION, stale: false }, isLoading: false, error: null };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    const intentSection = screen.getByText("Intent").closest("section");
    const grid = intentSection?.parentElement;
    expect(grid?.style.gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 1fr)");
  });

  it("does not change the URL when a risk row is expanded (AC-74)", () => {
    briefState = { data: { brief: BASE_BRIEF, generation: DONE_GENERATION, stale: false }, isLoading: false, error: null };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    const before = window.location.href;
    fireEvent.click(screen.getByText("Hardcoded secret"));
    expect(screen.getByText("A Stripe key is committed in plaintext.")).toBeInTheDocument();
    expect(window.location.href).toBe(before);
  });
});

describe("BriefPanel — loading, empty and error states", () => {
  it("renders a skeleton while the initial request is in flight and no card content yet (AC-70)", () => {
    briefState = { data: undefined, isLoading: true, error: null };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Brief not available yet.")).not.toBeInTheDocument();
  });

  it("shows the empty state with an enabled Generate control when no brief has ever been generated (AC-71)", () => {
    briefState = { data: { brief: null, generation: null, stale: false }, isLoading: false, error: null };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText("Brief not available yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Run a review/)).not.toBeInTheDocument();
    expect(screen.queryByText(/open the PR/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled();
  });

  it("shows an error state with a retry control on a non-404 failure and does not retry automatically (AC-72)", () => {
    briefState = { data: undefined, isLoading: false, error: new ApiError("Server exploded", 500) };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    expect(screen.getByText("Could not load the brief.")).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("BriefPanel — confirmation before generating", () => {
  it("issues no request until the confirmation is accepted, and names the last successful cost (AC-40, AC-81, AC-82)", () => {
    briefState = { data: { brief: BASE_BRIEF, generation: DONE_GENERATION, stale: false }, isLoading: false, error: null };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    const regenerateButton = screen.getByRole("button", { name: "Regenerate brief" });
    const recomputeButton = screen.getByRole("button", { name: "Recompute" });
    expect(regenerateButton).not.toBe(recomputeButton);

    fireEvent.click(regenerateButton);
    expect(generateMutate).not.toHaveBeenCalled();
    expect(screen.getByText("This calls a paid model to write the brief.")).toBeInTheDocument();
    expect(screen.getByText(`The last generation cost ${formatCost(0.014)}.`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("names no currency figure when no generation has ever succeeded (AC-82)", () => {
    briefState = { data: { brief: null, generation: null, stale: false }, isLoading: false, error: null };
    renderWithIntl(<BriefPanel prId="pr-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(generateMutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("This calls a paid model to write the brief.")).toBeInTheDocument();
    expect(within(dialog).queryByText(/\$/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(generateMutate).not.toHaveBeenCalled();
    expect(screen.queryByText("This calls a paid model to write the brief.")).not.toBeInTheDocument();
  });
});
