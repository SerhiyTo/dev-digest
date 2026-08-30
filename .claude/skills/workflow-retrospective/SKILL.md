---
name: workflow-retrospective
description: 'Measures how a multi-agent run actually went and writes the retrospective — tokens spent by the orchestrator versus every subagent, how many agents ran and in what order, which waves were parallel, where each agent struggled, what work was duplicated across them, and what nobody was told. Reads the session transcripts on disk rather than asking the agents how they felt. Use this skill whenever a multi-agent chain has just finished — `/sdd-close` or `/sdd-run` reaching its record step, a fan-out of subagents completing, a Workflow run returning — and whenever the user asks how the run went, what it cost, how many tokens or agents it took, why it was slow, which agent had trouble, what got done twice, or what should change in the agents or the chain before the next feature. Trigger it even when nobody says "retrospective", "metrics" or "tokens": "як пройшов запуск", "why did that take so long", "was that worth it" and "what should I fix in these agents" are all this skill. Complements engineering-insights, which records what was learned about the CODE, and insight-curator, which promotes those learnings elsewhere; this skill owns how the RUN performed, writes only to docs/retros/, and never touches an INSIGHTS.md. It does not grade code — pr-self-review, architecture-reviewer and security-auditor own that.'
version: 1.0.0
user-invocable: true
metadata:
  scope: shared
  tags: [retrospective, multi-agent, telemetry, tokens, subagents, process, cost]
---

# Workflow Retrospective

A multi-agent run is the only part of this repo nobody measures. Every cost claim
in `.claude/commands/` is prose — *"it costs an opus pass to learn something `ls`
already knew"*, *"`test-writer` is skipped to save tokens"* — and the only numbers
anywhere are the hand-written preload estimates in `.claude/agents/README.md`.
Meanwhile the agents' own reports say what they changed and never how the run
went: no timings, no retries, no duplicated reads, no "the plan under-described
this".

The data has been on disk the whole time. Every session writes its main transcript
to `~/.claude/projects/<slug>/<session-uuid>.jsonl` and one full transcript per
subagent to `<session-uuid>/subagents/agent-<id>.jsonl`, each with per-message token
usage, per-record timestamps, the resolved model and the agent type. On a real
dev-digest run: 279 763 output tokens in the orchestrator against **614 025 in the
subagents** — 69 % of everything generated happened where nobody was looking.

This skill turns that into one report and one file. It owns **how the run
performed**; it does not grade the code the run produced (`pr-self-review`,
`architecture-reviewer`, `security-auditor`), and it never writes an `INSIGHTS.md`
(`engineering-insights` owns those, and its quality gate correctly rejects process
telemetry).

## The default answers

| Question | Default answer |
|---|---|
| Which session? | The newest `.jsonl` in the project's transcript dir. The script picks it; pass a uuid to override |
| Where does the report go? | `docs/retros/YYYY-MM-DD-<feature-slug>.md`, **and** the same report in chat |
| A number you could not measure? | Write `not established`. Never estimate a token count — the real one is on disk |
| An agent said the task was hard? | That is a claim, not evidence (`plan-verifier.md:231`). Cite tool count, duration, retries |
| Severity of a recommendation? | There isn't one. See **No severity scale** below |
| Nothing went wrong? | Say so, in `## What went easily`. A retro that only lists problems is not a measurement |
| Who applies the recommendations? | The user. This skill proposes edits to `.claude/agents/` and `.claude/commands/`; it makes none |

## The four questions

Everything this skill produces answers one of four, and each maps to one report
section:

1. **What did it cost?** — orchestrator vs subagent tokens, cache reads, thinking.
2. **What ran, and in what order?** — launch sequence, parallel waves, models.
3. **Where was there friction, and where was there none?** — retries, blocked items,
   duration and tool-count outliers, and the agents that sailed through.
4. **What was wasted?** — the same file read by six agents, a skill preloaded and
   never invoked, an input the orchestrator forgot to pass down.

## Running it

```
bash .claude/skills/workflow-retrospective/assets/session-metrics.sh [<session-uuid>]
```

One JSON object on stdout: `session`, `orchestrator`, `subagents_total`,
`subagent_share_of_output`, `launches`, `agents`, `parallelism`, `by_agent_type`,
`duplication`, `tools`, `skills`, `turns`, `notes`.

It never guesses. A session with no subagents returns valid JSON with a `notes`
entry saying so; a session uuid that does not exist exits `1`. If `notes` is
non-empty, every note goes into the report — a missing transcript changes what the
numbers mean.

Read `references/metrics.md` before hand-writing any jq against a transcript. Six
of its recipes are counter-intuitive and getting one wrong silently produces a
believable wrong number — summing `output_tokens` per record instead of
`max_by` per `message.id` undercounts a subagent by **22×**.

## Reading the numbers

The script measures. You interpret — and the interpretation is where the value is,
because a token count nobody acts on is a number, not an insight.

- **Start from `subagent_share_of_output`.** Above ~60 % means the orchestrator is a
  dispatcher and the agent definitions are where cost lives. Below ~20 % means the
  fan-out did not earn itself.
