import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectDoc, ProjectDocBody, ProjectDocList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

const replace = vi.fn();
const resyncMutate = vi.fn();
const searchParams = { current: new URLSearchParams() };

const state: {
  docs: ProjectDocList | undefined;
  isLoading: boolean;
  isError: boolean;
  body: ProjectDocBody | undefined;
} = { docs: undefined, isLoading: false, isError: false, body: undefined };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => searchParams.current,
}));

vi.mock("@/lib/hooks/context", () => ({
  useProjectDocs: () => ({
    data: state.docs,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: vi.fn(),
  }),
  useResyncProjectContext: () => ({ mutate: resyncMutate, isPending: false }),
  useProjectDoc: () => ({
    data: state.body,
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api" } }),
}));

const { ProjectContextView } = await import("./ProjectContextView");

function doc(o: Partial<ProjectDoc>): ProjectDoc {
  return {
    path: "specs/one.md",
    name: "one.md",
    folder: "specs",
    category: "specs",
    used_by_agents: [],
    ...o,
  };
}

const LIST: ProjectDocList = {
  documents: [
    doc({}),
    doc({
      path: "docs/architecture.md",
      name: "architecture.md",
      folder: "docs",
      category: "docs",
      used_by_agents: ["Security Sentinel", "Perf Hawk"],
    }),
  ],
  omitted: 0,
  reason: null,
  last_synced_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
};

beforeEach(() => {
  replace.mockClear();
  resyncMutate.mockClear();
  searchParams.current = new URLSearchParams();
  state.docs = LIST;
  state.isLoading = false;
  state.isError = false;
  state.body = { path: "specs/one.md", content: "# Grounding rules\n\nAlways cite the spec." };
});
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("names the repository when it has no clone to read documents from", () => {
    state.docs = { documents: [], omitted: 0, reason: "not_cloned", last_synced_at: null };
    renderView();

    expect(screen.getByText("payments-api isn’t cloned yet")).toBeInTheDocument();
    expect(screen.getByText(/Clone or refresh payments-api/)).toBeInTheDocument();
    expect(screen.getByText("Never refreshed")).toBeInTheDocument();
    expect(screen.queryByText("No project documents found")).not.toBeInTheDocument();
  });

  it("names the four scanned roots when the clone holds no documents", () => {
    state.docs = { documents: [], omitted: 0, reason: null, last_synced_at: null };
    renderView();

    expect(screen.getByText("No project documents found")).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing matched under docs\/, specs\/, plans\/, insights\//),
    ).toBeInTheDocument();
  });

  it("lists documents by category with a used-by badge and the last refresh time", () => {
    state.docs = { ...LIST, omitted: 12 };
    renderView();

    expect(screen.getByText("2 documents discovered in the clone · 12 more documents beyond the discovery cap")).toBeInTheDocument();
    expect(screen.getByText("Last refreshed 3h ago")).toBeInTheDocument();
    expect(screen.getByText("one.md")).toBeInTheDocument();
    expect(screen.getByText("architecture.md")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Resync"));
    expect(resyncMutate).toHaveBeenCalled();
  });

  it("puts the selected document in the URL instead of component state", () => {
    renderView();

    fireEvent.click(screen.getByText("architecture.md"));

    expect(replace).toHaveBeenCalledWith("/repos/r1/context?path=docs%2Farchitecture.md");
  });

  it("restores the preview from ?path= so a reload keeps the selection", () => {
    searchParams.current = new URLSearchParams("path=specs/one.md");
    renderView();

    expect(screen.getByText("specs/one.md")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grounding rules" })).toBeInTheDocument();
    expect(screen.queryByText("Select a document")).not.toBeInTheDocument();
  });

  it("shows a retryable error instead of an empty list when the fetch fails", () => {
    state.docs = undefined;
    state.isError = true;
    renderView();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn’t load this repository’s project context.",
    );
    expect(screen.queryByText("No project documents found")).not.toBeInTheDocument();
  });
});
