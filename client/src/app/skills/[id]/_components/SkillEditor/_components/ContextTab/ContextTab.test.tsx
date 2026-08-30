import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DocAttachment, ProjectDoc, ProjectDocList } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import { ApiError } from "@/lib/api";

const mutate = vi.fn();
const repo: { id: string | null; fullName: string | null } = {
  id: "repo-1",
  fullName: "acme/payments-api",
};
const save: { error: unknown } = { error: null };
const seen: { repoId: string | null; ownerKind: string; ownerId: string; setOwner: string } = {
  repoId: "",
  ownerKind: "",
  ownerId: "",
  setOwner: "",
};

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: repo.id,
    activeRepo: repo.fullName === null ? null : { id: repo.id, full_name: repo.fullName },
  }),
}));

vi.mock("@/lib/hooks/context", () => ({
  useProjectDocs: (repoId: string | null) => {
    seen.repoId = repoId;
    return { data: DOCS, isError: false, refetch: vi.fn() };
  },
  useDocAttachments: (kind: string, ownerId: string) => {
    seen.ownerKind = kind;
    seen.ownerId = ownerId;
    return { data: ATTACHMENTS, isError: false, refetch: vi.fn() };
  },
  useSetDocAttachments: (kind: string, ownerId: string) => {
    seen.setOwner = `${kind}/${ownerId}`;
    return { mutate, isPending: false, error: save.error };
  },
  useTokenEstimate: () => ({
    data: { tokens: 12400, estimator: "cl100k_base" as const },
    isError: false,
  }),
}));

const { ContextTab } = await import("./ContextTab");
const { ContextTab: AgentContextTab } = await import(
  "@/app/agents/[id]/_components/AgentEditor/_components/ContextTab"
);

function doc(path: string, category: ProjectDoc["category"]): ProjectDoc {
  return {
    path,
    name: path.split("/").pop()!,
    folder: path.slice(0, path.lastIndexOf("/")),
    category,
    used_by_agents: [],
  };
}

const DOCS: ProjectDocList = {
  documents: [
    doc("specs/auth.md", "specs"),
    doc("docs/api.md", "docs"),
    doc("plans/rollout.md", "plans"),
  ],
  omitted: 0,
  reason: null,
  last_synced_at: null,
};

const ATTACHMENTS: DocAttachment[] = [
  { path: "docs/api.md", order: 1 },
  { path: "specs/auth.md", order: 0 },
];

const MESSAGES = { agents: agentsMessages, skills: skillsMessages };

function renderTab(skillId = "skill-42") {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <ContextTab skillId={skillId} />
    </NextIntlClientProvider>,
  );
}

function renderAgentTab(agentId = "agent-77") {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <AgentContextTab agentId={agentId} />
    </NextIntlClientProvider>,
  );
}

function rendered(): {
  rows: string[];
  controls: (string | null)[];
  footer: string;
  scope: string;
  saveError: string;
} {
  return {
    rows: screen
      .getAllByRole("checkbox")
      .map((box) => `${box.getAttribute("aria-checked")} ${box.parentElement?.textContent}`),
    controls: screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label")),
    footer: screen.getByText(/tokens per run/).textContent ?? "",
    scope: screen.getByText(/Showing the documents found in/).textContent ?? "",
    saveError: screen.getByRole("alert").textContent ?? "",
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  repo.id = "repo-1";
  repo.fullName = "acme/payments-api";
  save.error = null;
});

describe("the skill editor's Context tab", () => {
  it("addresses the skill attachment endpoint for this skill, against the active repository", () => {
    renderTab("skill-42");

    expect(seen.ownerKind).toBe("skills");
    expect(seen.ownerId).toBe("skill-42");
    expect(seen.setOwner).toBe("skills/skill-42");
    expect(seen.repoId).toBe("repo-1");
  });

  it("persists a reorder through the skill's own attachment mutation", () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Move down: specs/auth.md" }));
    expect(mutate).toHaveBeenCalledWith(["docs/api.md", "specs/auth.md"]);
    expect(seen.setOwner).toBe("skills/skill-42");
  });

  it("names the missing repository instead of rendering an attach list", () => {
    repo.id = null;
    renderTab();

    expect(screen.getByText("No repository selected")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("the Skill and Agent Context tabs present the same surface", () => {
  it("renders the same rows, the same ordering controls and the same estimate footer", () => {
    save.error = new ApiError("at most 20 documents; 21 were sent", 409, "conflict");
    renderAgentTab();
    const onTheAgentTab = rendered();

    cleanup();
    renderTab();
    const onTheSkillTab = rendered();

    expect(onTheSkillTab).toEqual(onTheAgentTab);
    expect(onTheSkillTab.rows).toEqual(["true auth.md", "true api.md", "false rollout.md"]);
    expect(onTheSkillTab.controls).toEqual([
      "Move up: specs/auth.md",
      "Move down: specs/auth.md",
      "Move up: docs/api.md",
      "Move down: docs/api.md",
    ]);
    expect(onTheSkillTab.scope).toContain("acme/payments-api");
    expect(onTheSkillTab.saveError).toBe(
      "Not saved — an agent or skill may attach at most 20 documents. Detach one first.",
    );
  });
});
