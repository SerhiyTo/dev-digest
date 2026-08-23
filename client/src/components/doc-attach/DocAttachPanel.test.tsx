import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { DocAttachment, ProjectDoc, ProjectDocList, TokenEstimate } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import agentsMessages from "../../../messages/en/agents.json";
import skillsMessages from "../../../messages/en/skills.json";
import type { DocAttachLabels } from "./DocAttachPanel";

const mutate = vi.fn();
const estimateCalls: string[][] = [];

const state: {
  docs: ProjectDocList | undefined;
  docsError: boolean;
  attachments: DocAttachment[] | undefined;
  attachmentsError: boolean;
  estimate: { data: TokenEstimate | undefined; isError: boolean };
  saveError: unknown;
} = {
  docs: undefined,
  docsError: false,
  attachments: undefined,
  attachmentsError: false,
  estimate: { data: undefined, isError: false },
  saveError: null,
};

vi.mock("@/lib/hooks/context", () => ({
  useProjectDocs: () => ({ data: state.docs, isError: state.docsError, refetch: vi.fn() }),
  useDocAttachments: () => ({
    data: state.attachments,
    isError: state.attachmentsError,
    refetch: vi.fn(),
  }),
  useSetDocAttachments: () => ({ mutate, isPending: false, error: state.saveError }),
  useTokenEstimate: (_repoId: string | null, paths: string[]) => {
    estimateCalls.push(paths);
    return state.estimate;
  },
}));

const { DocAttachPanel } = await import("./DocAttachPanel");
const { MAX_ATTACHMENTS } = await import("./constants");

const LABELS: DocAttachLabels = {
  title: "Project context",
  attachedCount: (attached, total, repo) => `${attached} attached · ${total} in ${repo}`,
  scopeNote: (repo) => `Showing the documents found in ${repo}`,
  repoUnknown: "the selected repository",
  filterPlaceholder: "Filter documents…",
  orderHint: "Order matters",
  missing: "not in this repo",
  missingTitle: (repo) => `This path is not in the document list for ${repo}`,
  moveUp: "Move up",
  moveDown: "Move down",
  tokenEstimate: (tokens) =>
    `≈${tokens.toLocaleString("en-US")} tokens per run — an estimate, not an exact count`,
  estimatePending: "Estimating tokens…",
  estimateUnavailable: "Token estimate unavailable",
  limitReached: (max) => `Limit reached — ${max} documents`,
  saveErrorLimit: (max) => `Not saved — at most ${max} documents`,
  saveErrorInvalidPath: "Not saved — not a project document path",
  saveErrorOwnerGone: "Not saved — this agent or skill no longer exists",
  saveErrorServer: "Not saved — the server could not complete the change",
  saveErrorUnknown: (message) => `Not saved — ${message}`,
  loadError: "Could not load the project documents",
  noRepo: "No repository selected",
  noDocumentsTitle: "No documents to attach",
  noDocumentsBody: "This repository has no markdown under docs/, specs/, plans/ or insights/",
};

function doc(path: string, category: ProjectDoc["category"]): ProjectDoc {
  return {
    path,
    name: path.split("/").pop()!,
    folder: path.slice(0, path.lastIndexOf("/")),
    category,
    used_by_agents: [],
  };
}

const DOCS: ProjectDoc[] = [
  doc("specs/auth.md", "specs"),
  doc("docs/api.md", "docs"),
  doc("plans/rollout.md", "plans"),
];

function list(over: Partial<ProjectDocList> = {}): ProjectDocList {
  return { documents: DOCS, omitted: 0, reason: null, last_synced_at: null, ...over };
}

const REPO = "acme/payments-api";

function renderPanel(repoId: string | null = "repo-1", repoName: string | null = REPO) {
  return render(
    <DocAttachPanel
      ownerKind="agents"
      ownerId="ag1"
      repoId={repoId}
      repoName={repoName}
      labels={LABELS}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  estimateCalls.length = 0;
});

beforeEach(() => {
  state.docs = list();
  state.docsError = false;
  state.attachments = [
    { path: "docs/api.md", order: 1 },
    { path: "specs/auth.md", order: 0 },
  ];
  state.attachmentsError = false;
  state.estimate = { data: { tokens: 12400, estimator: "cl100k_base" }, isError: false };
  state.saveError = null;
});

