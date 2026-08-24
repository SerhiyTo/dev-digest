import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewFocusRow } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { ReviewFocusCard } from "./ReviewFocusCard";

const ROWS: ReviewFocusRow[] = [
  { file: "src/modules/brief/service.ts", start_line: 40, end_line: 40, reason: "New retry loop around the provider call." },
  { file: "src/modules/brief/repository.ts", start_line: 12, end_line: 18, reason: "Claims the running row without a lock." },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ brief: messages }}>{ui}</NextIntlClientProvider>);
}

afterEach(cleanup);

describe("ReviewFocusCard", () => {
  it("renders every row in prop order, with a count badge and github links when known", () => {
    renderWithIntl(<ReviewFocusCard rows={ROWS} repoFullName="acme/widgets" headSha="abc123" />);

    expect(screen.getByText("Review focus")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("src/modules/brief/service.ts:40");
    expect(links[0]).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc123/src/modules/brief/service.ts#L40",
    );
    expect(links[1]).toHaveTextContent("src/modules/brief/repository.ts:12-18");
    expect(links[1]).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc123/src/modules/brief/repository.ts#L12-L18",
    );

    expect(screen.getByText(ROWS[0]!.reason)).toBeInTheDocument();
    expect(screen.getByText(ROWS[1]!.reason)).toBeInTheDocument();
  });

  it("renders plain monospace refs without a repo or sha, and an empty state with the heading intact when there are no rows", () => {
    renderWithIntl(<ReviewFocusCard rows={ROWS} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("src/modules/brief/service.ts:40")).toBeInTheDocument();
    cleanup();

    renderWithIntl(<ReviewFocusCard rows={[]} />);
    expect(screen.getByText("Review focus")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("No specific lines flagged for review focus.")).toBeInTheDocument();
  });
});
