import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { api } from "../api";
import { onboardingPollInterval, useRepoFile } from "./onboarding";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn(),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("onboardingPollInterval", () => {
  it("polls at 1500 ms while running and stops otherwise", () => {
    expect(onboardingPollInterval("running")).toBe(1500);
    expect(onboardingPollInterval("done")).toBe(false);
    expect(onboardingPollInterval("failed")).toBe(false);
    expect(onboardingPollInterval(null)).toBe(false);
    expect(onboardingPollInterval(undefined)).toBe(false);
  });
});

describe("useRepoFile", () => {
  it("encodes the path as a query parameter, never as a route segment", async () => {
    vi.mocked(api.get).mockResolvedValue({ path: "src/a b.ts", content: "x" });

    const { result } = renderHook(() => useRepoFile("repo1", "src/a b.ts"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/repos/repo1/file?path=src%2Fa%20b.ts");
  });
});
