import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { RiskList } from "./RiskList";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ brief: messages }}>{ui}</NextIntlClientProvider>);
}

const EXPANDABLE_RISK: Risk = {
  kind: "security",
  title: "Missing auth check on export route",
  explanation: "The export handler skips the workspace ownership check present on every other route.",
  severity: "high",
  file_refs: ["src/modules/export/routes.ts:42-58", "src/modules/export/service.ts:12"],
};

const NON_EXPANDABLE_RISK: Risk = {
  kind: "style",
  title: "Inconsistent error message casing",
  explanation: "",
  severity: "low",
  file_refs: ["src/lib/errors.ts:9"],
};

describe("RiskList — collapsed and expanded rows", () => {
  it("shows icon, title and first ref collapsed, then explanation and all refs when expanded", () => {
    renderWithIntl(<RiskList risks={[EXPANDABLE_RISK]} repoFullName={null} headSha={null} />);

    expect(screen.getByText("Missing auth check on export route")).toBeInTheDocument();
    expect(screen.getByText("src/modules/export/routes.ts:42-58")).toBeInTheDocument();
    expect(screen.queryByText(/workspace ownership check/)).not.toBeInTheDocument();
    expect(screen.queryByText("src/modules/export/service.ts:12")).not.toBeInTheDocument();

    const row = screen.getByRole("button");
    expect(row).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/workspace ownership check/)).toBeInTheDocument();
    expect(screen.getByText("src/modules/export/service.ts:12")).toBeInTheDocument();
  });

  it("toggles open on Enter and closed on Space from the keyboard", () => {
    renderWithIntl(<RiskList risks={[EXPANDABLE_RISK]} repoFullName={null} headSha={null} />);

    const row = screen.getByRole("button");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(row).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(row, { key: " " });
    expect(row).toHaveAttribute("aria-expanded", "false");
  });
});

describe("RiskList — ref rendering", () => {
  it("renders refs as GitHub links when repoFullName and headSha are known", () => {
    renderWithIntl(<RiskList risks={[EXPANDABLE_RISK]} repoFullName="acme/widgets" headSha="abc1234" />);

    const link = screen.getByText("src/modules/export/routes.ts:42-58");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc1234/src/modules/export/routes.ts#L42-L58",
    );
  });

  it("renders refs as plain monospace text otherwise", () => {
    renderWithIntl(<RiskList risks={[EXPANDABLE_RISK]} repoFullName={null} headSha={null} />);

    const ref = screen.getByText("src/modules/export/routes.ts:42-58");
    expect(ref.tagName).not.toBe("A");
  });
});

describe("RiskList — row layout", () => {
  it("renders the title and the file reference on separate lines within the bordered row", () => {
    const LONG_REF_RISK: Risk = {
      kind: "security",
      title: "Rate limiter bypass via header injection",
      explanation: "",
      severity: "high",
      file_refs: ["src/middleware/ratelimit.ts:12-18"],
    };
    renderWithIntl(<RiskList risks={[LONG_REF_RISK]} repoFullName={null} headSha={null} />);

    const title = screen.getByText("Rate limiter bypass via header injection");
    const reference = screen.getByText("src/middleware/ratelimit.ts:12-18");

    expect(title.parentElement).not.toBe(reference.parentElement);
    expect(reference.parentElement?.parentElement).toBe(title.parentElement?.parentElement);
  });
});

describe("RiskList — empty state", () => {
  it("renders the no-risks empty state instead of omitting the section", () => {
    renderWithIntl(<RiskList risks={[]} repoFullName={null} headSha={null} />);

    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});

describe("RiskList — non-expandable row", () => {
  it("carries none of the disclosure attributes and renders no chevron", () => {
    renderWithIntl(<RiskList risks={[NON_EXPANDABLE_RISK]} repoFullName={null} headSha={null} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const title = screen.getByText("Inconsistent error message casing");
    const row = title.parentElement as HTMLElement;
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("tabIndex");
    expect(row).not.toHaveAttribute("aria-expanded");
    expect(row.querySelector("svg.lucide-chevron-down")).not.toBeInTheDocument();
  });
});
