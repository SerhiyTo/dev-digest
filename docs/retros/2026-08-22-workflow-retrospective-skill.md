# Retrospective: workflow-retrospective skill — 2026-08-22

Session `146e9d5d-74e3-4f9b-81df-c8f16c421967` · ad-hoc fan-out (3 `Explore` agents), not a `/sdd-*` chain
Plan: `~/.claude/plans/zesty-wishing-stonebraker.md` · Spec: none — this work predates its own spec
Measured by `.claude/skills/workflow-retrospective/assets/session-metrics.sh`

This is the first retro in `docs/retros/`, and it measures the run that built the
skill writing it.

## Cost                                                            measured

|                | API calls | Output | Cache create | Cache read | Thinking |
|----------------|-----------|--------|--------------|------------|----------|
| Orchestrator   | 29        | 52 378 | 152 360      | 4 045 124  | 12 627   |
| Subagents (3)  | 47        | 65 175 | 243 174      | 2 550 913  | 4 814    |
| Total          | 76        | 117 553| 395 534      | 6 596 037  | 17 441   |

Subagents generated **55 %** of all output tokens, off one user prompt.

Cache reads are 56× total output. That is the shape of a research-heavy session:
almost nothing new entered the context after the exploration phase, and every
subsequent call re-sent what was already there.

## The run                                                         measured

Wall clock 40 min · 3 agents in 1 wave · widest wave 3 · agent-time ratio 0.33

| # | Agent | Type | Model | Wave | Output | Tool calls | Duration |
|---|-------|------|-------|------|--------|------------|----------|
| 1 | Explore skills structure | `Explore` | `claude-opus-5[1m]` | 1 | 16 628 | 25 | 191 s |
| 2 | Explore SDD command chain and agents | `Explore` | `claude-opus-5[1m]` | 1 | 28 166 | 22 | 308 s |
| 3 | Find session telemetry data sources | `Explore` | `claude-opus-5[1m]` | 1 | 20 381 | 30 | 300 s |

One wave, launched 9 s and 13 s apart. The wave finished in 308 s of wall clock
against 799 agent-seconds — a real 2.6× saving over running them in sequence.

## Where it was hard                                               inferred

| Agent | What happened | Evidence |
|-------|---------------|----------|
| #3 (telemetry) | Highest tool count (30) for the *lowest* output-per-call of the three. It was probing an undocumented data format, and most calls were discards — checking `~/.claude/usage-data/`, `stats-cache.json`, `telemetry/`, `ccusage`, all four dead ends | 30 tool calls / 20 381 output; four rejected sources named in its report |
| #2 (SDD chain) | Slowest at 308 s and highest output at 28 166 — it had to quote seven command files nearly in full because the orchestration logic is prose, not structure | 308 s, 28 166 output; `.claude/commands/` is 7 files / 29 KB |
| All three | Their outputs tripped the harness's instruction-shaped-pattern filter (`settings-json`), which neutralised control characters in all three reports | the `[harness: subagent output matched instruction-shaped pattern(s)]` prefix on each |

None of the three was blocked, and none reported a gap it could not close.

## What went easily                                                inferred

- **The fan-out itself.** Three agents, one message, disjoint subjects, zero
  collisions, zero re-dispatches. One prompt in, complete design surface out.
- **Agent #1 (skills structure)** was the cheapest of the three at 191 s / 25 tool
  calls and returned the most directly usable material — the house SKILL.md shape
  was applied verbatim with no follow-up questions.
- **The measurement itself was cheap.** The script cost nothing beyond four Bash
  calls and reproduced every independently-derived ground-truth number on the
  first run.

## Duplicated work                                    measured + inferred

| What | How many read it | Where it should live instead |
|------|------------------|------------------------------|
| `.claude/agents/implementer.md` | 3 (both agents + orchestrator) | Fine as-is — it is the canonical example of agent frontmatter, and two agents needed different halves of it |
| `.claude/settings.json` | 3 | Real duplication: agents #1 and #3 both went looking for hooks independently. A one-line "hooks configured: …" in the dispatch prompt would have saved both trips |
| `server/INSIGHTS.md`, `.claude/skills/README.md`, `specs/README.md` | 2 each | Expected. These are the repo's index files; shared reads of an index are the mechanism, not waste |

`repeated_bash` is empty — no command was run twice by anyone. For a 40-minute
session with 24 orchestrator Bash calls that is unusually clean.

## What was missed                                                 inferred

| Gap | Who hit it | Which step should have supplied it |
|-----|------------|------------------------------------|
| Whether the SDD chain has ever actually been run end to end | Agent #2 found the answer itself, in `.claude/agents/README.md:261` | Nothing — but it means every claim in this retro about `/sdd-*` behaviour is about files, not observed runs |
| That `.cursor/skills/` does not exist despite `.claude/skills/README.md` claiming a symlink to it | Agent #1, incidentally | Pre-existing doc rot, unrelated to this run. Flagged, not fixed |
| A GitHub PAT sitting in plaintext in `~/.claude/settings.json` | Agent #3, incidentally | Out of scope for this run; relayed to the user |

## Recommendations

| # | Target (file to edit) | Change | Evidence | Cost of ignoring |
|---|-----------------------|--------|----------|------------------|
| 1 | `.claude/skills/README.md` | Delete or fix the `.cursor/skills/ → ../.claude/skills` symlink claim | The path does not exist in the repo | Every agent that reads the catalog learns something false |
| 2 | `.claude/agents/README.md` | Replace the hand-written preload estimates (`~2k … ~26k`) with measured ones once a real chain run exists | They are the only cost numbers in the repo and none was measured | Preload-waste findings are judged against guesses |
| 3 | `.claude/commands/sdd-build.md`, `sdd-run.md` | State the environment facts once in the dispatch prompt — configured hooks, package managers, which lane is running | `.claude/settings.json` was independently rediscovered by 2 of 3 agents | Small, but it recurs on every fan-out and scales with agent count |

Recommendation 2 is the one this skill exists to make possible, and it cannot be
acted on yet — see below.

## Compared with the last retro

No prior retro. This is the first file in `docs/retros/`.

For a baseline the next run can be compared against: **3 agents, 1 wave, 117 553
total output tokens, 55 % subagent share, 40 min wall clock, 1 user prompt, 0
retries.**

## Not established

- **These numbers are a snapshot of a session still in progress.** They were taken
  before the session ended, so the orchestrator's totals will be higher by the time
  it does. The subagent figures are final — all three agents had completed.
- **Nothing here measures a `/sdd-*` chain.** This was an ad-hoc `Explore` fan-out.
  Probe 6 of the rubric (retries, gate rounds, remediation loops) had no input and
  is untested against a real gate failure.
- **Preload waste could not be assessed.** `Explore` is a built-in agent with no
  `skills:` frontmatter, so the probe had nothing to cross-reference. The 13-skill
  `implementer` preload remains unmeasured.
- **No dollar figure.** Deliberately out of scope for v1.0.0 — see
  `.claude/skills/workflow-retrospective/README.md` §3.
- **Bash-derived file paths are heuristic.** Rows like `/INSIGHTS.md` in the
  duplication table are un-normalised fragments extracted from command strings, not
  exact `Read` paths. They point; they do not prove.
