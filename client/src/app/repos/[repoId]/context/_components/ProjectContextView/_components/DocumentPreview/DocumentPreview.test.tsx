import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectDocBody } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../../../messages/en/context.json";

const state: { body: ProjectDocBody | undefined; error: unknown } = {
  body: undefined,
  error: undefined,
};

vi.mock("@/lib/hooks/context", () => ({
  useProjectDoc: () => ({
    data: state.body,
    isLoading: false,
    isError: state.error !== undefined,
    error: state.error,
    refetch: vi.fn(),
  }),
}));

const { DocumentPreview } = await import("./DocumentPreview");

beforeEach(() => {
  state.body = undefined;
  state.error = undefined;
});
afterEach(cleanup);

function renderPreview(path: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <DocumentPreview repoId="r1" path={path} />
    </NextIntlClientProvider>,
  );
}

describe("DocumentPreview", () => {
  it("renders a hostile document inert — no script element, no javascript: href", () => {
    state.body = {
      path: "specs/hostile.md",
      content: [
        "# Spec",
        "",
        "<script>window.__pwned = 1</script>",
        "",
        "[click](javascript:alert(1))",
        "",
        "[docs](https://example.com/spec)",
        "",
        "| Rule | Owner |",
        "| --- | --- |",
        "| Cite the spec | core |",
      ].join("\n"),
    };
    const { container } = renderPreview("specs/hostile.md");

    expect(container.querySelector("script")).toBeNull();
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();

    expect(screen.getByText("click")).toHaveAttribute("href", "");
    expect(screen.queryByRole("link", { name: "click" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com/spec",
    );

    expect(screen.getByRole("heading", { name: "Spec" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("says the preview is only the first part of a truncated document", () => {
    state.body = {
      path: "docs/huge.md",
      content: "# Huge\n\nfirst part",
      truncated: true,
    };
    renderPreview("docs/huge.md");

    expect(
      screen.getByText("This document is large — the preview shows only its first part."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Huge" })).toBeInTheDocument();
  });

  it("says nothing about truncation for a document read whole", () => {
    state.body = {
      path: "docs/small.md",
      content: "# Small\n\nall of it",
      truncated: false,
    };
    renderPreview("docs/small.md");

    expect(screen.queryByText(/only its first part/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Small" })).toBeInTheDocument();
  });

  it("names the path and the resync reason for a document missing from the walk", () => {
    state.error = new ApiError("No such document: specs/gone.md", 404, "not_found");
    renderPreview("specs/gone.md");

    expect(screen.getByText("Couldn’t read specs/gone.md")).toBeInTheDocument();
    expect(
      screen.getByText("The file is no longer in the clone. Resync to refresh the list."),
    ).toBeInTheDocument();
  });

  it("does not tell the user to resync a document that is listed but unreadable", () => {
    state.error = new ApiError(
      "Document could not be read: specs/locked.md",
      404,
      "document_unreadable",
    );
    renderPreview("specs/locked.md");

    expect(screen.getByText("Couldn’t read specs/locked.md")).toBeInTheDocument();
    expect(screen.getByText(/listed in the clone but its contents could not be read/)).toBeInTheDocument();
    expect(screen.queryByText(/no longer in the clone/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resync to refresh the list/)).not.toBeInTheDocument();
  });

  it("says the repository has no clone rather than blaming the file", () => {
    state.error = new ApiError("acme/payments-api has no local clone", 404, "not_cloned");
    renderPreview("specs/one.md");

    expect(
      screen.getByText("This repository has no local clone, so its documents cannot be read."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Resync to refresh the list/)).not.toBeInTheDocument();
  });

  it("surfaces the server message for an unrecognised code", () => {
    state.error = new ApiError("Upstream refused the read", 500, "internal_error");
    renderPreview("specs/one.md");

    expect(screen.getByText("Upstream refused the read")).toBeInTheDocument();
  });

  it("falls back to a generic reason for a non-API failure", () => {
    state.error = new Error("boom");
    renderPreview("specs/gone.md");

    expect(
      screen.getByText("The file could not be read from the repository clone."),
    ).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("invites a selection rather than showing an empty pane", () => {
    renderPreview(null);

    expect(screen.getByText("Select a document")).toBeInTheDocument();
  });
});
