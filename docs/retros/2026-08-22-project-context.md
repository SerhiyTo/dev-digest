# Retrospective: Project Context planning — 2026-08-22

Session `4be9d0ab-4755-47fc-9ee5-64112a90bd98` · `/sdd-plan` under plan mode, with an ad-hoc 3×`Explore` fan-out
Plan: `docs/plans/2026-08-22-project-context.md` · Spec: `specs/2026-08-20-project-context.md` (SPEC-01)
Measured by `.claude/skills/workflow-retrospective/assets/session-metrics.sh`

This run produced a plan and no code. It is the second entry in `docs/retros/`,
and it is directly comparable to the first: same shape, same day, three `Explore`
agents in one wave.

## Cost                                                            measured

|                | API calls | Output  | Cache create | Cache read | Thinking |
|----------------|-----------|---------|--------------|------------|----------|
| Orchestrator   | 18        | 43 382  | 179 339      | 2 214 701  | 16 228   |
| Subagents (3)  | 52        | 58 555  | 267 332      | 2 964 076  | 4 742    |
| Total          | 70        | 101 937 | 446 671      | 5 178 777  | 20 970   |

Subagents generated **57 %** of all output tokens.

Cache reads are 51× total output — the same research-heavy shape as the previous
retro (56×). The orchestrator thought 3.4× more than all three subagents combined
(16 228 vs 4 742), which is what a planning turn looks like: the agents gathered,
the orchestrator decided.

## The run                                                         measured

Wall clock 27 min · 3 agents in 1 wave · widest wave 3 · agent-time ratio 0.49 ·
7 user prompts · 0 retries · 0 blocked agents · `spawn_depth` 1 throughout

| # | Agent | Type | Model | Wave | Output | Tool calls | Duration |
|---|-------|------|-------|------|--------|------------|----------|
| 1 | Explore server module patterns | `Explore` | `claude-opus-5[1m]` | 1 | 20 612 | 32 (32 Bash) | 293 s |
| 2 | Explore client UI patterns | `Explore` | `claude-opus-5[1m]` | 1 | 20 359 | 32 (32 Bash) | 268 s |
| 3 | Explore reviewer-core, contracts, e2e | `Explore` | `claude-opus-5[1m]` | 1 | 17 584 | 29 (22 Bash, 7 Read) | 230 s |

One wave, launched 14 s and 27 s apart, finishing 293 s after the first launch
against 791 agent-seconds — a real **2.7× saving** over running them in sequence.

**The 0.49 agent-time ratio is not a parallelism verdict here.** One turn alone ran
894 s — 55 % of the whole session — waiting for the human to answer four
`AskUserQuestion` items. Against wall clock excluding that wait, the ratio is 1.1.

## Where it was hard                                               inferred

| Agent | What happened | Evidence |
|-------|---------------|----------|
| #1 (server) | Slowest at 293 s and highest tool count at 32, because its most valuable finding was a **negative**: that no CI dispatch exists. It had to search `server/src`, `reviewer-core/src`, `.github/`, `docs/`, `specs/`, `mcp/` and `e2e/` for six different symbols (`workflow_dispatch`, `repository_dispatch`, `CiService`, `export-ci`, `agentYaml`, `.devdigest`) to earn the word "zero" | 293 s / 32 tool calls; its report lists all six searched symbols and all seven searched trees |
| #1 | Also carried the widest brief — 10 numbered subjects against 11 and 14 for the others, but spanning DI, migrations, CI, routes, tests and two constants files. It answered all ten | 48 distinct files read, the most of the three |
| Orchestrator | Reconciling AC-40 – AC-44 against agent #1's finding was the single hardest judgement in the run: the spec's `Q-2` resolution assumes a dispatch that has no code. It cost one `AskUserQuestion` round and 894 s of blocked wall clock | `## Requirements review` of the plan; `turns[3].duration_ms = 894093` |

Nothing was retried, nothing was re-dispatched, and no agent reported a gap it
could not close.

## What went easily                                                inferred

- **The fan-out.** Three agents, one message, three disjoint briefs, zero
  collisions, zero follow-up dispatches. Every one of the 35 numbered questions
  across the three prompts came back answered.
- **Agent #3** was cheapest on every axis — 230 s, 29 tool calls, 17 584 output —
  and produced the finding the plan leans on hardest: that `specs: ['']` is *not*
  omitted by `assemblePrompt`, which is the sharp edge under AC-31.
- **The two mechanical gates in `/sdd-plan` were cheap and both fired.** The AC-count
  check and the unit-lane `Verify` check cost one `Bash` call each and confirmed
  48/48 coverage and zero integration-lane commands in a task.
- **The measurement itself.** Four `Bash` calls, script exited 0, `notes` empty —
  no missing transcript, nothing degraded.

## Duplicated work                                    measured + inferred

