import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse, ChangedSymbol, DownstreamImpact, PrHistoryItem } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

const refetch = vi.fn();
let queryState: { data?: BlastRadiusResponse; isLoading: boolean; error: unknown };

vi.mock("@/lib/hooks/blast", () => ({
  usePrBlastRadius: () => ({ ...queryState, refetch }),
}));

const CHANGED_SYMBOLS: ChangedSymbol[] = [
  { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
  { name: "bucketKey", file: "src/middleware/ratelimit.ts", kind: "function" },
  { name: "handleWebhook", file: "src/api/public/webhooks.ts", kind: "function" },
];

const DOWNSTREAM: DownstreamImpact[] = [
  {
    symbol: "rateLimit",
    callers: [
      { name: "scheduleRateBucketReset", file: "src/server.ts", line: 88 },
      { name: "registerRoutes", file: "src/api/public/index.ts", line: 23 },
      { name: "handleWebhook", file: "src/api/public/webhooks.ts", line: 45 },
      { name: "registerHealthRoute", file: "src/api/public/health.ts", line: 11 },
    ],
    endpoints_affected: ["GET /api/public/health", "GET /api/public/items", "POST /api/public/webhooks"],
    crons_affected: ["reset-rate-buckets"],
  },
  {
    symbol: "bucketKey",
    callers: [{ name: "scheduleRateBucketReset", file: "src/server.ts", line: 92 }],
    endpoints_affected: ["POST /api/public/webhooks"],
    crons_affected: ["reset-rate-buckets"],
  },
  {
    symbol: "handleWebhook",
    callers: [],
    endpoints_affected: [],
    crons_affected: [],
  },
];

const HISTORY: PrHistoryItem[] = [
  {
    pr_number: 415,
    title: "Introduce token-bucket rate limiter scaffolding",
    merged_at: "2026-07-04T16:30:00.000Z",
    author: "diego.reyes",
    files_overlap: ["src/config.ts", "src/middleware/ratelimit.ts"],
    notes: "merged",
  },
];

const BASE_DATA: BlastRadiusResponse = {
  changed_symbols: CHANGED_SYMBOLS,
  downstream: DOWNSTREAM,
  summary: "3 changed symbols, 5 callers across 4 files, 3 endpoints, 1 cron job.",
  endpoints_affected: ["GET /api/public/health", "GET /api/public/items", "POST /api/public/webhooks"],
  crons_affected: ["reset-rate-buckets"],
  history: HISTORY,
  truncated: false,
  degraded: false,
  reason: "",
};

function manyCallerDownstream(): DownstreamImpact[] {
  return Array.from({ length: 10 }, (_, i) => ({
    symbol: `symbol${i}`,
    callers: Array.from({ length: 2 }, (_, j) => ({
      name: `caller${i}_${j}`,
      file: `src/generated/file${i}_${j}.ts`,
      line: 1,
    })),
    endpoints_affected: [],
    crons_affected: [],
  }));
}

function renderWithIntl(ui: React.ReactElement, theme: "dark" | "light" = "dark") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <div data-theme={theme}>{ui}</div>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  refetch.mockClear();
  queryState = { data: BASE_DATA, isLoading: false, error: null };
});
afterEach(cleanup);

describe("BlastRadiusCard (both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders the stats row and tree in ${theme}`, () => {
      renderWithIntl(<BlastRadiusCard prId="pr-1" />, theme);

      expect(screen.getByText("Blast radius")).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "Changed symbols" })).toBeInTheDocument();
    });
  });
});

describe("BlastRadiusCard — loading, error, empty", () => {
  it("shows skeletons while loading", () => {
    queryState = { data: undefined, isLoading: true, error: null };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.queryByText("Blast radius")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Changed symbols" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error state and retries on click", () => {
    queryState = { data: undefined, isLoading: false, error: new Error("boom") };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.getByText("Could not load the blast radius.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when no symbols changed", () => {
    queryState = { data: { ...BASE_DATA, changed_symbols: [] }, isLoading: false, error: null };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.getByText("No blast radius to show.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Changed symbols" })).not.toBeInTheDocument();
  });
});

describe("BlastRadiusCard — stats row plurals", () => {
  it("renders the plural form when there is more than one endpoint", () => {
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);
    expect(screen.getByText(/3 endpoints/)).toBeInTheDocument();
  });

  it("renders the singular form when there is exactly one endpoint", () => {
    queryState = {
      data: { ...BASE_DATA, endpoints_affected: ["GET /api/public/health"] },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);
    expect(screen.getByText(/1 endpoint(?!s)/)).toBeInTheDocument();
  });
});

describe("BlastRadiusCard — symbol row expand/collapse", () => {
  it("reveals caller lines on click and collapses on a second click", () => {
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    const row = screen.getByRole("button", { name: "Toggle callers of rateLimit" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/api/public/index.ts:23")).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/api/public/index.ts:23")).not.toBeInTheDocument();
  });

  it("toggles open with Enter and closed with Space from the keyboard", () => {
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    const row = screen.getByRole("button", { name: "Toggle callers of rateLimit" });
    fireEvent.keyDown(row, { key: "Enter" });
    expect(row).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(row, { key: " " });
    expect(row).toHaveAttribute("aria-expanded", "false");
  });
});

