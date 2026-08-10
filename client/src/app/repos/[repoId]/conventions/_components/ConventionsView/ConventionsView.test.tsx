import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionsView as ConventionsViewData } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

const scanMutate = vi.fn();
const setStatusesMutate = vi.fn();
const state: { data: ConventionsViewData | undefined } = { data: undefined };

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: state.data, isLoading: false, isError: false, refetch: vi.fn() }),
  useScanConventions: () => ({ mutate: scanMutate, isPending: false }),
  useConventionAction: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateConvention: () => ({ mutate: vi.fn(), isPending: false }),
  useSetConventionStatuses: () => ({ mutate: setStatusesMutate, isPending: false }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api" } }),
}));

const { ConventionsView } = await import("./ConventionsView");

const CANDIDATE = {
  id: "c1",
  rule: "Always use async/await instead of .then() chains.",
  evidence: [
    { path: "src/api/users.ts", start_line: 23, end_line: 31, snippet: "await db.users.find(id)" },
  ],
  occurrence_files: null,
  confidence: 0.91,
  status: "pending" as const,
};

const DONE_STATE = {
  status: "done" as const,
  sampled_files: 84,
  selected_files: 12,
  candidate_count: 3,
  dropped_count: 0,
  dropped_reasons: {},
  last_scan_at: new Date().toISOString(),
};

beforeEach(() => {
  scanMutate.mockClear();
  setStatusesMutate.mockClear();
  state.data = { state: DONE_STATE, candidates: [CANDIDATE] };
});
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("names the repo it scanned", () => {
    renderView();

    expect(screen.getByText("payments-api")).toBeInTheDocument();
  });

  it("omits the cost and dropped chips when the scan did not measure them", () => {
    renderView();

    expect(screen.getByText(/Detected from 84 sample files/)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/dropped by the evidence gate/)).not.toBeInTheDocument();
  });

  it("reports cost and gate drops once the scan measured them", () => {
    state.data = {
      state: { ...DONE_STATE, dropped_count: 2, cost_usd: 0.031, tokens_in: 12000, tokens_out: 400 },
      candidates: [CANDIDATE],
    };
    renderView();

    expect(screen.getByText(/3 kept · 2 dropped by the evidence gate/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.03 · 12\.4k tokens/)).toBeInTheDocument();
  });

  it("explains an unindexed repo rather than showing the generic empty state", () => {
    state.data = {
      state: { ...DONE_STATE, sampled_files: 0, candidate_count: 0, degraded_reason: "not_indexed" },
      candidates: [],
    };
    renderView();

    expect(screen.getByText("Nothing to scan yet")).toBeInTheDocument();
    expect(screen.getByText(/isn't indexed yet/)).toBeInTheDocument();
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
  });

  it("keeps a failed scan quiet — the provider's error is not page furniture", () => {
    state.data = {
      state: { ...DONE_STATE, status: "failed", error: "404 No endpoints found for x:batch" },
      candidates: [CANDIDATE],
    };
    renderView();

    expect(screen.queryByText(/No endpoints found/)).not.toBeInTheDocument();
    expect(screen.queryByText(/last scan failed/i)).not.toBeInTheDocument();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("still announces a scan that is in progress", () => {
    state.data = { state: { ...DONE_STATE, status: "running" }, candidates: [CANDIDATE] };
    renderView();

    expect(screen.getByText("Scanning the repo…")).toBeInTheDocument();
    expect(screen.getByText("Scanning…")).toBeInTheDocument();
  });

  it("sends the scope prefix with a re-scan, and omits it when blank", () => {
    renderView();

    fireEvent.click(screen.getByText("Re-scan"));
    expect(scanMutate).toHaveBeenCalledWith({});

    fireEvent.change(screen.getByPlaceholderText("src/api/ (whole repo if empty)"), {
      target: { value: "src/api/" },
    });
    fireEvent.click(screen.getByText("Re-scan"));
    expect(scanMutate).toHaveBeenLastCalledWith({ path_prefix: "src/api/" });
  });

  it("counts accepted candidates and deselects them in one call", () => {
    state.data = {
      state: DONE_STATE,
      candidates: [{ ...CANDIDATE, status: "accepted" }, { ...CANDIDATE, id: "c2" }],
    };
    renderView();

    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Deselect all"));
    expect(setStatusesMutate).toHaveBeenCalledWith({ ids: ["c1"], status: "pending" });
  });
});
