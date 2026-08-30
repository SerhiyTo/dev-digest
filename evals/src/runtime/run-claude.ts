/**
 * The headless turn-loop driver. Runs one Claude Agent SDK session on the subscription and
 * extracts what the session ACTUALLY did (tools, subagents, skills, reads) — not its prose.
 */

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { EVAL_MODEL, MAX_TURNS, SPAWN_TOOLS } from "../config.js";
import { REPO_ROOT } from "../artifacts/paths.js";
import { subscriptionEnv } from "./env.js";

export interface Metrics {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  /** Total tool_use blocks seen (NOT deduplicated — a measure of work done). */
  toolCallCount: number;
}

export interface Result {
  text: string;
  toolsUsed: string[];
  /** Subagents the session ASKED for — a Task/Agent tool_use block was emitted. */
  subagents: string[];
  /** Subagents that actually RETURNED a non-error tool_result. A dispatch that 400s upstream
   *  (wrong model, no credit, bad route) lands in `subagents` but never here. */
  subagentsCompleted: string[];
  /** Skills activated via the Skill tool (workflow mode); name may be "plugin:skill". */
  skillsInvoked: string[];
  filesRead: string[];
  numTurns: number;
  isError: boolean;
  metrics: Metrics;
}

export interface RunOptions {
  systemPrompt?: string;
  allowedTools?: string[];
  maxTurns?: number;
  cwd?: string;
  model?: string;
  /** ["project"] loads on-disk CLAUDE.md + skills/agents; default [] keeps the run isolated. */
  settingSources?: Array<"user" | "project" | "local">;
  /**
   * Early-stop hook. Called after every tool_use AND every tool_result with the trace collected
   * SO FAR; return true to end the session immediately. Lets a dispatch/trace case stop the moment
   * its evidence is in instead of running the whole turn budget out. Stopping on `subagents` alone
   * proves only that a Task block was emitted — use `subagentsCompleted` when the subagent has to
   * have actually run. On an early stop the run is NOT an error and metrics reflect only what ran
   * before the stop.
   */
  stopWhen?: (
    partial: Pick<Result, "subagents" | "subagentsCompleted" | "filesRead" | "skillsInvoked" | "toolsUsed">,
  ) => boolean;
}

/** Run one headless Claude turn-loop and extract what it ACTUALLY did (not its prose). */
export async function runClaude(prompt: string, opts: RunOptions = {}): Promise<Result> {
  const allowedTools = opts.allowedTools ?? [];
  // With no tools, a subagent/skill prompt that says "read files" will loop on denied tool
  // calls until max-turns. For these content-only evals the input is already in the prompt,
  // so tell the model to answer directly.
  let systemPrompt = opts.systemPrompt;
  if (allowedTools.length === 0) {
    const directive =
      "\n\nYou have NO tools available in this session. Do not attempt any tool calls. " +
      "Answer directly and completely from the information given in the prompt.";
    systemPrompt = (systemPrompt ?? "") + directive;
  }

  const options: Options = {
    model: opts.model ?? EVAL_MODEL,
    maxTurns: opts.maxTurns ?? MAX_TURNS,
    permissionMode: "bypassPermissions", // safe: evals only read/plan and tools are allow-listed
    systemPrompt,
    allowedTools,
    cwd: opts.cwd ?? REPO_ROOT,
    // Default: do NOT load on-disk config — isolates the injected artifact. workflowTask overrides.
    settingSources: opts.settingSources ?? [],
    env: subscriptionEnv(),
  };

  const textParts: string[] = [];
  const tools: string[] = [];
  const subagents: string[] = [];
  const subagentsCompleted: string[] = [];
  const spawnCallIds = new Map<string, string>();
  const skills: string[] = [];
  const reads: string[] = [];
  let resultText = "";
  let isError = false;
  let numTurns = 0;
  let toolCallCount = 0;
  // Resource metrics, read defensively off the result message (field names verified against the
  // installed SDK's types). On the subscription path total_cost_usd is meaningless, so we ignore
  // it and surface tokens only. Fall back to 0 whenever a field is absent — never throw.
  let durationMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let stoppedEarly = false;
  // Wall-clock fallback: on an early stop we break before the result message that carries
  // duration_ms/usage, so those stay 0. Stamp duration ourselves, and accumulate output tokens
  // off each assistant message, so an early-stopped case still reports meaningful metrics.
  const startedAt = Date.now();

  const shouldStop = () =>
    opts.stopWhen?.({
      subagents: [...new Set(subagents)],
      subagentsCompleted: [...new Set(subagentsCompleted)],
      filesRead: reads,
      skillsInvoked: [...new Set(skills)],
      toolsUsed: [...new Set(tools)],
    }) === true;

  // The SDK throws on an error result (e.g. max-turns). We still want the partial output
  // and the tool/subagent trace we collected, so catch and fall through with isError=true.
  try {
    loop: for await (const msg of query({ prompt, options })) {
      if (msg.type === "assistant") {
        numTurns++;
        outputTokens += (msg.message as any).usage?.output_tokens ?? 0;
        for (const block of msg.message.content as any[]) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "tool_use") {
            tools.push(block.name);
            toolCallCount++;
            const input = block.input ?? {};
            if (SPAWN_TOOLS.has(block.name)) {
              const sub = input.subagent_type ?? input.agent_type ?? input.name;
              if (sub) {
                subagents.push(sub);
                if (block.id) spawnCallIds.set(block.id, sub);
              }
            }
            if (block.name === "Read") {
              const fp = input.file_path ?? input.path;
              if (fp) reads.push(fp);
            }
            if (block.name === "Skill") {
              const s = input.skill ?? input.command;
              if (s) skills.push(s);
            }
            // Evidence is in — break the loop before the turn budget runs out.
            // Breaking the async iterator triggers its return()/abort, tearing down the subprocess.
            if (shouldStop()) {
              stoppedEarly = true;
              break loop;
            }
          }
        }
      } else if (msg.type === "user") {
        // Subagent tool_use/tool_result blocks are forwarded by default, so a Task call's result
        // lands here. Only ids from THIS session's spawn calls are in the map, so a nested
        // subagent's own tool_results cannot be mistaken for the outer dispatch returning.
        const content = (msg.message as any).content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type !== "tool_result") continue;
            const sub = spawnCallIds.get(block.tool_use_id);
            if (sub && !block.is_error) subagentsCompleted.push(sub);
          }
          if (shouldStop()) {
            stoppedEarly = true;
            break loop;
          }
        }
      } else if (msg.type === "result") {
        isError = msg.subtype !== "success";
        const m = msg as any;
        numTurns = m.num_turns ?? 0;
        durationMs = m.duration_ms ?? 0;
        inputTokens = m.usage?.input_tokens ?? 0;
        outputTokens = m.usage?.output_tokens ?? 0;
        if (m.result) resultText = m.result;
      }
    }
  } catch (err) {
    isError = true;
    if (!resultText && textParts.length === 0) {
      throw err; // nothing usable collected — surface the failure
    }
  }

  // Early stop never reached the result message, so fall back to the wall-clock duration.
  if (stoppedEarly && durationMs === 0) durationMs = Date.now() - startedAt;

  return {
    text: resultText || textParts.join("\n"),
    toolsUsed: [...new Set(tools)],
    subagents: [...new Set(subagents)],
    subagentsCompleted: [...new Set(subagentsCompleted)],
    skillsInvoked: [...new Set(skills)],
    filesRead: reads,
    numTurns,
    isError,
    metrics: { durationMs, inputTokens, outputTokens, toolCallCount },
  };
}
