# Retrospective: eval-pipeline — 2026-08-30
Session `e4db0fe9-4ec8-41ca-b070-8dba3319f5a8` · `/sdd-review` → `/sdd-close` · Plan: `docs/plans/2026-08-30-eval-pipeline.md` · Spec: SPEC-04

This measures the **review and close-out half** of the feature. The build
(`/sdd-spec` → `/sdd-plan` → `/sdd-build`) ran in earlier sessions and is not in
these numbers.

## Cost                                                              measured

|                | API calls | Output | Cache create | Cache read | Thinking |
|----------------|-----------|--------|--------------|------------|----------|
| Orchestrator   | 31        | 48 665 | 206 475      | 4 547 811  | 9 890    |
| Subagents (9)  | 485       | 73 679 | 1 776 562    | 69 217 189 | 30 889   |

Subagents generated **60 %** of all output. Wall clock **5 280 s (88 min)**,
12 user prompts. The orchestrator made 26 tool calls — 11 `Bash`, 9 `Agent`,
2 `AskUserQuestion`, 2 `Read`, 1 `SendMessage`, 1 `ToolSearch`, 1 `Skill`.

**Cache reads are 603× total output** (73.8 M against 122 344) — the highest
ratio in any retro recorded here, against 176× on the build-shaped
2026-08-23 run and 56× on the research-shaped 2026-08-22 one. That is the
signature of a *verification* phase: nine agents each re-read a large, static
working tree and wrote almost nothing back. Output is the cheap half of a review
session; context is the expensive half.

| Agent type | N | Output | Tool calls | Median duration |
|---|---|---|---|---|
| implementer | 2 | 22 744 | 121 | 892 s |
| test-writer | 2 | 17 613 | 127 | 965 s |
| doc-writer | 1 | 11 668 | 91 | 708 s |
| architecture-reviewer | 1 | 8 859 | 46 | 714 s |
| plan-verifier | 1 | 8 492 | 109 | 1 966 s |
| security-auditor | 1 | 2 261 | 34 | 497 s |
| spec-creator | 1 | 2 042 | 23 | 163 s |

## The run                                                           measured

**9 launches across 7 distinct agent types**, all `spawn_depth: 1` — no agent
spawned an agent. A tenth dispatch was a **resume**, not a launch: `plan-verifier`
round 2 went back to the same agent via `SendMessage`, re-checking 4 of 316 items
instead of re-running the full pass. The script counts launches, so the resume
appears in no wave.

| Wave | Agents | Types | Fastest | Slowest |
|---|---|---|---|---|
| 1 | 3 | architecture-reviewer, security-auditor, test-writer | 497 s | 965 s |
| 2 | 1 | implementer (12 merged findings) | 892 s | 892 s |
| 3 | 1 | plan-verifier final #1 → INCOMPLETE | 1 966 s | 1 966 s |
| 4 | 1 | implementer (AC-54, AC-55) | 308 s | 308 s |
| 5 | 1 | test-writer (AC-16, AC-68) | 509 s | 509 s |
| 6 | 2 | doc-writer, spec-creator | 163 s | 708 s |

`agent_time_ratio` **1.27** (6 722 agent-seconds over 5 285 session-seconds). Per
the skill's own guidance this figure is weakly meaningful here — a human answered
two `AskUserQuestion` prompts mid-run, so some session-seconds were spent waiting
on a person rather than on a barrier.

**Where the measured waves disagree with intent.** Waves 4 and 5 are one wave in
the data's terms — `implementer` (20:54:16, 308 s) and `test-writer` (20:55:30,
509 s) overlapped for their whole lives. They land in separate waves only because
the launches were 74 s apart, over the script's 30 s grouping window. The gap is
real and mine: I dispatched the `implementer` first, then gated the `test-writer`
behind an `AskUserQuestion` about the two PARTIAL criteria. Asking first, then
dispatching both together, would have made it one message and one wave.

## Where it was hard                                                 inferred

- **`plan-verifier` is the run's cost centre: 1 966 s, 109 tool calls — 2.2× the
  next-longest agent.** It carried 316 items (245 task items, 3 plan-level
  sections, 68 acceptance criteria) and re-ran 22 task-level `Verify:` commands
  plus 4 plan-level ones. Its containing orchestrator turn is the longest in the
  session at **2 489 001 ms (41 min)**. This is not friction to remove — the
  318-item trace is what caught two NOT MET criteria — but it means the final
  gate is roughly a third of a close-out's wall clock, and a full re-run after
  remediation would have doubled it. The `SendMessage` resume avoided that.