describe("BlastRadiusCard — Tree/Graph toggle", () => {
  it("switches from Tree to Graph and moves aria-selected", () => {
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    const treeTab = screen.getByRole("tab", { name: "Tree" });
    const graphTab = screen.getByRole("tab", { name: "Graph" });
    expect(treeTab).toHaveAttribute("aria-selected", "true");
    expect(graphTab).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("list", { name: "Changed symbols" })).toBeInTheDocument();

    fireEvent.click(graphTab);

    expect(treeTab).toHaveAttribute("aria-selected", "false");
    expect(graphTab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("list", { name: "Changed symbols" })).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("caps rendered graph nodes and shows a +N more label when callers overflow", () => {
    queryState = {
      data: { ...BASE_DATA, downstream: manyCallerDownstream() },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    fireEvent.click(screen.getByRole("tab", { name: "Graph" }));

    const svg = screen.getByRole("img");
    const rects = svg.querySelectorAll("rect");
    expect(rects.length).toBeLessThanOrEqual(8 + 1 + 12 + 1);
    expect(within(svg).getAllByText(/\+\d+ more/).length).toBeGreaterThan(0);
  });
});

describe("BlastRadiusCard — Prior PRs", () => {
  it("is collapsed by default and reveals #415 with its overlap count on expand", () => {
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.queryByText("#415")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle prior PRs list" }));

    expect(screen.getByText("#415")).toBeInTheDocument();
    expect(screen.getByText("2 files overlap")).toBeInTheDocument();
  });
});

describe("BlastRadiusCard — degraded", () => {
  it("shows the partial badge with the mapped reason title for a known reason", () => {
    queryState = {
      data: { ...BASE_DATA, degraded: true, reason: "index_partial" },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.getByText("partial")).toBeInTheDocument();
    expect(screen.getByTitle("The repository index is incomplete.")).toBeInTheDocument();
  });

  it("falls back to degraded.reason.unknown for an unrecognised reason and does not throw", () => {
    queryState = {
      data: { ...BASE_DATA, degraded: true, reason: "some_new_server_reason" },
      isLoading: false,
      error: null,
    };
    expect(() => renderWithIntl(<BlastRadiusCard prId="pr-1" />)).not.toThrow();

    expect(screen.getByText("partial")).toBeInTheDocument();
    expect(screen.getByTitle("This result is best-effort — the repository index is incomplete.")).toBeInTheDocument();
  });
});

describe("BlastRadiusCard — caller kind wording", () => {
  it("shows the call wording and no type marker when every caller is a call (kind absent, the legacy case)", () => {
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.getByText("4 callers")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle callers of rateLimit" }));
    expect(screen.queryByText("type")).not.toBeInTheDocument();
  });

  it("treats a caller with no kind as a call", () => {
    queryState = {
      data: {
        ...BASE_DATA,
        changed_symbols: [{ name: "LegacySymbol", file: "src/legacy.ts", kind: "function" }],
        downstream: [
          {
            symbol: "LegacySymbol",
            callers: [{ name: "legacyCaller", file: "src/legacyCaller.ts", line: 3 }],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
      },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.getByText("1 caller")).toBeInTheDocument();
  });

  it("shows the type-usage wording and a marker on every caller row when every caller is a type usage", () => {
    queryState = {
      data: {
        ...BASE_DATA,
        changed_symbols: [{ name: "SalaryTripItem", file: "src/types.ts", kind: "interface" }],
        downstream: [
          {
            symbol: "SalaryTripItem",
            callers: [
              { name: "Table.vue", file: "Salary/Table.vue", line: 30, kind: "type" },
              { name: "sortTrips", file: "server/api/trips.get.ts", line: 4, kind: "type" },
            ],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
      },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.getByText("2 type usages")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle callers of SalaryTripItem" }));
    expect(screen.getAllByText("type")).toHaveLength(2);
  });

  it("shows the singular type-usage wording for exactly one type caller", () => {
    queryState = {
      data: {
        ...BASE_DATA,
        changed_symbols: [{ name: "DebtItem", file: "src/types.ts", kind: "interface" }],
        downstream: [
          {
            symbol: "DebtItem",
            callers: [{ name: "DebtItem.vue", file: "app/DebtItem.vue", line: 8, kind: "type" }],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
      },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.getByText("1 type usage")).toBeInTheDocument();
  });

  it("shows the neutral usages wording when a symbol mixes call and type callers", () => {
    queryState = {
      data: {
        ...BASE_DATA,
        changed_symbols: [{ name: "MixedSymbol", file: "src/mixed.ts", kind: "function" }],
        downstream: [
          {
            symbol: "MixedSymbol",
            callers: [
              { name: "caller.ts", file: "src/caller.ts", line: 5, kind: "call" },
              { name: "types.ts", file: "src/types.ts", line: 9, kind: "type" },
            ],
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
      },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.getByText("2 usages")).toBeInTheDocument();
  });
});

describe("BlastRadiusCard — truncated", () => {
  it("renders the N+ callers treatment when the caller cap was hit", () => {
    queryState = {
      data: {
        ...BASE_DATA,
        truncated: true,
        downstream: [
          {
            symbol: "rateLimit",
            callers: Array.from({ length: 20 }, (_, i) => ({
              name: `caller${i}`,
              file: `src/generated/file${i}.ts`,
              line: i + 1,
            })),
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
      },
      isLoading: false,
      error: null,
    };
    renderWithIntl(<BlastRadiusCard prId="pr-1" />);

    expect(screen.getByText(/20\+ usages/)).toBeInTheDocument();
  });
});
