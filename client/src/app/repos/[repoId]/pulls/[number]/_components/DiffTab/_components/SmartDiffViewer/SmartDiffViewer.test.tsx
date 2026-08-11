import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../../../messages/en/shell.json";

const usePrSmartDiff = vi.fn();
vi.mock("@/lib/hooks/smart-diff", () => ({
  usePrSmartDiff: (prId: string | null) => usePrSmartDiff(prId),
}));

const { SmartDiffViewer } = await import("./SmartDiffViewer");

afterEach(cleanup);
beforeEach(() => {
  usePrSmartDiff.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

const CORE_PATCH = "@@ -26,3 +26,4 @@\n   const a = 1;\n+  const key = bucketKey(req);\n   next();";

const FILES: PrFile[] = [
  { path: "src/middleware/ratelimit.ts", additions: 84, deletions: 0, patch: CORE_PATCH },
  { path: "src/big.ts", additions: 400, deletions: 0, patch: CORE_PATCH },
  { path: "src/config.ts", additions: 4, deletions: 0, patch: CORE_PATCH },
  { path: "package-lock.json", additions: 92, deletions: 24, patch: CORE_PATCH },
  { path: "src/assets/blob.bin", additions: 3, deletions: 0, patch: null },
];

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        {
          path: "src/middleware/ratelimit.ts",
          additions: 84,
          deletions: 0,
          finding_lines: [27],
        },
        { path: "src/big.ts", additions: 400, deletions: 0, finding_lines: [] },
      ],
    },
    {
      role: "wiring",
      files: [{ path: "src/config.ts", additions: 4, deletions: 0, finding_lines: [] }],
    },
    {
      role: "boilerplate",
      files: [
        { path: "package-lock.json", additions: 92, deletions: 24, finding_lines: [] },
        { path: "src/assets/blob.bin", additions: 3, deletions: 0, finding_lines: [12] },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 207, proposed_splits: [] },
};

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "security",
    title: "seeded",
    file: "src/middleware/ratelimit.ts",
    start_line: 27,
    end_line: 27,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function renderViewer(
  theme: "dark" | "light",
  findings: FindingRecord[] = [],
  files: PrFile[] = FILES,
  onFindingOpen?: (id: string) => void,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <div data-theme={theme}>
        <SmartDiffViewer
          prId="pr-1"
          files={files}
          findings={findings}
          onFindingOpen={onFindingOpen}
        />
      </div>
    </NextIntlClientProvider>,
  );
}

function cardFor(path: string): HTMLElement {
  const el = document.querySelector(`[data-diff-file="${path}"]`);
  if (!el) throw new Error(`no file card for ${path}`);
  return el as HTMLElement;
}

function isExpanded(path: string): boolean {
  return cardFor(path).querySelectorAll("[data-diff-line]").length > 0;
}

