import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionSkillDraft } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";

const mutateAsync = vi.fn().mockResolvedValue({ id: "sk1" });
const draftState: { data: ConventionSkillDraft | undefined; isLoading: boolean } = {
  data: undefined,
  isLoading: false,
};

vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDraft: () => draftState,
  useCreateSkillFromConventions: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { CreateSkillFromConventionsModal } = await import("./CreateSkillFromConventionsModal");

const DRAFT: ConventionSkillDraft = {
  slug: "payments-api-conventions",
  name: "payments-api-conventions",
  description: "2 house conventions extracted from payments-api",
  type: "convention",
  body: "# payments-api-conventions\n\nHouse conventions.\n",
  evidence_files: ["src/api/users.ts"],
  merged_count: 2,
  existing_skill: null,
  body_patch: null,
};

beforeEach(() => {
  mutateAsync.mockClear();
  draftState.data = DRAFT;
  draftState.isLoading = false;
});
afterEach(cleanup);

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateSkillFromConventionsModal
        repoId="r1"
        repoName="payments-api"
        onClose={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

/** The body editor's textarea; its multi-line value defeats getByDisplayValue's
 *  whitespace normalisation, so it is addressed by placeholder. */
function bodyEditor(): HTMLTextAreaElement {
  return screen.getByPlaceholderText("The merged skill body, in markdown.") as HTMLTextAreaElement;
}

describe("CreateSkillFromConventionsModal", () => {
  it("seeds its fields from the server-generated draft", () => {
    renderModal();

    expect(screen.getByDisplayValue("payments-api-conventions")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("2 house conventions extracted from payments-api"),
    ).toBeInTheDocument();
    expect(bodyEditor().value).toBe(DRAFT.body);
  });

  it("states how many conventions were merged and from where", () => {
    renderModal();

    expect(screen.getByText(/2 accepted conventions/)).toBeInTheDocument();
    expect(screen.getByText("payments-api")).toBeInTheDocument();
  });

  it("renders the Enabled toggle off and non-interactive", () => {
    const { container } = renderModal();
    const toggle = screen.getByRole("switch");

    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector('[aria-disabled="true"]')).toContainElement(toggle);
  });

  it("submits the user's edits rather than the original draft", async () => {
    renderModal();

    fireEvent.change(bodyEditor(), { target: { value: "# edited body" } });
    fireEvent.click(screen.getByText("Create skill"));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: DRAFT.name, body: "# edited body" }),
    );
    expect(mutateAsync.mock.calls[0]![0]).not.toHaveProperty("skill_id");
  });

  it("switches to update mode when the repo already has an extracted skill", async () => {
    draftState.data = {
      ...DRAFT,
      existing_skill: { id: "sk-existing", name: "payments-api-conventions", version: 1 },
      body_patch: "@@ -1 +1 @@\n+Redis access goes through",
    };
    renderModal();

    expect(screen.getByText("Update skill from conventions")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Show what changes"));
    expect(screen.getByText(/Redis access goes through/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Update skill"));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ skill_id: "sk-existing" }),
    );
  });

  it("shows a loading note until the draft arrives", () => {
    draftState.data = undefined;
    draftState.isLoading = true;
    renderModal();

    expect(screen.getByText("Building the draft…")).toBeInTheDocument();
  });
});