- **`implementer` round 1 ran 90 tool calls, every one of them `Bash`, and zero
  `Read`.** It produced 21 116 output tokens against 30 touched files — the
  largest single output in the run. An agent fixing 12 findings across 5 modules
  navigating entirely through shell is legible but hard to audit from the
  transcript.
- **Two gate rounds were needed.** Round 1 returned INCOMPLETE — AC-54 and AC-55
  `NOT MET`, AC-16 and AC-68 `PARTIAL`. That is orchestrator state that reaches
  no transcript, and it is the single strongest signal this run produced about
  the plan: see **What was missed**.

## What went easily                                                  inferred

- **`spec-creator` was the cheapest agent in the run** — 163 s, 23 tool calls,
  2 042 output — and still did real work: it re-derived the four remediated
  criteria rather than trusting the gate, and refused to record AC-55 as
  confirmed.
- **`implementer` round 2 was surgical**: 308 s, 31 tool calls, 1 628 output for
  two edits (a four-line branch in `verify-l06.sh`, two steps in the e2e flow).
  A narrowly-scoped remediation prompt produced a narrowly-scoped agent.
- **`security-auditor` was the fastest of wave 1** at 497 s and returned a clean
  preflight with 4 findings. Its two headline traces — the compare view and every
  repository read path — came back clean, which is a real result, not an absence
  of one.
- **Wave 1's three-way parallel fan-out worked as designed**: three agents,
  disjoint outputs, no collision, and three independent findings on the same
  compare-modal defect.

## Duplicated work                                            measured + inferred

**25 distinct files were read by 3 or more agents.** The top of the list:

| File | Readers |
|---|---|
| `scripts/verify-l06.sh` | **8 of 9 agents** |
| `docs/plans/2026-08-30-eval-pipeline.md` | 7 (6 agents + orchestrator) |
| `client/src/app/evals/[agentId]/page.tsx` | 6 |
| `client/src/lib/hooks/evals.ts` | 6 |
| `EvalCaseButton.tsx`, `seed-evals.ts`, `contracts/eval-ci.ts` | 5 each |

`verify-l06.sh` is 101 lines and was independently located and read by every
agent except `implementer` round 1. The plan itself was read seven times. Both
belong in a context pack the dispatching command passes down, not in eight
independent searches — this is the mechanism behind the 69.2 M subagent cache
reads.

`repeated_bash` shows `cd client && pnpm typecheck` run twice by two different
agents, which is the mild version of the same thing.

**Zero `Skill` tool invocations across all nine subagents.** Every
`agents[].skill_calls` is empty, while the plan names skills on 28 of its 32
tasks and several agent definitions carry a `skills:` list. The work was not
skipped — `architecture-reviewer` read
`.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs` and
`.claude/skills/deprecation-policy/assets/deprecation-audit.sh` and executed
both — so skills were consumed **as asset scripts through `Bash`, not through the
`Skill` tool**. Per this skill's own rule, one run is not evidence for deleting a
`skills:` entry. It is evidence that the preload accounting in
`.claude/agents/README.md` and the actual invocation path have diverged, and that
`skill_calls` alone will under-report skill usage for these agent types.

## What was missed                                                   inferred

- **Four acceptance criteria — AC-7, AC-16, AC-44, AC-46 — survived every wave
  gate during `/sdd-build` and were caught only at review.** The mechanism is
  named precisely in `plan-verifier`'s own report on T22: *"T22's `Done when:` is
  'bash -n is clean, the script names eleven lanes, and both manifests carry the
  script' — all three are MET. AC-54 lives only in the `Do:` prose, which no
  `Done when:` clause checks."* Gate mode checks `Done when:` clauses; those
  clauses did not encode the criteria they were meant to deliver. A task can pass
  every gate while its acceptance criterion goes unimplemented.
- **AC-44's prior test was a tautology.** It asserted
  `queryByRole("button", { name: "Compare selected runs" })` was
  `not.toBeInTheDocument()` — for a button that existed in **no** state of the
  component. It passed continuously while proving nothing, and the criterion it
  was filed against had no implementation at all.
