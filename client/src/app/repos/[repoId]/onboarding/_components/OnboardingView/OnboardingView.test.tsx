import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Onboarding, OnboardingView as OnboardingViewData } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import onboardingMessages from "../../../../../../../messages/en/onboarding.json";
import commonMessages from "../../../../../../../messages/en/common.json";

const generateMutate = vi.fn();
const refetch = vi.fn();
const state: {
  data: OnboardingViewData | undefined;
  isLoading: boolean;
  isError: boolean;
  generating: boolean;
  repoNotFound: boolean;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
  generating: false,
  repoNotFound: false,
};

vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboarding: () => ({
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch,
  }),
  useGenerateOnboarding: () => ({ mutate: generateMutate, isPending: state.generating }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api" } }),
  useRepoNotFound: () => state.repoNotFound,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>repo-not-found-marker</div>,
}));

const { OnboardingView } = await import("./OnboardingView");

const TOUR: Onboarding = {
  degraded: false,
  degraded_reason: null,
  sections: [
    {
      kind: "architecture",
      title: "Architecture",
      body: "The system is a monolith.",
      diagram: null,
      links: [],
    },
    {
      kind: "critical_paths",
      title: "Critical paths",
      body: "",
      diagram: null,
      links: [],
      critical_paths: [{ path: "src/index.ts", reason: "Entry point" }],
    },
    {
      kind: "run_locally",
      title: "How to run locally",
      body: "",
      diagram: null,
      links: [],
      run_locally: [{ command: "pnpm dev", note: null }],
    },
    {
      kind: "reading_path",
      title: "Reading order",
      body: "",
      diagram: null,
      links: [],
      reading_path: [{ path: "src/index.ts", rationale: "Start here" }],
    },
  ],
};

const DONE_VIEW: OnboardingViewData = {
  tour: TOUR,
  status: "done",
  failure_reason: null,
  generated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  files_indexed: 42,
  generated_sha: "abc123",
  current_sha: "abc123",
  model: "gpt-5",
  cost_usd: 0.045,
  failed_cost_usd: null,
};

beforeEach(() => {
  generateMutate.mockClear();
  refetch.mockClear();
  state.data = DONE_VIEW;
  state.isLoading = false;
  state.isError = false;
  state.generating = false;
  state.repoNotFound = false;
});
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: onboardingMessages, common: commonMessages }}>
      <OnboardingView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("OnboardingView", () => {
  it("shows the generate CTA naming the model and no section cards when never toured, and starts a generation only on click", () => {
    state.data = {
      tour: null,
      status: null,
      failure_reason: null,
      generated_at: null,
      files_indexed: null,
      generated_sha: null,
      current_sha: null,
      model: "gpt-5",
      cost_usd: null,
      failed_cost_usd: null,
    };
    renderView();

    expect(screen.getByText("Generate with gpt-5")).toBeInTheDocument();
    expect(screen.queryByText("Architecture")).not.toBeInTheDocument();
    expect(screen.getByText("Model: gpt-5")).toBeInTheDocument();
    expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
    expect(generateMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Generate with gpt-5"));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("disables Regenerate while running and keeps the previous tour rendered beneath", () => {
    state.data = { ...DONE_VIEW, status: "running" };
    renderView();

    expect(screen.getAllByText("Architecture").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(screen.getByText("Generating…")).toBeInTheDocument();
  });

  it("disables the Generate CTA while a first-ever generation is running, with no tour to show yet", () => {
    state.data = {
      tour: null,
      status: "running",
      failure_reason: null,
      generated_at: null,
      files_indexed: null,
      generated_sha: null,
      current_sha: null,
      model: "gpt-5",
      cost_usd: null,
      failed_cost_usd: null,
    };
    renderView();

    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
    expect(screen.queryByText("Generate with gpt-5")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
  });

  it("shows the failure reason and that attempt's cost with a working retry, omitting the cost clause when unknown", () => {
    state.data = {
      ...DONE_VIEW,
      status: "failed",
      failure_reason: "Model timed out",
      failed_cost_usd: 0.012,
    };
    renderView();

    expect(screen.getByText("Tour generation failed")).toBeInTheDocument();
    expect(screen.getByText("Model timed out")).toBeInTheDocument();
    expect(screen.getByText(`This attempt cost ${formatCost(0.012)}`)).toBeInTheDocument();
    expect(screen.getAllByText("Architecture").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Retry"));
    expect(generateMutate).toHaveBeenCalledTimes(1);

    cleanup();
    state.data = { ...DONE_VIEW, status: "failed", failure_reason: "Model timed out", failed_cost_usd: null };
    renderView();
    expect(screen.queryByText(/This attempt cost/)).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("shows the file count and elapsed time when indexed, and omits the file-count clause when there is no index row", () => {
    renderView();
    expect(screen.getByText(/Generated 5m ago from 42 indexed files/)).toBeInTheDocument();

    cleanup();
    state.data = { ...DONE_VIEW, files_indexed: null };
    renderView();
    expect(screen.getByText(/^Generated 5m ago$/)).toBeInTheDocument();
    expect(screen.queryByText(/indexed files/)).not.toBeInTheDocument();
  });

  it("shows a stale badge when the current sha differs from the generated sha, and a partial badge for a degraded tour without suppressing any section", () => {
    state.data = { ...DONE_VIEW, current_sha: "def456" };
    renderView();
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.queryByText("Partial")).not.toBeInTheDocument();

    cleanup();
    state.data = { ...DONE_VIEW, tour: { ...TOUR, degraded: true, degraded_reason: "index_partial" } };
    renderView();
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.getAllByText("Architecture").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Critical paths").length).toBeGreaterThan(0);
    expect(screen.getAllByText("How to run locally").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reading order").length).toBeGreaterThan(0);
    expect(screen.getAllByText("First tasks").length).toBeGreaterThan(0);
    expect(screen.getByText("No first tasks were identified.")).toBeInTheDocument();
  });

  it("shows the resolved model and the displayed tour's cost in the header, omitting the cost clause when it is unknown", () => {
    renderView();
    expect(screen.getByText("Model: gpt-5")).toBeInTheDocument();
    expect(screen.getByText(`Cost: ${formatCost(0.045)}`)).toBeInTheDocument();

    cleanup();
    state.data = { ...DONE_VIEW, cost_usd: null };
    renderView();
    expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("renders repository-not-found instead of the generate CTA for an unknown repo id", () => {
    state.repoNotFound = true;
    renderView();

    expect(screen.getByText("repo-not-found-marker")).toBeInTheDocument();
    expect(screen.queryByText(/Generate with/)).not.toBeInTheDocument();
  });
});