| What | How many agents / times | Where it should live instead | Label |
|------|-------------------------|------------------------------|-------|
| `specs/2026-08-20-project-context.md` (38 474 chars) | **3 of 3** | The orchestrator already had the full spec — the `/sdd-plan` command injects it. None of the three prompts said so, so all three re-read it and all three opened their report with the same discovery: *"an approved spec for this exact feature already exists"* | measured |
| `reviewer-core/src/prompt.ts`, `review/run.ts`, `contracts/trace.ts` | 2 each (#1 and #3) | A brief boundary artifact: #3 owned `reviewer-core`, but #1 could not describe `run-executor`'s call into `reviewPullRequest` without reading the same three files | measured |
| The "no CI dispatch exists" conclusion | 1 agent found it; the orchestrator then re-verified it with its own `grep` before writing `## Out of scope` | Justified — a scope-cutting negative is worth confirming, and it cost one `Bash` call | inferred |

Redundant spec reading cost roughly 115 KB of cache-creation input across the
wave. It scales linearly with agent count and recurs on every fan-out where the
orchestrator has already read the source document.

## What was missed                                                 inferred

| Gap | Who hit it | Which step should have supplied it |
|-----|------------|-------------------------------------|
| **`implementation-planner` was never dispatched.** `/sdd-plan` says *"Call `implementation-planner` with the spec path"*, and it never happened — 0 dispatches in the transcript. Plan mode permits writes only to its own plan file, and the planner's sole output is a file in `docs/plans/`, so the two are mutually exclusive. The orchestrator did the planner's job inline | Orchestrator | `.claude/commands/sdd-plan.md` — **no `/sdd-*` command mentions plan mode at all** |
| **The planner's 6 preloaded skills therefore never loaded** (~16k tokens: `onion-architecture`, `frontend-ui-architecture`, `semver-discipline`, `breaking-change`, `deprecation-policy`, `engineering-insights`). The plan routes tasks to all six and was written without any of them in context | Orchestrator | Same file. The saving is real; so is the risk |
| The plan's format, the skill routing table and the `Verify`-per-module table had to be recovered by reading `.claude/agents/implementation-planner.md` directly — one `Read` that only worked because the agent file happens to carry the template | Orchestrator | Same file |

The part of the command that *did* survive the bypass is the part written for the
caller rather than the agent: the two mechanical checks after the plan exists.

## Recommendations

| # | Target (file to edit) | Change | Evidence | Cost of ignoring |
|---|-----------------------|--------|----------|------------------|
| 1 | `.claude/commands/sdd-plan.md` | Add a plan-mode branch. `implementation-planner` writes only to `docs/plans/`, which plan mode forbids — so either exit plan mode before delegating, or state that the orchestrator writes the plan itself and must load the planner's six skills first | 0 dispatches of `implementation-planner`; no `/sdd-*` command mentions plan mode | The chain's central agent is silently bypassed and the plan is written without the six skills that are supposed to shape it. It looked like the command ran |
| 2 | `.claude/commands/sdd-plan.md` (the `## Delegate` step) | Tell dispatched agents the spec is already resolved: pass the path plus *"do not re-read it; here is the excerpt you need"* | 3 of 3 agents read all 38 474 chars and all three led their report with the same rediscovery | ~115 KB of redundant cache-creation per 3-agent fan-out, scaling with agent count |
| 3 | `.claude/agents/README.md` | Replace the hand-written preload estimates (`~2k … ~26k`) with measured ones | **Recurring — 2nd retro.** Rec 2 of `2026-08-22-workflow-retrospective-skill.md`, unapplied; the file is modified in the working tree but the `~Nk` figures are unchanged | Preload-waste findings keep being judged against guesses. This run adds a concrete case: a 6-skill preload that never loaded |
| 4 | `.claude/skills/README.md` | Delete or fix the `.cursor/skills/ → ../.claude/skills` symlink claim | **Recurring — 2nd retro.** Rec 1 of the previous retro, unapplied; `ls .cursor/` → no such directory; the claim is still at `README.md:3` | Every agent that reads the skill catalog learns something false. Two retros is the point at which this stops being a note |

## Compared with the last retro

`docs/retros/2026-08-22-workflow-retrospective-skill.md` — same day, same shape
(ad-hoc 3×`Explore`, one wave), so the comparison is meaningful.

| Metric | Previous | This run | Δ |
|--------|----------|----------|---|
| Total output | 117 553 | 101 937 | −13 % |
| Subagent share | 55 % | 57 % | +2 pt |
| API calls | 76 | 70 | −8 % |
| Agents / waves | 3 / 1 | 3 / 1 | — |
| Wall clock | 40 min | 27 min | −33 % |
| Agent-time ratio | 0.33 | 0.49 | +0.16 (both distorted; see above) |
| Cache read ÷ output | 56× | 51× | −5× |
| Retries / blocked | 0 / 0 | 0 / 0 | — |

Previous recommendations:

- **Rec 1** (`.claude/skills/README.md`, false symlink claim) — **not applied.**
  Re-filed as rec 4 above.
- **Rec 2** (`.claude/agents/README.md`, measured preload estimates) — **not
  applied.** The file is modified in the working tree, but every `~Nk` figure is
  unchanged. Re-filed as rec 3.
- **Rec 3** (state environment facts in the dispatch prompt) — **not applied**, and
  **not reproduced this run.** No agent re-discovered `.claude/settings.json` or a
  package manager here. One clean run is not evidence it is fixed; it is evidence
  it did not bite this time.

Two of three recommendations recur. Neither is yet at the three-retro mark where
the skill says to call it a chain defect, but rec 4 is one run away.

## Not established

- **Cost in dollars.** No pricing appears in the transcripts. Settling it needs a
  per-model rate card the repo does not carry.
- **Whether `Explore`'s Bash-heavy tool mix is cheaper than `Read`.** Agents #1 and
  #2 used `Bash` for 32 of 32 calls; #3 used `Read` for 7 of 29 and finished
  fastest and cheapest. The transcript records call counts, not bytes returned, so
  the correlation is one data point and not a cause.
- **Whether the 894 s turn was human deliberation or an idle terminal.** The gap is
  recorded; who was at the keyboard is not.
- **Whether skipping `implementation-planner` degraded the plan.** This skill
  measures the run, not the artifact. `plan-verifier` at `/sdd-build` and the
  `## Acceptance-criteria coverage` table are what would settle it.
- **What the six unloaded preload skills would have cost.** The `~16k` figure is
  `.claude/agents/README.md`'s own hand-written estimate — which is precisely what
  rec 3 exists to replace.
