import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/eval.json";
import { EvalCaseEditor } from "./EvalCaseEditor";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("EvalCaseEditor", () => {
  it("saves an empty expectation list without error, then disables Save while the expected-output field holds invalid JSON", () => {
    const onSave = vi.fn();
    renderWithIntl(<EvalCaseEditor onSave={onSave} />);

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).not.toBeDisabled();
    expect(screen.getByText("valid JSON")).toBeInTheDocument();

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledWith({ name: "", inputDiff: "", expectedOutput: [] });

    const expectedOutputField = screen.getByLabelText("Expected output");
    fireEvent.change(expectedOutputField, { target: { value: "{not valid json" } });

    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    onSave.mockClear();
    fireEvent.click(saveButton);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires choosing a kind before inserting a finding skeleton, and each choice inserts a skeleton of that kind", () => {
    renderWithIntl(<EvalCaseEditor onSave={vi.fn()} />);

    const expectedOutputField = screen.getByLabelText("Expected output") as HTMLTextAreaElement;

    expect(screen.queryByText("Choose a kind")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Insert finding skeleton" }));
    expect(screen.getByText("Choose a kind")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "must_find" }));
    expect(screen.queryByText("Choose a kind")).not.toBeInTheDocument();
    const afterFirstInsert = JSON.parse(expectedOutputField.value);
    expect(afterFirstInsert).toHaveLength(1);
    expect(afterFirstInsert[0].kind).toBe("must_find");

    fireEvent.click(screen.getByRole("button", { name: "Insert finding skeleton" }));
    fireEvent.click(screen.getByRole("button", { name: "must_not_flag" }));
    const afterSecondInsert = JSON.parse(expectedOutputField.value);
    expect(afterSecondInsert).toHaveLength(2);
    expect(afterSecondInsert.map((e: { kind: string }) => e.kind)).toEqual([
      "must_find",
      "must_not_flag",
    ]);

    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });
});
