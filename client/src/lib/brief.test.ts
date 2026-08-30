import { describe, it, expect } from "vitest";
import {
  MERGE_RISK_BANDS,
  costLine,
  formatFileRef,
  mergeRiskToken,
  shortSha,
} from "./brief";

describe("mergeRiskToken", () => {
  it.each(MERGE_RISK_BANDS)("resolves an SEV token for band %s", (band) => {
    const token = mergeRiskToken(band);
    expect(token.c).toBeTruthy();
    expect(token.bg).toBeTruthy();
    expect(token.icon).toBeTruthy();
  });

  it("maps high to the same token family as CRITICAL", () => {
    expect(mergeRiskToken("high")).toBe(mergeRiskToken("high"));
    expect(mergeRiskToken("high")).not.toBe(mergeRiskToken("low"));
  });
});

describe("shortSha", () => {
  it("truncates to 7 characters", () => {
    expect(shortSha("abcdef1234567890")).toBe("abcdef1");
  });

  it("renders missing data as a dash", () => {
    expect(shortSha(null)).toBe("—");
    expect(shortSha(undefined)).toBe("—");
    expect(shortSha("")).toBe("—");
  });
});

describe("formatFileRef", () => {
  it("parses a bare path with no line info", () => {
    expect(formatFileRef("src/lib/brief.ts")).toEqual({
      path: "src/lib/brief.ts",
      startLine: null,
      endLine: null,
    });
  });

  it("parses a path:line ref", () => {
    expect(formatFileRef("src/lib/brief.ts:42")).toEqual({
      path: "src/lib/brief.ts",
      startLine: 42,
      endLine: null,
    });
  });

  it("parses a path:start-end ref", () => {
    expect(formatFileRef("src/lib/brief.ts:10-20")).toEqual({
      path: "src/lib/brief.ts",
      startLine: 10,
      endLine: 20,
    });
  });
});

describe("costLine", () => {
  it("renders token counts and cost when cost is known", () => {
    expect(costLine(1234, 567, 0.02)).toBe("1,234 in / 567 out · $0.02");
  });

  it("renders token counts with no currency figure when cost is null", () => {
    expect(costLine(1234, 567, null)).toBe("1,234 in / 567 out");
  });

  it("defaults missing token counts to zero", () => {
    expect(costLine(null, undefined, null)).toBe("0 in / 0 out");
  });
});
