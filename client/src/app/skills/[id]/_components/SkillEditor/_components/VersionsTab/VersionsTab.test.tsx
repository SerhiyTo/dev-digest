import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const useSkillVersions = vi.fn();
const useRestoreSkillVersion = vi.fn();
const useSkillVersionDiff = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: (...args: unknown[]) => useSkillVersions(...args),
  useRestoreSkillVersion: (...args: unknown[]) => useRestoreSkillVersion(...args),
  useSkillVersionDiff: (...args: unknown[]) => useSkillVersionDiff(...args),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "List the uncovered branches in the diff",
  type: "rubric",
  source: "manual",
  body: "current body",
  enabled: true,
  version: 3,
};

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 3, body: "current body", label: null, created_at: "2026-08-04T10:00:00.000Z" },
  {
    skill_id: "sk1",
    version: 2,
    body: "v2 body",
    label: "Tightened wording",
    created_at: "2026-08-03T10:00:00.000Z",
  },
  { skill_id: "sk1", version: 1, body: "v1 body", label: null, created_at: "2026-08-01T10:00:00.000Z" },
];

const restoreMutate = vi.fn();

function renderTab() {
  useSkillVersions.mockReturnValue({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() });
  useRestoreSkillVersion.mockReturnValue({ mutate: restoreMutate, isPending: false });
  useSkillVersionDiff.mockReturnValue({ data: undefined, isLoading: false });
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <VersionsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

function rowFor(versionLabel: string) {
  return screen.getByText(versionLabel).closest("div")!.parentElement!;
}

describe("VersionsTab", () => {
  it("the current version shows the Current badge and has no Diff/Restore actions", () => {
    renderTab();
    const row = rowFor("v3");
    expect(within(row).getByText("Current")).toBeInTheDocument();
    expect(within(row).queryByText("Diff")).not.toBeInTheDocument();
    expect(within(row).queryByText("Restore")).not.toBeInTheDocument();
  });

  it("an older version has both a Diff and a Restore action, and no Current badge", () => {
    renderTab();
    const row = rowFor("v2");
    expect(within(row).getByText("Diff")).toBeInTheDocument();
    expect(within(row).getByText("Restore")).toBeInTheDocument();
    expect(within(row).queryByText("Current")).not.toBeInTheDocument();
  });

  it("clicking Restore confirms then issues the restore call for the right skill id and version", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderTab();
    within(rowFor("v2")).getByText("Restore").click();
    expect(useRestoreSkillVersion).toHaveBeenCalledWith("sk1");
    expect(restoreMutate).toHaveBeenCalledWith(2);
  });

  it("does not restore when the confirm step is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTab();
    within(rowFor("v1")).getByText("Restore").click();
    expect(restoreMutate).not.toHaveBeenCalled();
  });

  it("renders a version's label, and a version with no label shows neither a stray separator nor the string null", () => {
    const { container } = renderTab();
    expect(screen.getByText("Tightened wording")).toBeInTheDocument();
    expect(container.textContent).not.toContain("null");
    expect(container.textContent).not.toMatch(/v1\s*·\s*(?=\s|$)/);
  });
});
