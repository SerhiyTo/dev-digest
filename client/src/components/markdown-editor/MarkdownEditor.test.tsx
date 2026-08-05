import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MarkdownEditor } from "./MarkdownEditor";

afterEach(cleanup);

const labels = {
  unsaved: "unsaved",
  tokens: "~42 tokens",
  placeholder: "Write markdown",
  tokensHint: "Approximate",
};

function renderEditor(over: Partial<React.ComponentProps<typeof MarkdownEditor>> = {}) {
  return render(
    <MarkdownEditor
      value={"# Title\n\n- one\n- two"}
      onChange={() => {}}
      filename="x.md"
      unsaved={false}
      labels={labels}
      {...over}
    />,
  );
}

function gutterNumbers(container: HTMLElement): string[] {
  return [...container.querySelectorAll("div")]
    .filter((el) => el.children.length === 0 && /^\d+$/.test(el.textContent ?? ""))
    .map((el) => el.textContent ?? "");
}

describe("MarkdownEditor", () => {
  it("renders one gutter number per line", () => {
    const { container } = renderEditor();

    expect(gutterNumbers(container)).toEqual(["1", "2", "3", "4"]);
  });

  it("tracks the gutter to the content it is given", () => {
    const { container } = renderEditor({ value: "one line" });

    expect(gutterNumbers(container)).toEqual(["1"]);
  });

  it("renders the caller's labels rather than its own strings", () => {
    renderEditor({ unsaved: true });

    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("~42 tokens")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write markdown")).toBeInTheDocument();
  });

  it("hides the unsaved badge when the body matches what was saved", () => {
    renderEditor({ unsaved: false });

    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("reports edits to the caller", () => {
    const onChange = vi.fn();
    renderEditor({ onChange });

    fireEvent.change(screen.getByPlaceholderText("Write markdown"), {
      target: { value: "# Changed" },
    });

    expect(onChange).toHaveBeenCalledWith("# Changed");
  });

  it("shows the filename chip", () => {
    renderEditor({ filename: "payments-api-conventions.md" });

    expect(screen.getByText("payments-api-conventions.md")).toBeInTheDocument();
  });
});
