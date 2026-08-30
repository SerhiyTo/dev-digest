import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { api } from "../api";
import { briefPollInterval, usePrBrief } from "./brief";

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
  const qc = new QueryClient();
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("briefPollInterval", () => {
  it("polls at 1500 ms only while running and stops otherwise", () => {
    expect(briefPollInterval("running")).toBe(1500);
    expect(briefPollInterval("done")).toBe(false);
    expect(briefPollInterval("failed")).toBe(false);
    expect(briefPollInterval(undefined)).toBe(false);
  });
});

describe("usePrBrief", () => {
  it("does not retry a failed request", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("500 Internal Server Error"));

    const { result } = renderHook(() => usePrBrief("pr1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
