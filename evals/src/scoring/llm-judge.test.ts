/**
 * Judge verdict parsing against the shapes a chatty model actually returns — no model, no network.
 *   pnpm vitest run src/scoring/llm-judge.test.ts
 *
 * The CI failure this covers: two JSON objects in one reply. The old first-"{"-to-last-"}" slice
 * produced `{...}{...}` and threw SyntaxError, which the caller then recorded as a PASS.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";

const reply = vi.hoisted(() => ({ text: "" }));

vi.mock("../runtime/dispatch.js", () => ({
  runContent: async () => ({ text: reply.text }),
}));

const { llmJudge } = await import("./llm-judge.js");

const VERDICT = '{"results":[{"practice":"p1","passed":true,"evidence":"quoted"}]}';

beforeEach(() => {
  reply.text = "";
});

describe("parseVerdict", () => {
  test("plain minified JSON", async () => {
    reply.text = VERDICT;
    const v = await llmJudge("out", ["p1"]);
    expect(v.score).toBe(1);
    expect(v.results[0].evidence).toBe("quoted");
  });

  test("a second trailing JSON object no longer breaks the parse", async () => {
    reply.text = `${VERDICT}\n{"note":"I also considered other angles."}`;
    const v = await llmJudge("out", ["p1"]);
    expect(v.passed).toBe(1);
  });

  test("prose containing a brace after the JSON", async () => {
    reply.text = `${VERDICT}\n\nNote: the output used a { literal brace } in a code sample.`;
    await expect(llmJudge("out", ["p1"])).resolves.toMatchObject({ score: 1 });
  });

  test("fenced JSON with a preamble", async () => {
    reply.text = "Here is my verdict:\n```json\n" + VERDICT + "\n```\nDone.";
    const v = await llmJudge("out", ["p1"]);
    expect(v.total).toBe(1);
  });

  test("braces inside string values are not treated as structure", async () => {
    reply.text = '{"results":[{"practice":"p1","passed":true,"evidence":"he wrote \\"{ oops }\\" here"}]}';
    const v = await llmJudge("out", ["p1"]);
    expect(v.passed).toBe(1);
  });

  test("a leading object without results[] is skipped for the real one", async () => {
    reply.text = `{"thinking":"let me judge"}\n${VERDICT}`;
    const v = await llmJudge("out", ["p1"]);
    expect(v.passed).toBe(1);
  });

  test("no parsable verdict still throws, so the case fails rather than silently passing", async () => {
    reply.text = "I cannot comply.";
    await expect(llmJudge("out", ["p1"])).rejects.toThrow(/no JSON object with results/);
  });

  test("score is the pass fraction", async () => {
    reply.text = '{"results":[{"practice":"a","passed":true,"evidence":"x"},{"practice":"b","passed":false,"evidence":""}]}';
    const v = await llmJudge("out", ["a", "b"]);
    expect(v.score).toBe(0.5);
  });
});
