import { describe, it, expect } from "vitest";
import { estimateTokens } from "./tokens";

describe("estimateTokens", () => {
  it("returns 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns a positive estimate for a short string", () => {
    expect(estimateTokens("hello")).toBeGreaterThan(0);
  });

  it("never estimates fewer tokens than a prefix of the same text", () => {
    const long = "The quick brown fox jumps over the lazy dog. ".repeat(20);
    for (let i = 1; i < long.length; i += 7) {
      expect(estimateTokens(long)).toBeGreaterThanOrEqual(estimateTokens(long.slice(0, i)));
    }
  });
});
