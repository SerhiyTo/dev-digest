# Rubric — the six probes

The script measures. This file is the part it cannot do: reading a run and saying
what the numbers mean. Work the probes in order; each one names what to read and
what evidence a finding must carry.

## The labelling rule

Every row in the report is one of two things, and they are never blended:

- **`measured`** — a number from a transcript. Quote it exactly. If you did not run
  the script, you have no measured rows.
- **`inferred`** — a conclusion you drew. It must cite what it rests on: an
  `agent-<id>.jsonl` line, a section of an agent's returned report, a `path:line`,
  or a specific number from the script.

An inferred row without a citation does not go in the report. A question you could
not settle goes in `## Not established`, which is mandatory even when empty.

**An agent's own report is a claim, not evidence.** `plan-verifier.md:231` sets this
rule for verification and it holds here: "the implementer said it was tricky" is a
quote, not a measurement. Pair it with the tool count, the duration, or the retry.

## Probe 1 — friction

**Read:** `agents[]` sorted by `duration_s` and by `tool_calls`; then the last
assistant message of the outliers' transcripts; then their returned reports for
non-empty `Deviations from the plan`, `Blocked / not done`, `UNKNOWN` verdicts,
`Deliberately not tested`, `Not documented`.

**Signals:** an agent above the run's median on **both** duration and tool calls.
High tool calls with low output — it was searching, not producing, which is almost
always a context problem rather than a hard task. A `Blocked` section that names
something another agent already had.

**Evidence required:** the two numbers plus one quoted line.

## Probe 2 — what went easily

**Read:** the same table, from the other end.

**Signals:** one pass, low tool count, a clean verdict, an empty `Blocked`.

Say so explicitly. A retro that only lists problems is not a measurement — it is a
mood. The cheap agents are also the baseline that makes an expensive one legible,
and "this part of the chain is fine, leave it alone" is a finding that saves the
next session from tuning something that works.

## Probe 3 — duplicated work

**Read:** `duplication.files_read_by_n_agents` and `duplication.repeated_bash`.

**Signals and what each one means:**

| Pattern | What it says | Where the fix goes |
|---|---|---|
| One file read by ≥3 agents | Every agent independently rediscovered the same thing | The plan's context pack, or a skill preload |
| `INSIGHTS.md` or a plan read by nearly everyone | Working as designed — this is the coupling the chain is built on. Not a finding | — |
| The same `pnpm typecheck` run by 4 agents | Real duplicated compute, minutes each | The plan's per-task `Verify:`, or a single end-to-end run |
| The same `ls`/`rg` run 10× by one agent | That agent was polling or lost | Its own definition, or the task description |

Distinguish the third row from the second carefully. A shared read of the plan is
the mechanism; a shared read of six source files is waste.

## Probe 4 — preload waste

**Read:** each agent's `skills:` frontmatter in `.claude/agents/<type>.md`, the
per-agent token estimates in `.claude/agents/README.md`'s Permissions table, and
`agents[].skill_calls` plus any `references/*.md` the agent read.

**Signal:** a skill preloaded into an agent that it never invoked and whose
references it never opened. `implementer` preloads 13 skills, roughly 26k tokens,
on **every** dispatch — nine dispatches in one observed run.

**Evidence required:** the agent, the skill, the estimate from the Permissions
table, and the number of dispatches it was paid for.

**The limit on this probe:** one run is one task. A skill unused while building a
server feature is not dead weight — it is the wrong task to judge it on. Report
what was unused this run and let `## Compared with the last retro` build the case
across runs. Never propose deleting a `skills:` line on a single run's evidence.

## Probe 5 — what was missed

**Read:** `plan-verifier`'s `UNKNOWN` rows and its mandatory "what evidence would
settle it"; `## AC without test evidence` from a `/sdd-run` close; `security-auditor`'s
`## Out of scope`; `doc-writer`'s `## Not documented`; and every clarifying question
an agent had to ask the orchestrator.

**Signal:** an input that existed somewhere in the run and did not reach the agent
that needed it. `sdd-run.md` already warns about the mechanism — a design reference
given once to the first implementer is invisible to the second, because subagents
share no context.

**Evidence required:** the gap, which agent hit it, and **which step should have
supplied it**. A gap with no owner is a complaint; a gap with an owner is a fix.

## Probe 6 — retries and loops

**Read:** the conversation itself, not the script — this is orchestrator state that
never lands in a transcript field. Gate runs returning `INCOMPLETE` and how many
times; `/sdd-run`'s remediation loop and how it ended (`clean` / `stalled` /
`exhausted`); the same agent type dispatched twice against the same task; a wave
that had to be re-run.

**Signal:** a retry almost never means the agent failed. It means the **plan**
under-described the work, or the reviewer's finding was wrong. Attribute it there.

**Evidence required:** the round count and the item that failed.

## Turning probes into recommendations

A recommendation needs three things or it does not ship:

1. **A Target** — the exact file someone would edit: `.claude/agents/implementer.md`,
   `.claude/commands/sdd-run.md`, a plan template, a skill. If you cannot name the
   file, you have an observation, not a recommendation; put it in the prose above.
2. **Evidence** — from a probe, in the probe's required form.
3. **The cost of ignoring it** — in the units the run produced: tokens, minutes,
   rounds, or a specific failure that will recur.

Rank by cost of ignoring, highest first. There is no severity field — see the
**No severity scale** section of `SKILL.md` for why.

And propose only. The user applies them. This is the same rule `insight-curator`
runs on: the agent that noticed the problem is not the one that gets to change the
system.
