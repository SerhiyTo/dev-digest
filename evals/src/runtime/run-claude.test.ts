/**
 * Trace extraction against a scripted SDK stream — no model, no network.
 *   pnpm vitest run src/runtime/run-claude.test.ts
 *
 * Covers the dispatched-vs-returned distinction: a Task call whose tool_result never arrives (or
 * arrives with is_error) must NOT count as a subagent that ran, which is what a proxy 400 on the
 * subagent's own model looks like from here.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";

const stream = vi.hoisted(() => ({ messages: [] as unknown[] }));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => (async function* () {
    for (const m of stream.messages) yield m;
  })(),
}));

const { runClaude } = await import("./run-claude.js");

const spawn = (id: string, agent: string) => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", id, name: "Task", input: { subagent_type: agent } }] },
});
const toolResult = (id: string, isError = false) => ({
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: "…" }] },
});
const done = { type: "result", subtype: "success", num_turns: 2, duration_ms: 10, result: "ok" };

beforeEach(() => {
  stream.messages = [];
});

describe("subagent dispatch vs completion", () => {
  test("a Task call that returns cleanly counts as both dispatched and returned", async () => {
    stream.messages = [spawn("t1", "security-auditor"), toolResult("t1"), done];
    const r = await runClaude("p", { allowedTools: ["Task"] });
    expect(r.subagents).toEqual(["security-auditor"]);
    expect(r.subagentsCompleted).toEqual(["security-auditor"]);
  });

  test("a Task call whose result never arrives is dispatched but NOT returned", async () => {
    stream.messages = [spawn("t1", "architecture-reviewer"), done];
    const r = await runClaude("p", { allowedTools: ["Task"] });
    expect(r.subagents).toEqual(["architecture-reviewer"]);
    expect(r.subagentsCompleted).toEqual([]);
  });

  test("an is_error tool_result is dispatched but NOT returned", async () => {
    stream.messages = [spawn("t1", "architecture-reviewer"), toolResult("t1", true), done];
    const r = await runClaude("p", { allowedTools: ["Task"] });
    expect(r.subagents).toEqual(["architecture-reviewer"]);
    expect(r.subagentsCompleted).toEqual([]);
  });

  test("a nested subagent's own tool_result cannot be mistaken for the outer dispatch", async () => {
    stream.messages = [spawn("t1", "security-auditor"), toolResult("nested-99"), done];
    const r = await runClaude("p", { allowedTools: ["Task"] });
    expect(r.subagentsCompleted).toEqual([]);
  });
});

describe("stopWhen", () => {
  test("fires on the tool_result, so a completion-gated case stops without burning the budget", async () => {
    stream.messages = [spawn("t1", "security-auditor"), toolResult("t1"), done];
    const r = await runClaude("p", {
      allowedTools: ["Task"],
      stopWhen: (p) => p.subagentsCompleted.includes("security-auditor"),
    });
    expect(r.subagentsCompleted).toEqual(["security-auditor"]);
    expect(r.isError).toBe(false);
    // Broke before the result message: numTurns is the 1 assistant turn counted, not its num_turns=2.
    expect(r.numTurns).toBe(1);
  });

  test("a completion-gated stopWhen does NOT fire on the dispatch alone", async () => {
    stream.messages = [spawn("t1", "security-auditor"), { type: "assistant", message: { content: [{ type: "text", text: "still working" }] } }, done];
    const r = await runClaude("p", {
      allowedTools: ["Task"],
      stopWhen: (p) => p.subagentsCompleted.includes("security-auditor"),
    });
    expect(r.text).toBe("ok");
  });
});