describe("SmartDiffViewer", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders the three role groups in order with their subtitles in ${theme}`, () => {
      usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
      renderViewer(theme);

      expect(screen.getByText("Core logic")).toBeInTheDocument();
      expect(screen.getByText("Wiring")).toBeInTheDocument();
      expect(screen.getByText("Boilerplate")).toBeInTheDocument();
      expect(
        screen.getByText("The substance of the change — review closely"),
      ).toBeInTheDocument();
      expect(screen.getByText("Generated / mechanical — skim")).toBeInTheDocument();

      const headings = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
      expect(headings).toEqual(["Core logic", "Wiring", "Boilerplate"]);
    });
  });

  it("expands a core file that has findings and badges the count", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark", [finding(), finding({ id: "f2", start_line: 28, end_line: 28 })]);

    expect(screen.getByText("2 findings")).toBeInTheDocument();
    expect(isExpanded("src/middleware/ratelimit.ts")).toBe(true);
  });

  it("expands a file above the auto-expand threshold only because it has a finding", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark", [finding({ file: "src/big.ts", start_line: 27, end_line: 27 })]);

    expect(isExpanded("src/big.ts")).toBe(true);
  });

  it("leaves the same oversized file collapsed when it has no findings", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark");

    expect(isExpanded("src/big.ts")).toBe(false);
  });

  it("expands a file whose findings arrive after the smart-diff response", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    const { rerender } = renderViewer("dark");
    expect(isExpanded("src/big.ts")).toBe(false);

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <div data-theme="dark">
          <SmartDiffViewer
            prId="pr-1"
            files={FILES}
            findings={[finding({ file: "src/big.ts", start_line: 27, end_line: 27 })]}
          />
        </div>
      </NextIntlClientProvider>,
    );

    expect(isExpanded("src/big.ts")).toBe(true);
  });

  it("keeps boilerplate collapsed", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark");
    expect(isExpanded("package-lock.json")).toBe(false);
  });

  it("marks the matching changed line with a severity pill", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark", [finding({ severity: "CRITICAL" })]);

    const row = document.querySelector('[data-diff-line="src/middleware/ratelimit.ts:27"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("Critical");
  });

  it("renders no pill for a finding on a line outside the patch", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark", [finding({ start_line: 9999, end_line: 9999 })]);

    expect(screen.getByText("1 finding")).toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
  });

  it("renders no pill for an unknown severity string", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark", [finding({ severity: "INFO" as FindingRecord["severity"] })]);

    expect(screen.queryByText("Info")).not.toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
  });

  it("keeps a findings file with a null patch collapsed but still badged", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark", [
      finding({ file: "src/assets/blob.bin", start_line: 12, end_line: 12 }),
    ]);

    expect(screen.getByText("1 finding")).toBeInTheDocument();
    expect(isExpanded("src/assets/blob.bin")).toBe(false);
    expect(
      screen.queryByText("No diff text available (binary or unfetched patch)."),
    ).not.toBeInTheDocument();
  });

  it("falls back to the original order on an error", () => {
    usePrSmartDiff.mockReturnValue({ data: undefined, isError: true });
    renderViewer("dark");

    expect(
      screen.getByText("Smart order is unavailable — showing the original file order."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(cardFor("package-lock.json")).toBeInTheDocument();
  });

  it("navigates to the finding when the file's findings badge is clicked", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    const onFindingOpen = vi.fn();
    renderViewer(
      "dark",
      [finding({ id: "badge-target", file: "package-lock.json", start_line: 27 })],
      FILES,
      onFindingOpen,
    );

    fireEvent.click(screen.getByText("1 finding"));
    expect(onFindingOpen).toHaveBeenCalledTimes(1);
    expect(onFindingOpen).toHaveBeenCalledWith("badge-target");
  });

  it("navigates from a collapsed null-patch file, where the badge is the only affordance", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    const onFindingOpen = vi.fn();
    renderViewer(
      "dark",
      [finding({ id: "bin-1", file: "src/assets/blob.bin", start_line: 12 })],
      FILES,
      onFindingOpen,
    );

    expect(isExpanded("src/assets/blob.bin")).toBe(false);
    fireEvent.click(screen.getByText("1 finding"));
    expect(onFindingOpen).toHaveBeenCalledWith("bin-1");
  });

  it("sends the badge to the worst finding when a file has several", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    const onFindingOpen = vi.fn();
    renderViewer(
      "dark",
      [
        finding({ id: "sugg", file: "package-lock.json", start_line: 27, severity: "SUGGESTION" }),
        finding({ id: "crit", file: "package-lock.json", start_line: 28, severity: "CRITICAL" }),
      ],
      FILES,
      onFindingOpen,
    );

    fireEvent.click(screen.getByText("2 findings"));
    expect(onFindingOpen).toHaveBeenCalledWith("crit");
  });

  it("shows the split banner only when the pull request is too big", () => {
    usePrSmartDiff.mockReturnValue({
      data: {
        ...SMART_DIFF,
        split_suggestion: {
          too_big: true,
          total_lines: 900,
          proposed_splits: [
            { name: "src/middleware", files: ["a.ts", "b.ts"] },
            { name: "src/api", files: ["c.ts", "d.ts"] },
          ],
        },
      },
      isError: false,
    });
    renderViewer("dark");

    expect(screen.getByText("This PR is large (900 changed lines)")).toBeInTheDocument();
    const splits = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(splits).toEqual(["src/middleware · 2 files", "src/api · 2 files"]);
  });

  it("opens the clicked line's finding, and the worst one when a line has several", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    const onFindingOpen = vi.fn();
    renderViewer(
      "dark",
      [
        finding({ id: "warn-1", severity: "WARNING" }),
        finding({ id: "crit-1", severity: "CRITICAL" }),
      ],
      FILES,
      onFindingOpen,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open this finding's details" }));
    expect(onFindingOpen).toHaveBeenCalledTimes(1);
    expect(onFindingOpen).toHaveBeenCalledWith("crit-1");
  });

  it("renders the pill as plain text when no navigator is supplied", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark", [finding({ severity: "CRITICAL" })]);

    expect(
      screen.queryByRole("button", { name: "Open this finding's details" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("counts findings from every agent's review, not just one", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark", [
      finding({ id: "agent-a", review_id: "r2", start_line: 27, end_line: 27 }),
      finding({ id: "agent-b", review_id: "r1", start_line: 26, end_line: 26 }),
    ]);

    expect(screen.getByText("2 findings")).toBeInTheDocument();
  });

  it("excludes a dismissed finding from the badge", () => {
    usePrSmartDiff.mockReturnValue({ data: SMART_DIFF, isError: false });
    renderViewer("dark", [
      finding({ id: "live", start_line: 27, end_line: 27 }),
      finding({ id: "gone", start_line: 26, end_line: 26, dismissed_at: "2026-08-10T00:00:00Z" }),
    ]);

    expect(screen.getByText("1 finding")).toBeInTheDocument();
  });
});
