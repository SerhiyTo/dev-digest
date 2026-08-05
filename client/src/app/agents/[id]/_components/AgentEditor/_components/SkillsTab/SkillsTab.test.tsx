import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentSkillLink } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import type { SkillListItem } from "../../../../../../../lib/hooks/skills";
import { move } from "./helpers";

const useSkillsMock = vi.fn();
const useAgentSkillsMock = vi.fn();
const mutateMock = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => useSkillsMock(),
}));

vi.mock("../../../../../../../lib/hooks/agent-skills", () => ({
  useAgentSkills: () => useAgentSkillsMock(),
  useSetAgentSkills: () => ({ mutate: mutateMock, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(agentId = "ag1") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agentId={agentId} />
    </NextIntlClientProvider>,
  );
}

function skill(over: Partial<SkillListItem> & Pick<SkillListItem, "id" | "name">): SkillListItem {
  return {
    description: "desc",
    type: "rubric",
    source: "manual",
    body: "body",
    enabled: true,
    version: 1,
    used_by: 0,
    ...over,
  };
}

const SKILLS: SkillListItem[] = [
  skill({ id: "sk1", name: "Test coverage rubric" }),
  skill({ id: "sk2", name: "Security checklist" }),
  skill({ id: "sk3", name: "Naming conventions" }),
  skill({ id: "sk4", name: "Mock overuse gate" }),
];

const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "sk1", order: 0 },
  { agent_id: "ag1", skill_id: "sk2", order: 1 },
];

describe("SkillsTab", () => {
  beforeEach(() => {
    useSkillsMock.mockReturnValue({ data: SKILLS });
    useAgentSkillsMock.mockReturnValue({ data: LINKS });
  });

  it("shows the linked/total count in the heading", () => {
    renderWithIntl();
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
  });

  it("checking an unlinked skill sends the existing linked ids in order, then the new one", () => {
    renderWithIntl();
    fireEvent.click(screen.getByRole("checkbox", { name: "Mock overuse gate" }));
    expect(mutateMock).toHaveBeenCalledWith(["sk1", "sk2", "sk4"]);
  });

  it("unchecking a linked skill sends the remaining ids in their original relative order", () => {
    renderWithIntl();
    fireEvent.click(screen.getByRole("checkbox", { name: "Test coverage rubric" }));
    expect(mutateMock).toHaveBeenCalledWith(["sk2"]);
  });

  it("does not send a truncated skill_ids array after the list has been filtered", () => {
    renderWithIntl();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "mock" } });
    expect(screen.queryByRole("checkbox", { name: "Test coverage rubric" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Security checklist" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Mock overuse gate" }));

    expect(mutateMock).toHaveBeenCalledWith(["sk1", "sk2", "sk4"]);
  });

  it("filtering to a linked skill and unchecking it still sends the full remaining set", () => {
    renderWithIntl();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "coverage" } });
    expect(screen.queryByRole("checkbox", { name: "Security checklist" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Test coverage rubric" }));

    expect(mutateMock).toHaveBeenCalledWith(["sk2"]);
  });

  it("marks a globally-disabled skill as disabled without hiding the row", () => {
    useSkillsMock.mockReturnValue({
      data: [
        skill({ id: "sk1", name: "Test coverage rubric", enabled: false }),
        skill({ id: "sk2", name: "Security checklist" }),
      ],
    });
    renderWithIntl();
    expect(screen.getByRole("checkbox", { name: "Test coverage rubric" })).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });

  it("marks a non-manual-source skill as needing vetting", () => {
    useSkillsMock.mockReturnValue({
      data: [
        skill({ id: "sk1", name: "Test coverage rubric", source: "imported_file" }),
        skill({ id: "sk2", name: "Security checklist" }),
      ],
    });
    renderWithIntl();
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("renders no interactive row and fires no mutation while the linked set is still loading", () => {
    useAgentSkillsMock.mockReturnValue({ data: undefined, isLoading: true });
    renderWithIntl();

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("checkbox", { name: "Mock overuse gate" })).not.toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("shows an error instead of a mutable list when the linked set fails to load", () => {
    const refetch = vi.fn();
    useAgentSkillsMock.mockReturnValue({ data: undefined, isError: true, refetch });
    renderWithIntl();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("does not treat a resolved skill list plus an unresolved link list as zero links", () => {
    useSkillsMock.mockReturnValue({ data: SKILLS });
    useAgentSkillsMock.mockReturnValue({ data: undefined });
    renderWithIntl();

    expect(screen.queryByText("0 of 4 enabled")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("dragging a linked row onto another linked row sends the reordered full list", () => {
    renderWithIntl();
    const from = screen.getByRole("checkbox", { name: "Test coverage rubric" }).closest("[draggable]")!;
    const onto = screen.getByRole("checkbox", { name: "Security checklist" }).closest("[draggable]")!;

    fireEvent.dragStart(from);
    fireEvent.drop(onto);

    expect(mutateMock).toHaveBeenCalledWith(["sk2", "sk1"]);
  });
});

describe("move", () => {
  const list = ["a", "b", "c", "d"];

  it("moves an item down toward the tail", () => {
    expect(move(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up toward the head", () => {
    expect(move(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves an item to the head", () => {
    expect(move(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("moves an item to the tail", () => {
    expect(move(list, 0, 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("is a no-op when the source and target are the same index", () => {
    expect(move(list, 2, 2)).toEqual(["a", "b", "c", "d"]);
  });
});