- **`parallelism.agent_time_ratio`** is agent-seconds per session-second. Below 1
  on an unattended chain run means agents mostly ran one at a time; a `waves` entry
  whose `slowest_s` is several times its `fastest_s` is paying real barrier cost.
  On a session with a human in the loop the ratio is meaningless — say so instead
  of reporting it.
- **`duplication.files_read_by_n_agents`** is the direct answer to "what was
  duplicated". A file read by ≥3 agents belongs in the plan's context pack or a
  preloaded skill, not in three independent searches.
- **`agents[].skill_calls` against the agent's `skills:` frontmatter** is the most
  actionable output this skill has: a preloaded skill that was never invoked is a
  line you can delete today. `implementer` preloads 13 (34k tokens, measured) per dispatch.
- **Duration and `tool_calls` outliers** are where to look for friction — then go
  read that agent's transcript and quote the actual line.

`references/rubric.md` has the six probes in full, with what to read for each and
what evidence a finding must cite.

## Every row is labelled

The report carries two kinds of claim and must never blend them:

- `measured` — it came out of a transcript. Cite the number.
- `inferred` — you read the run and concluded it. Cite the transcript line, the
  report section or the `path:line` that supports it.

An inferred row with no citation does not go in the report. `## Not established`
is where a question you could not answer goes, and it is mandatory even when empty.

## No severity scale

This skill does **not** use `CRITICAL | WARNING | SUGGESTION`. That vocabulary
grades code findings (`server/src/vendor/shared/contracts/findings.ts:11`), and a
parallel scale for process findings is exactly the pressure that makes models
inflate. A recommendation here carries a **Target** — the file someone would edit —
plus its evidence and what it costs to ignore. If you cannot name the file, it is
not a recommendation yet.

## Report like this

The file and the chat message use the same skeleton; the chat version may drop the
per-agent table when it runs past ~12 rows and point at the file instead. Start at
the `#` heading, no preamble. `references/report.md` carries the full template.

```markdown
# Retrospective: <feature> — <YYYY-MM-DD>
Session `<uuid>` · <chain> · Plan: `docs/plans/<…>.md`

## Cost                     measured
## The run                  measured
## Where it was hard        inferred
## What went easily         inferred
## Duplicated work          measured + inferred
## What was missed          inferred
## Recommendations
## Compared with the last retro
## Not established
```

## Red flags — if you think this, stop

| Thought | Reality |
|---|---|
| "roughly ~50k tokens" | The exact number is on disk. Run the script, or write `not established` |
| "the implementer said it was hard" | That is a claim. Cite retries, tool count, duration |
| "cache reads are just input tokens" | 214 M cache-read tokens in one session. Its own column, always |
| "I'll sum `output_tokens` across records" | One API message spans N records. `group_by(.message.id) \| max_by(…)`, or you are off by 22× |
| "the main transcript has everything" | Subagent tokens live only in `subagents/*.jsonl`. Undercount ≈ 2× |
| "this belongs in INSIGHTS.md" | Its gate rejects process content. Retros live in `docs/retros/` |
| "nothing went wrong, so there's no retro" | The run still cost something. A clean run is the cheapest baseline you will ever get |
| "I'll fix the agent file while I'm here" | Propose it. The human applies it — same rule `insight-curator` runs on |

## Where to read more

| Read this | When |
|---|---|
| `references/metrics.md` | Writing or debugging jq against a transcript; what each field means and the six ways to get it wrong |
| `references/rubric.md` | Turning the JSON into findings: the six probes, what evidence each needs, the labelling rule |
| `references/report.md` | The artifact template, the naming rule, and how to compare against previous retros |

## Project profile: dev-digest

Root `CLAUDE.md` and `<module>/CLAUDE.md` win if they ever contradict this file.

| Thing | Where |
|---|---|
| Transcripts | `~/.claude/projects/-Users-<user>-Documents-projects-dev-digest/` |
| Retro artifacts | `docs/retros/YYYY-MM-DD-<feature>.md` (`docs/retros/README.md` for the convention) |
| The chain being measured | `.claude/commands/sdd*.md` — `/sdd-spec → /sdd-plan → /sdd-build → /sdd-review → /sdd-close`, or `/sdd-run` |
| Agent roster, pinned models, preload estimates | `.claude/agents/README.md` — the Catalog and Permissions tables |
| The run's intent, to judge the cost against | `specs/YYYY-MM-DD-<feature>.md` and `docs/plans/YYYY-MM-DD-<feature>.md` |

Local rules that override the generic advice.

- **`/sdd-run` is the richest source.** It is the only lane that tracks gate retries
  (two, then escalate) and remediation-loop exit state (`clean` / `stalled` /
  `exhausted`). Those come from the orchestrator's own messages, not the script —
  read them out of the conversation and put them in `## Where it was hard`.
- **A wave in the plan is not a wave in the data.** `parallelism.waves` groups
  launches within 30 s of each other. Where that disagrees with the plan's
  `## Execution mode`, the disagreement is the finding: the plan said parallel and
  the run was serial.
- **`spawn_depth > 1` means an agent spawned an agent.** No `/sdd-*` command does
  that; if it shows up, say so.
- **Never propose deleting an agent's `skills:` entry on one run's evidence.** One
  run is one task. Say which run it was unused in, and let the trend section across
  retros make the case.
