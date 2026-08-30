# Retros

Retrospectives on **how a multi-agent run performed** — one file per run, written
after the work is done and the record is closed.

Written by the [`workflow-retrospective`](../../.claude/skills/workflow-retrospective/SKILL.md)
skill, and by nothing else. `/sdd-close` and `/sdd-run` invoke it at their record
step; the user can also invoke it directly at any time.

## What a retro is, and is not

| | A retro records | It does not record |
|---|---|---|
| Subject | The run: tokens, agents, order, friction, waste | The product, the feature, or the code |
| Evidence | Session transcripts on disk, plus the agents' own reports | Opinion about how it felt |
| Audience | Whoever tunes `.claude/agents/` and `.claude/commands/` next | Anyone changing the feature |
| Lifetime | True of one run, forever. Never edited | — |

A retro is **not** an INSIGHTS entry. `<module>/INSIGHTS.md` holds durable lessons
about the code, gated on "will it still be true next month" — which run telemetry
fails by design. The two never mix, and this skill never writes an INSIGHTS.md.

It is also not a review. Code is graded by `pr-self-review`,
`architecture-reviewer` and `security-auditor`, on the `CRITICAL / WARNING /
SUGGESTION` scale. A retro grades the process and deliberately has no severity
scale: its recommendations carry a **Target** — the file someone would edit — plus
evidence and the cost of ignoring it.

## File naming

`YYYY-MM-DD-<feature-slug>.md`, with the slug matching the feature's other
artifacts, so the set reads as one row:

```
specs/2026-08-16-blast-radius.md          what to build
docs/plans/2026-08-16-blast-radius.md     how it was planned
docs/retros/2026-08-16-blast-radius.md    what the run cost, and what to fix next time
```

The date is the run's date and does not change afterwards.

## Reading them as a series

One retro is a number; the series is the point. Every retro carries a
`## Compared with the last retro` section that diffs the headline metrics against
its predecessors and checks whether the previous run's recommendations were
actually applied to their Target files.

**A recommendation that survives three retros is no longer a recommendation** — it
is a defect in the chain, and the retro says so and proposes encoding it in the
agent or command file so nobody has to keep rediscovering it.

## They are drafts

Like an INSIGHTS entry, a retro is a draft under human review. The skill measures,
concludes and proposes; **nothing here is applied automatically.** Edits to
`.claude/agents/` and `.claude/commands/` are made by a person who read the
evidence and agreed with it.
