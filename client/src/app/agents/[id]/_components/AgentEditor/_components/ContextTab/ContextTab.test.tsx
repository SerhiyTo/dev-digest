import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DocAttachment, ProjectDoc, ProjectDocList } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
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

const ATTACHED_TO_LISTED_DOCS: DocAttachment[] = [
  { path: "docs/api.md", order: 1 },
  { path: "specs/auth.md", order: 0 },
];

let ATTACHMENTS: DocAttachment[] = ATTACHED_TO_LISTED_DOCS;

const ROWS = ["true auth.md", "true api.md", "false rollout.md"];

const MOVE_CONTROLS = [
  "Move up: specs/auth.md",
  "Move down: specs/auth.md",
  "Move up: docs/api.md",
  "Move down: docs/api.md",
];

function renderTab(agentId = "agent-77") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
      <ContextTab agentId={agentId} />
    </NextIntlClientProvider>,
  );
}

function rowSignature(): string[] {
  return screen
    .getAllByRole("checkbox")
    .map((box) => `${box.getAttribute("aria-checked")} ${box.parentElement?.textContent}`);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  repo.id = "repo-1";
  repo.fullName = "acme/payments-api";
  save.error = null;
  ATTACHMENTS = ATTACHED_TO_LISTED_DOCS;
});

describe("the agent editor's Context tab", () => {
  it("addresses the agent attachment endpoint for this agent, against the active repository", () => {
    renderTab("agent-77");

    expect(seen.ownerKind).toBe("agents");
    expect(seen.ownerId).toBe("agent-77");
    expect(seen.setOwner).toBe("agents/agent-77");
    expect(seen.repoId).toBe("repo-1");
  });

  it("renders the shipped agents strings around the shared panel", () => {
    renderTab();

    expect(screen.getByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.getByText("2 attached · 3 in acme/payments-api")).toBeInTheDocument();
    expect(
      screen.getByText("≈12,400 tokens per run — an estimate, not an exact count"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter documents…")).toBeInTheDocument();
  });

  it("renders the attached rows in order with a keyboard reorder control on each", () => {
    renderTab();

    expect(rowSignature()).toEqual(ROWS);
    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(MOVE_CONTROLS);

    fireEvent.click(screen.getByRole("button", { name: "Move down: specs/auth.md" }));
    expect(mutate).toHaveBeenCalledWith(["docs/api.md", "specs/auth.md"]);
  });

  it("names the repository the documents came from and how attachments resolve", () => {
    renderTab();

    expect(screen.getByText(/Showing the documents found in acme\/payments-api/)).toHaveTextContent(
      "An attachment is stored as a file path, not a link to a repository",
    );
  });

  it("tells an unlisted attachment apart from a deleted one without asserting either", () => {
    ATTACHMENTS = [
      { path: "specs/auth.md", order: 0 },
      { path: "specs/from-another-repo.md", order: 1 },
    ];
    renderTab();

    const badge = screen.getByText("not in this repo");
    expect(badge.closest("[title]")?.getAttribute("title")).toBe(
      "This path is not in the document list for acme/payments-api. It may be attached from a " +
        "different repository, or it may have been deleted, renamed, or dropped beyond the " +
        "discovery cap — this page cannot tell which. The attachment is kept, and each run " +
        "resolves it against the repository that run is on.",
    );
  });

  it("shows the shipped wording for a rejected save that hit the attachment limit", () => {
    save.error = new ApiError("at most 20 documents; 21 were sent", 409, "conflict");
    renderTab();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not saved — an agent or skill may attach at most 20 documents. Detach one first.",
    );
  });

  it("shows the shipped wording for a rejected save with a bad path", () => {
    save.error = new ApiError("Not a project document path: ../etc/passwd", 400, "invalid_path");
    renderTab();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not saved — one of those paths is not a project document path.",
    );
  });

  it("shows the shipped wording for a rejected save whose owner is gone", () => {
    save.error = new ApiError("Agent not found", 404, "not_found");
    renderTab();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not saved — this agent or skill no longer exists. Reload the page.",
    );
  });

  it("shows the shipped wording for a rejected save the server could not complete", () => {
    save.error = new ApiError("Project context failed its own contract", 500, "internal_error");
    renderTab();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not saved — the server could not complete the change. Try again.",
    );
  });

  it("shows the shipped fallback wording for a code it does not recognise", () => {
    save.error = new ApiError("Rate limit exceeded", 429, "rate_limited");
    renderTab();

    expect(screen.getByRole("alert")).toHaveTextContent("Not saved — Rate limit exceeded");
  });

  it("names the missing repository instead of rendering an attach list", () => {
    repo.id = null;
    renderTab();

    expect(screen.getByText("No repository selected")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