- **The AC-44 remediation broke AC-55.** Adding the compare button inverted the
  modal's open condition, which invalidated the premise of the e2e flow written
  three waves earlier. Final gate round 1 caught it. A fix that closes one
  criterion by invalidating another's proof is a class this chain has now seen
  once and does not check for.
- **`server/test/agents-versions.it.test.ts` was compile-forced by T23 but named
  in no task's `Files:` list** — a small planning miss, benign, and the kind of
  thing only a scope-drift baseline surfaces.
- **My own dispatch note to this skill said "eight distinct agents."** Measured:
  **7 types across 9 launches**, plus 1 resume. Recording the correction here
  because an unverified orchestrator claim is exactly what this skill exists to
  replace with a number.

## Recommendations

Proposals only. The user applies them.

**1 · Pass a context pack instead of letting each agent find the same files.**
**Target:** `.claude/commands/sdd-review.md`, `.claude/commands/sdd-close.md`.
**Evidence:** `verify-l06.sh` read by 8 of 9 agents; the plan by 7; 25 files by
≥3; 69.2 M subagent cache reads at 603× total output.
**Cost of ignoring:** every added agent re-pays the same discovery, and the ratio
grows with fan-out width.

**2 · Require every normative clause in a task's `Do:` to appear in its `Done when:`.**
**Target:** `.claude/agents/implementation-planner.md`.
**Evidence:** AC-54. T22's three `Done when:` items were all MET while the `Do:`
promise they existed to enforce went unimplemented, through three wave gates.
**Cost of ignoring:** acceptance criteria keep passing gates unbuilt, and the
final trace becomes the only thing standing between a plan and a false COMPLETE.

**3 · Add the tautology rule to the test agent's contract: an assertion that
passes when the feature is absent is not coverage.**
**Target:** `.claude/agents/test-writer.md`.
**Evidence:** AC-44's `queryByRole(...).not.toBeInTheDocument()` against a button
present in no state. `test-writer` itself identified and replaced it in round 2 —
the rule is one it can apply, it simply was not stated.
**Cost of ignoring:** a green suite that proves the absence of nothing.

**4 · After remediation, re-check the criteria whose proof depends on what the fix changed.**
**Target:** `.claude/commands/sdd-review.md`, `## Fix`.
**Evidence:** the AC-44 fix inverted the compare modal's open condition and broke
AC-55's e2e flow, three waves downstream. Caught by the final gate, not by the
remediation pass.
**Cost of ignoring:** a review that closes findings by opening others, discovered
one gate later or not at all.

**5 · Record that `skill_calls` under-reports skill usage for these agent types.**
**Target:** `.claude/agents/README.md` preload table; `references/metrics.md`.
**Evidence:** 0 `Skill` invocations across 9 agents, while `architecture-reviewer`
executed two skill asset scripts through `Bash`.
**Cost of ignoring:** the preload estimates and the measured invocation counts
describe different things, and a future retro reads 0 as "unused."

## Compared with the last retro

| Run | Shape | Agents | Subagent output share | Cache read ÷ output |
|---|---|---|---|---|
| 2026-08-22 project-context | planning | 3 | 57 % | 51× |
| 2026-08-23 project-context | building | 38 | 88 % | 176× |
| 2026-08-24 pr-why-risk-brief | full chain | 43 | 89 % | ~180× |
| **2026-08-30 eval-pipeline** | **review + close** | **9** | **60 %** | **603×** |

The share drops back to planning-run levels because the orchestrator did
first-hand work here — merging and deduplicating 12 findings across two
reviewers, and independently re-running all four test lanes rather than
accepting the agents' reported numbers. The cache ratio going the other way,
hard, is the review phase's real signature: many agents, large static tree,
very little written.

## Not established

- Whether a gate-mode `plan-verifier` that traced acceptance criteria would have
  caught AC-7, AC-16, AC-44 and AC-46 during `/sdd-build`. No counterfactual run
  exists.
- The token cost of the `/sdd-build` session that preceded this one — a different
  session uuid, not measured here. The 32-task build is absent from every number
  above.
- Dollar cost. No pricing data is in a transcript.
- Whether 0 `Skill`-tool invocations is typical for these agent types or specific
  to a review-and-document session. One run is one task.
- AC-55's actual pass or fail. `npm run e2e:hermetic` was never executed by
  anyone; the user elected to run it themselves.
