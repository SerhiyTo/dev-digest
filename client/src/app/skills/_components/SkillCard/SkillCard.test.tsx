import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem } from "../../../../lib/hooks/skills";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";
import { formatPercentMetric } from "./helpers";

afterEach(cleanup);

const SKILL: SkillListItem = {
  id: "sk1",
  name: "Test coverage rubric",
  description: "Flags uncovered branches and removed assertions",
  type: "rubric",
  source: "manual",
  body: "# Rule\nDescribe the rule…",
  enabled: true,
  version: 1,
  used_by: 2,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("formatPercentMetric", () => {
  it("renders an em dash for null", () => {
    expect(formatPercentMetric(null)).toBe("—");
  });

  it("renders an em dash for undefined", () => {
    expect(formatPercentMetric(undefined)).toBe("—");
  });

  it("renders a real zero as 0%, not an em dash", () => {
    expect(formatPercentMetric(0)).toBe("0%");
  });

  it("rounds a fraction to a whole percent", () => {
    expect(formatPercentMetric(0.427)).toBe("43%");
  });
});

describe("SkillCard (smoke)", () => {
  it("shows the needs-vetting badge for a non-manual source", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "imported_file" }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does not show the needs-vetting badge for a manual skill", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("toggling calls onToggle with the flipped enabled value", () => {
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onToggle={onToggle} />);
    screen.getByRole("switch").click();
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("renders used_by in the footer", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, used_by: 5 }} />);
    expect(screen.getByText("5 agents")).toBeInTheDocument();
  });

  it("shows only the agent count: no placeholder pull/accept metrics the list query cannot supply", () => {
    const { container } = renderWithIntl(<SkillCard skill={SKILL} />);
    expect(container.textContent).not.toContain("pull");
    expect(container.textContent).not.toContain("accept");
    expect(container.textContent).not.toContain("—");
    expect(container.textContent).not.toContain("0%");
  });
});
