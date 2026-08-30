import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SectionCard } from "./SectionCard";

afterEach(cleanup);

describe("SectionCard", () => {
  it("collapses independently of a sibling card via a focusable, native button toggle", () => {
    render(
      <>
        <SectionCard title="Architecture">
          <p>Architecture body</p>
        </SectionCard>
        <SectionCard title="Critical paths">
          <p>Critical paths body</p>
        </SectionCard>
      </>,
    );

    const architectureToggle = screen.getByRole("button", {
      name: "Architecture",
      expanded: true,
    });
    const criticalPathsToggle = screen.getByRole("button", {
      name: "Critical paths",
      expanded: true,
    });
    expect(architectureToggle.tagName).toBe("BUTTON");
    expect(screen.getByText("Architecture body")).toBeVisible();
    expect(screen.getByText("Critical paths body")).toBeVisible();

    architectureToggle.focus();
    expect(architectureToggle).toHaveFocus();

    fireEvent.click(architectureToggle);

    expect(
      screen.getByRole("button", { name: "Architecture", expanded: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("Architecture body")).not.toBeVisible();
    expect(criticalPathsToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Critical paths body")).toBeVisible();

    fireEvent.click(architectureToggle);

    expect(
      screen.getByRole("button", { name: "Architecture", expanded: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("Architecture body")).toBeVisible();
  });

  it("does not persist the collapsed state across a remount", () => {
    const { unmount } = render(
      <SectionCard title="Architecture">
        <p>Architecture body</p>
      </SectionCard>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Architecture" }));
    expect(
      screen.getByRole("button", { name: "Architecture", expanded: false }),
    ).toBeInTheDocument();
    unmount();

    render(
      <SectionCard title="Architecture">
        <p>Architecture body</p>
      </SectionCard>,
    );

    expect(
      screen.getByRole("button", { name: "Architecture", expanded: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("Architecture body")).toBeVisible();
  });
});
