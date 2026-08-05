import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { zipSync, strToU8 } from "fflate";
import messages from "../../../../../../../messages/en/skills.json";
import { ImportSkillDrawer } from "./ImportSkillDrawer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function readAs<T>(file: File, read: (reader: FileReader) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error);
    read(reader);
  });
}

if (typeof File.prototype.text !== "function") {
  File.prototype.text = function (this: File) {
    return readAs<string>(this, (reader) => reader.readAsText(this));
  };
}
if (typeof File.prototype.arrayBuffer !== "function") {
  File.prototype.arrayBuffer = function (this: File) {
    return readAs<ArrayBuffer>(this, (reader) => reader.readAsArrayBuffer(this));
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function mdFile(name: string, content: string): File {
  return new File([content], name, { type: "text/markdown" });
}

function zipFile(name: string, entries: Record<string, string>): File {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(entries).map(([entryName, content]) => [entryName, strToU8(content)])),
  );
  return new File([zipped], name, { type: "application/zip" });
}

function selectFile(file: File) {
  const input = screen.getByLabelText("Import from file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImportSkillDrawer", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("parses a selected .md file into the preview and issues no network call", async () => {
    renderWithProviders(<ImportSkillDrawer onClose={() => {}} />);

    selectFile(
      mdFile(
        "pr-quality-rubric.md",
        '---\nname: pr-quality-rubric\ndescription: Flags uncovered branches\n---\n# Body\nRule text.',
      ),
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Flags uncovered branches")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists non-markdown archive entries as skipped without leaking their contents, and issues no network call", async () => {
    renderWithProviders(<ImportSkillDrawer onClose={() => {}} />);

    selectFile(
      zipFile("mock-overuse-gate.zip", {
        "SKILL.md": "---\nname: mock-overuse-gate\ndescription: Flags mock overuse\n---\n# Mock overuse gate",
        "install.sh": "echo THIS_SHOULD_NEVER_RENDER",
        "package.json": '{"name":"THIS_SHOULD_NEVER_RENDER_EITHER"}',
      }),
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("mock-overuse-gate")).toBeInTheDocument();
    });

    expect(screen.getByText("skipped: install.sh, package.json")).toBeInTheDocument();
    expect(screen.queryByText(/THIS_SHOULD_NEVER_RENDER/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only fires POST /skills on confirm, with source: imported_file in the body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sk1",
        name: "pr-quality-rubric",
        description: "Flags uncovered branches",
        type: "rubric",
        source: "imported_file",
        body: "# Body\nRule text.",
        enabled: false,
        version: 1,
      }),
    });

    renderWithProviders(<ImportSkillDrawer onClose={() => {}} />);

    selectFile(
      mdFile(
        "pr-quality-rubric.md",
        '---\nname: pr-quality-rubric\ndescription: Flags uncovered branches\n---\n# Body\nRule text.',
      ),
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Import skill"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/skills");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.source).toBe("imported_file");
    expect(body).not.toHaveProperty("enabled");
  });

  it("shows the import banner when the server rejects the create instead of leaving the drawer silent", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: { message: "body: String must contain at least 1 character(s)" } }),
    });

    renderWithProviders(<ImportSkillDrawer onClose={() => {}} />);

    selectFile(
      mdFile(
        "pr-quality-rubric.md",
        '---\nname: pr-quality-rubric\ndescription: Flags uncovered branches\n---\n# Body\nRule text.',
      ),
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("pr-quality-rubric")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Import skill"));

    await waitFor(() => {
      expect(screen.getByText("Import failed")).toBeInTheDocument();
    });
    expect(
      screen.getByText("body: String must contain at least 1 character(s)"),
    ).toBeInTheDocument();
  });

  it("renders a failure message and issues no network call for a .zip with no markdown", async () => {
    renderWithProviders(<ImportSkillDrawer onClose={() => {}} />);

    selectFile(zipFile("no-markdown.zip", { "install.sh": "echo hi" }));

    await waitFor(() => {
      expect(screen.getByText("Import failed")).toBeInTheDocument();
    });
    expect(screen.getByText(/Archive contains no markdown entry/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