describe("DocAttachPanel", () => {
  it("lists attachments in order above the rest, with the attached/total badge and an estimated footer", () => {
    renderPanel();

    expect(screen.getByText("2 attached · 3 in acme/payments-api")).toBeInTheDocument();

    const checked = screen
      .getAllByRole("checkbox")
      .filter((box) => box.getAttribute("aria-checked") === "true");
    expect(checked.map((box) => box.parentElement?.textContent)).toEqual(["auth.md", "api.md"]);

    expect(screen.getByRole("checkbox", { name: "rollout.md" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(
      screen.getByText("≈12,400 tokens per run — an estimate, not an exact count"),
    ).toBeInTheDocument();
  });

  it("attaching and detaching PUT the whole ordered path list", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("checkbox", { name: "rollout.md" }));
    expect(mutate).toHaveBeenCalledWith(["specs/auth.md", "docs/api.md", "plans/rollout.md"]);

    mutate.mockClear();
    fireEvent.click(screen.getByRole("checkbox", { name: "auth.md" }));
    expect(mutate).toHaveBeenCalledWith(["docs/api.md"]);
  });

  it("reorders from the keyboard with the up/down buttons, and no-ops at the ends", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Move down: specs/auth.md" }));
    expect(mutate).toHaveBeenCalledWith(["docs/api.md", "specs/auth.md"]);

    mutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Move up: docs/api.md" }));
    expect(mutate).toHaveBeenCalledWith(["docs/api.md", "specs/auth.md"]);

    mutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Move up: specs/auth.md" }));
    fireEvent.click(screen.getByRole("button", { name: "Move down: docs/api.md" }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("reorders by dragging one attached row onto another", () => {
    renderPanel();

    const from = screen.getByRole("checkbox", { name: "auth.md" }).closest("[draggable]")!;
    const onto = screen.getByRole("checkbox", { name: "api.md" }).closest("[draggable]")!;

    fireEvent.dragStart(from);
    fireEvent.drop(onto);

    expect(mutate).toHaveBeenCalledWith(["docs/api.md", "specs/auth.md"]);
  });

  it("keeps an attachment whose document was deleted, rendered as missing", () => {
    state.attachments = [
      { path: "specs/auth.md", order: 0 },
      { path: "specs/deleted.md", order: 1 },
    ];
    renderPanel();

    const missing = screen.getByRole("checkbox", { name: "deleted.md" });
    expect(missing).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("not in this repo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "rollout.md" }));
    expect(mutate).toHaveBeenCalledWith([
      "specs/auth.md",
      "specs/deleted.md",
      "plans/rollout.md",
    ]);
  });

  it("keeps an attachment the server omitted from a capped list, rendered as missing", () => {
    state.docs = list({ omitted: 12 });
    state.attachments = [{ path: "specs/beyond-the-cap.md", order: 0 }];
    renderPanel();

    expect(screen.getByRole("checkbox", { name: "beyond-the-cap.md" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("not in this repo")).toBeInTheDocument();
    expect(screen.getByText("1 attached · 3 in acme/payments-api")).toBeInTheDocument();
  });

  it("reorders a missing attachment like any other row, keeping it in the saved order", () => {
    state.attachments = [
      { path: "specs/auth.md", order: 0 },
      { path: "specs/deleted.md", order: 1 },
      { path: "docs/api.md", order: 2 },
    ];
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Move up: specs/deleted.md" }));
    expect(mutate).toHaveBeenCalledWith([
      "specs/deleted.md",
      "specs/auth.md",
      "docs/api.md",
    ]);

    mutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Move down: specs/deleted.md" }));
    expect(mutate).toHaveBeenCalledWith([
      "specs/auth.md",
      "docs/api.md",
      "specs/deleted.md",
    ]);
  });

  it("lets a missing attachment be detached, and keeps it when a neighbour is detached", () => {
    state.attachments = [
      { path: "specs/auth.md", order: 0 },
      { path: "specs/deleted.md", order: 1 },
    ];
    renderPanel();

    fireEvent.click(screen.getByRole("checkbox", { name: "deleted.md" }));
    expect(mutate).toHaveBeenCalledWith(["specs/auth.md"]);

    mutate.mockClear();
    fireEvent.click(screen.getByRole("checkbox", { name: "auth.md" }));
    expect(mutate).toHaveBeenCalledWith(["specs/deleted.md"]);
  });

  it("never asks the server to estimate more than the attachment limit", () => {
    state.attachments = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => ({
      path: `specs/doc-${String(i).padStart(2, "0")}.md`,
      order: i,
    }));
    renderPanel();

    expect(estimateCalls.at(-1)).toHaveLength(MAX_ATTACHMENTS);
    expect(estimateCalls.every((paths) => paths.length <= MAX_ATTACHMENTS)).toBe(true);
  });

  it("blocks a further attachment at the limit and says so", () => {
    state.attachments = Array.from({ length: MAX_ATTACHMENTS }, (_, i) => ({
      path: `specs/doc-${String(i).padStart(2, "0")}.md`,
      order: i,
    }));
    renderPanel();

    expect(screen.getByText(`Limit reached — ${MAX_ATTACHMENTS} documents`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "rollout.md" }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("says the estimate is unavailable when the estimate request fails, and stays usable", () => {
    state.estimate = { data: undefined, isError: true };
    renderPanel();

    expect(screen.getByText("Token estimate unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText(/tokens per run — an estimate, not an exact count/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "rollout.md" }));
    expect(mutate).toHaveBeenCalledWith(["specs/auth.md", "docs/api.md", "plans/rollout.md"]);
  });

  it("waits for the paths to settle before re-estimating", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderPanel();
      const before = estimateCalls.length;

      state.attachments = [{ path: "plans/rollout.md", order: 0 }];
      rerender(
        <DocAttachPanel ownerKind="agents" ownerId="ag1" repoId="repo-1" repoName={REPO} labels={LABELS} />,
      );
      expect(estimateCalls.at(-1)).toEqual(["specs/auth.md", "docs/api.md"]);
      expect(estimateCalls.length).toBeGreaterThan(before);

      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(estimateCalls.at(-1)).toEqual(["plans/rollout.md"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters both sections without truncating the list it sends", () => {
    renderPanel();

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), {
      target: { value: "rollout" },
    });
    expect(screen.queryByRole("checkbox", { name: "auth.md" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "api.md" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "rollout.md" }));
    expect(mutate).toHaveBeenCalledWith(["specs/auth.md", "docs/api.md", "plans/rollout.md"]);
  });

  it("renders no editable row while either query is unresolved or failed", () => {
    state.attachments = undefined;
    const { rerender } = renderPanel();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    state.attachmentsError = true;
    rerender(<DocAttachPanel ownerKind="agents" ownerId="ag1" repoId="repo-1" repoName={REPO} labels={LABELS} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Could not load the project documents")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("names the missing prerequisite when there is no repository or no document", () => {
    renderPanel(null);
    expect(screen.getByText("No repository selected")).toBeInTheDocument();

    cleanup();
    state.docs = list({ documents: [] });
    state.attachments = [];
    renderPanel();
    expect(screen.getByText("No documents to attach")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("names the repository the documents came from, on the badge and beside the list", () => {
    renderPanel();

    expect(screen.getByText("2 attached · 3 in acme/payments-api")).toBeInTheDocument();
    expect(
      screen.getByText("Showing the documents found in acme/payments-api"),
    ).toBeInTheDocument();
  });

  it("falls back to a neutral repository name while the active repository is unresolved", () => {
    renderPanel("repo-1", null);

    expect(screen.getByText("2 attached · 3 in the selected repository")).toBeInTheDocument();
    expect(
      screen.getByText("Showing the documents found in the selected repository"),
    ).toBeInTheDocument();
  });

  it("words an unlisted attachment as absent from this repository, not as deleted", () => {
    state.attachments = [
      { path: "specs/auth.md", order: 0 },
      { path: "specs/from-another-repo.md", order: 1 },
    ];
    renderPanel();

    const badge = screen.getByText("not in this repo");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("[title]")).toHaveAttribute(
      "title",
      "This path is not in the document list for acme/payments-api",
    );
    expect(screen.getByRole("checkbox", { name: "from-another-repo.md" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("surfaces a rejected save as the limit being reached, and keeps the rows editable", () => {
    state.saveError = new ApiError("at most 20 documents; 21 were sent", 409, "conflict");
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      `Not saved — at most ${MAX_ATTACHMENTS} documents`,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "rollout.md" }));
    expect(mutate).toHaveBeenCalledWith(["specs/auth.md", "docs/api.md", "plans/rollout.md"]);
  });

  it("surfaces a rejected save as a bad path", () => {
    state.saveError = new ApiError("Not a project document path: ../etc", 400, "invalid_path");
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not saved — not a project document path",
    );
  });

  it("surfaces a rejected save as the owner being gone", () => {
    state.saveError = new ApiError("Agent not found", 404, "not_found");
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not saved — this agent or skill no longer exists",
    );
  });

  it("surfaces a rejected save as a server failure", () => {
    state.saveError = new ApiError("failed its own contract", 500, "internal_error");
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not saved — the server could not complete the change",
    );
  });

  it("falls back to the server's own message for a code it does not recognise", () => {
    state.saveError = new ApiError("Rate limit exceeded", 429, "rate_limited");
    renderPanel();

    expect(screen.getByRole("alert")).toHaveTextContent("Not saved — Rate limit exceeded");
  });

  it("shows no save error while the mutation has not failed", () => {
    renderPanel();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Not saved/)).not.toBeInTheDocument();
  });
});

describe("the labels every caller must supply", () => {
  it("exists in the agents and skills message files", () => {
    for (const messages of [agentsMessages, skillsMessages]) {
      const context = messages.context as Record<string, string>;
      for (const key of Object.keys(LABELS)) {
        expect(typeof context[key], `${key} is missing`).toBe("string");
      }
      expect(messages.editor.tabs).toHaveProperty("context");
    }
  });

  it("words the shipped token footer as an estimate rather than an exact count", () => {
    for (const messages of [agentsMessages, skillsMessages]) {
      const tokenEstimate = (messages.context as Record<string, string>).tokenEstimate!;
      expect(tokenEstimate).toContain("≈");
      expect(tokenEstimate).toMatch(/an estimate, not an exact count/);
    }
  });
});
