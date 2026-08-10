import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { IntentCard } from "./IntentCard";

const mutate = vi.fn();
const refetch = vi.fn();
let queryState: { data?: PrIntentRecord; isLoading: boolean; error: unknown };
let mutationState: { isPending: boolean };
let notComputed = false;

vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({ ...queryState, refetch }),
  useComputeIntent: () => ({ mutate, isPending: mutationState.isPending }),
  isNotComputed: () => notComputed,
}));

const RECORD: PrIntentRecord = {
  pr_id: "pr-1",
  intent: "Adds rate limiting to public API endpoints to prevent abuse.",
  in_scope: ["Add middleware for rate limiting", "Apply to /api/public/* routes"],
  out_of_scope: ["Authentication changes"],
  risk_areas: [
    { label: "Auth surface touched", severity: "high" },
    { label: "New dependency: ioredis", severity: "medium" },
  ],
  evidence: [{ kind: "pr_body", detail: "PR description present (312 chars)", weight: 0.15 }],
  confidence: 0.55,
  model: "gpt-5.4-nano",
  head_sha: "a1b2c3d4",
  computed_at: "2026-08-09T10:00:00.000Z",
  tokens_in: 820,
  tokens_out: 130,
  cost_usd: 0.00034,
  stale: false,
};

function renderWithIntl(ui: React.ReactElement, theme: "dark" | "light" = "dark") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <div data-theme={theme}>{ui}</div>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockClear();
  refetch.mockClear();
  queryState = { data: RECORD, isLoading: false, error: null };
  mutationState = { isPending: false };
  notComputed = false;
});
afterEach(cleanup);

describe("IntentCard (both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders the statement, both scope lists and the risk chips in ${theme}`, () => {
      renderWithIntl(<IntentCard prId="pr-1" />, theme);

      expect(screen.getByText(`“${RECORD.intent}”`)).toBeInTheDocument();
      expect(screen.getByText("In scope")).toBeInTheDocument();
      expect(screen.getByText("Out of scope")).toBeInTheDocument();
      for (const item of [...RECORD.in_scope, ...RECORD.out_of_scope]) {
        expect(screen.getByText(item)).toBeInTheDocument();
      }
      expect(screen.getByText("Risk areas")).toBeInTheDocument();
      for (const risk of RECORD.risk_areas) {
        expect(screen.getByText(risk.label)).toBeInTheDocument();
      }
    });
  });
});

describe("IntentCard — evidence coverage", () => {
  it("labels the number as evidence coverage, never as model confidence", () => {
    renderWithIntl(<IntentCard prId="pr-1" />);

    expect(screen.getByText("55% evidence coverage")).toBeInTheDocument();
    expect(screen.queryByText(/model confidence/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/model confidence/i)).not.toBeInTheDocument();
  });

  it("says coverage is unknown rather than showing 0% when it is null", () => {
    queryState = { data: { ...RECORD, confidence: null }, isLoading: false, error: null };
    renderWithIntl(<IntentCard prId="pr-1" />);

    expect(screen.getByText("Evidence coverage unknown")).toBeInTheDocument();
    expect(screen.queryByText("0% evidence coverage")).not.toBeInTheDocument();
  });

  it("exposes which signals were found, so the number is auditable", () => {
    renderWithIntl(<IntentCard prId="pr-1" />);
    expect(screen.getByTitle("PR description present (312 chars)")).toBeInTheDocument();
  });
});

describe("IntentCard — provenance", () => {
  it("shows the model and cost it was derived with", () => {
    renderWithIntl(<IntentCard prId="pr-1" />);
    expect(screen.getByText("gpt-5.4-nano")).toBeInTheDocument();
  });

  it("shows the stale badge only when the head has moved", () => {
    renderWithIntl(<IntentCard prId="pr-1" />);
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
    cleanup();

    queryState = { data: { ...RECORD, stale: true }, isLoading: false, error: null };
    renderWithIntl(<IntentCard prId="pr-1" />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });
});

describe("IntentCard — states", () => {
  it("treats a 404 as the empty state and computes on click", () => {
    queryState = { data: undefined, isLoading: false, error: new Error("not found") };
    notComputed = true;
    renderWithIntl(<IntentCard prId="pr-1" />);

    expect(screen.getByText("Intent not derived yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /compute intent/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("recomputes from the header action when a record already exists", () => {
    renderWithIntl(<IntentCard prId="pr-1" />);
    fireEvent.click(screen.getByRole("button", { name: /recompute/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("shows an error state with retry for a non-404 failure", () => {
    queryState = { data: undefined, isLoading: false, error: new Error("boom") };
    notComputed = false;
    renderWithIntl(<IntentCard prId="pr-1" />);

    expect(screen.getByText("Could not load the intent.")).toBeInTheDocument();
    expect(screen.queryByText("Intent not derived yet.")).not.toBeInTheDocument();
  });

  it("renders skeletons while loading and no statement", () => {
    queryState = { data: undefined, isLoading: true, error: null };
    renderWithIntl(<IntentCard prId="pr-1" />);

    expect(screen.queryByText(`“${RECORD.intent}”`)).not.toBeInTheDocument();
    expect(screen.queryByText("Intent not derived yet.")).not.toBeInTheDocument();
  });
});
