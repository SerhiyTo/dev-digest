import { describe, it, expect } from "vitest";
import { insertFindingSkeleton, validateExpectedOutputText } from "./helpers";

describe("validateExpectedOutputText", () => {
  it("accepts an empty list and a conforming expectation list, and rejects malformed JSON or a shape the server would reject", () => {
    expect(validateExpectedOutputText("[]")).toEqual({ valid: true, value: [] });

    const conforming = JSON.stringify([
      { kind: "must_find", file: "src/a.ts", line: 3, category: "bug" },
    ]);
    const result = validateExpectedOutputText(conforming);
    expect(result.valid).toBe(true);
    expect(result.valid && result.value).toHaveLength(1);

    expect(validateExpectedOutputText("{not json")).toEqual({ valid: false });
    expect(
      validateExpectedOutputText(JSON.stringify([{ kind: "must_find", file: "", line: 1, category: "bug" }])),
    ).toEqual({ valid: false });
    expect(
      validateExpectedOutputText(JSON.stringify([{ kind: "not_a_kind", file: "a.ts", line: 1, category: "bug" }])),
    ).toEqual({ valid: false });
  });
});

describe("insertFindingSkeleton", () => {
  it("appends a schema-valid skeleton for the chosen kind onto an existing or empty list", () => {
    const firstInsert = insertFindingSkeleton("[]", "must_find");
    const firstParsed = validateExpectedOutputText(firstInsert);
    expect(firstParsed.valid).toBe(true);
    expect(firstParsed.valid && firstParsed.value).toEqual([
      expect.objectContaining({ kind: "must_find" }),
    ]);

    const secondInsert = insertFindingSkeleton(firstInsert, "must_not_flag");
    const secondParsed = validateExpectedOutputText(secondInsert);
    expect(secondParsed.valid).toBe(true);
    expect(secondParsed.valid && secondParsed.value.map((e) => e.kind)).toEqual([
      "must_find",
      "must_not_flag",
    ]);
  });

  it("starts from an empty list when the current text is not valid JSON", () => {
    const inserted = insertFindingSkeleton("not json at all", "must_not_flag");
    const parsed = validateExpectedOutputText(inserted);
    expect(parsed.valid).toBe(true);
    expect(parsed.valid && parsed.value).toEqual([
      expect.objectContaining({ kind: "must_not_flag" }),
    ]);
  });
});
