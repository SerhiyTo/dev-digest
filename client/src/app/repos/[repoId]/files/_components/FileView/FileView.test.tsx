import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboardingMessages from "../../../../../../../messages/en/onboarding.json";
import commonMessages from "../../../../../../../messages/en/common.json";

const searchParams = { current: new URLSearchParams() };

const state: {
  data: { path: string; content: string; truncated?: boolean } | undefined;
  isLoading: boolean;
  isNotFound: boolean;
  isError: boolean;
} = { data: undefined, isLoading: false, isNotFound: false, isError: false };

const refetch = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.current,
}));

vi.mock("@/lib/hooks", () => ({
  useRepoFile: () => ({
    data: state.data,
    isLoading: state.isLoading,
    isNotFound: state.isNotFound,
    isError: state.isError,
    refetch,
  }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { FileView } = await import("./FileView");

beforeEach(() => {
  state.data = undefined;
  state.isLoading = false;
  state.isNotFound = false;
  state.isError = false;
  refetch.mockClear();
});
afterEach(cleanup);

function renderView(path: string | null) {
  searchParams.current = path === null ? new URLSearchParams() : new URLSearchParams({ path });
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ onboarding: onboardingMessages, common: commonMessages }}
    >
      <FileView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("FileView", () => {
  it("reads the path from the query string and renders the file contents", () => {
    state.data = { path: "src/app.ts", content: "export const x = 1;" };
    renderView("src/app.ts");

    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("export const x = 1;")).toBeInTheDocument();
  });

  it("shows its own not-found state for a 404, leaving nothing else to interact with", () => {
    state.isNotFound = true;
    renderView("src/gone.ts");

    expect(screen.getByText("File not found")).toBeInTheDocument();
    expect(
      screen.getByText("This file no longer exists in the repository."),
    ).toBeInTheDocument();
    expect(screen.queryByText("src/gone.ts")).not.toBeInTheDocument();
  });

  it("shows the not-found state when no path is present in the query string", () => {
    renderView(null);

    expect(screen.getByText("File not found")).toBeInTheDocument();
  });
});
