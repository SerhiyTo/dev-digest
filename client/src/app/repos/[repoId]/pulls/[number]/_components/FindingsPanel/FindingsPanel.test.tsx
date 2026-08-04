import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

const realScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame;
});

afterEach(() => {
  vi.useRealTimers();
  Element.prototype.scrollIntoView = realScrollIntoView;
  cleanup();
});

const CRITICAL_FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A secret is committed.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

const WARNING_FINDING: FindingRecord = {
  ...CRITICAL_FINDING,
  id: "f2",
  severity: "WARNING",
  category: "perf",
  title: "N+1 query in user list",
  file: "src/api/users.ts",
};

const FINDINGS: FindingRecord[] = [CRITICAL_FINDING];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity filter", () => {
  const BOTH = [CRITICAL_FINDING, WARNING_FINDING];

  it("shows every severity when no filter is set", () => {
    renderWithIntl(<FindingsPanel findings={BOTH} prId="pr1" />);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
  });

  it("narrows to the selected severity", () => {
    renderWithIntl(<FindingsPanel findings={BOTH} prId="pr1" severity="WARNING" />);
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("keeps dismissed findings visible — they only drop out of the counters", () => {
    renderWithIntl(
      <FindingsPanel
        findings={[{ ...CRITICAL_FINDING, dismissed_at: "2026-08-01T00:00:00.000Z" }]}
        prId="pr1"
        severity="CRITICAL"
      />,
    );
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the filter empty state when this run has nothing at that severity", () => {
    renderWithIntl(<FindingsPanel findings={[CRITICAL_FINDING]} prId="pr1" severity="SUGGESTION" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });
});

describe("FindingsPanel — deep-linked finding", () => {
  const BOTH = [CRITICAL_FINDING, WARNING_FINDING];

  it("scrolls the deep-linked finding into view", () => {
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      this.getBoundingClientRect = () =>
        ({ top: 100, bottom: 300 }) as DOMRect;
    });
    Element.prototype.scrollIntoView = scrollIntoView;

    renderWithIntl(<FindingsPanel findings={BOTH} prId="pr1" targetFindingId="f2" />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("keeps retrying while the target is still out of view", () => {
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      this.getBoundingClientRect = () => ({ top: -900, bottom: -700 }) as DOMRect;
    });
    Element.prototype.scrollIntoView = scrollIntoView;

    renderWithIntl(<FindingsPanel findings={BOTH} prId="pr1" targetFindingId="f2" />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(scrollIntoView.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not scroll when no finding is deep-linked", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderWithIntl(<FindingsPanel findings={BOTH} prId="pr1" />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
