# Specs

Specifications written **before** the code — the Spec Driven Development
artifact this repo plans and builds from. One file per feature, whatever
modules it spans.

Written by the [`spec-creator`](../.claude/agents/spec-creator.md) subagent, and
by nothing else.

## This directory versus `<module>/specs/`

Two collections, two different jobs. The tense is the whole distinction:

| | `specs/` (here) | `<module>/specs/` |
|---|---|---|
| Written | **Before** implementation | **After** implementation |
| Answers | What must the product do | What does this module do, and why not the alternative |
| Scope | The feature, across every module it touches | One module |
| Author | `spec-creator` | `doc-writer` |
| Shape | Fixed sections, EARS acceptance criteria | Prose, `**Component:** / **Behavior:**`, `**Why X and not Y**` |
| Read by | `implementation-planner`, then everyone | Anyone changing that module |

A feature therefore ends up with both: one document here that decided what to
build, and one per module over there recording what was actually built. Neither
replaces the other, and neither is edited by the other's author.

`docs/plans/` is a third thing again — the task-by-task Implementation Plan
`implementation-planner` derives from a spec here.

## File naming and Spec ID

`YYYY-MM-DD-<feature-slug>.md`, matching the dated-document convention used
everywhere else in this repo. The date is when the spec was created and does not
change afterwards.

Inside, the header carries a stable identifier:

```
# Spec: Blast radius on the PR overview
Spec ID: SPEC-03
Status: draft
Supersedes: none
```

The id is what other documents, tickets and superseding specs point at, because
it survives a rename. Numbers are allocated by scanning the directory:

```
rg '^Spec ID: SPEC-' specs/
```

Highest number plus one, zero-padded to two digits. Ids are never reused and
never renumbered.

## Status

| Status | Means |
|---|---|
| `draft` | Under discussion. Open questions remain, or nobody has signed off. Do not plan against it. |
| `approved` | Signed off, no unresolved open question. This is what `implementation-planner` builds a plan from. |
| `implemented` | The work merged and the acceptance criteria were checked against the code. |

A spec is never deleted. A decision that replaces an earlier one gets a **new**
spec carrying `Supersedes: SPEC-MM`, and the old one gains a `Superseded by:`
line and keeps its content — the record of why the first answer was wrong is
usually worth more than the first answer.

### Who moves it

Neither transition happens on its own, and `spec-creator` performs both only when
asked for them by name — it creates every spec as `draft` and never approves its
own work. That is what the chain commands are for:

| Transition | Command | Precondition |
|---|---|---|
| `draft` → `approved` | `/sdd-spec approve SPEC-NN` | No unresolved `Q-n`, and every `UX-n` accepted or rejected |
| `approved` → `implemented` | `/sdd-close`, step 3 | The work is merged, and `spec-creator` could confirm the criteria against the code |

A spec stuck at `draft` blocks `/sdd-plan` by design. A spec stuck at `approved`
after the work shipped blocks nothing, which is precisely why it is the one that
gets forgotten — and why `/sdd-close` performs the transition rather than
suggesting it.

## Sections

Every spec here has the same nine sections, in this order:

1. **Problem and user** — who cannot do what today
2. **Goals and non-goals** — outcomes, and what is deliberately excluded
3. **User stories** — `US-n`
4. **Acceptance criteria (EARS)** — `AC-n (US-m)`, each with what to observe
5. **Edge cases** — the states the design never drew
6. **Non-functional requirements** — numbers, limits, cost, contract impact
7. **Inputs and provenance** — who produces each field, and what absence means
8. **Untrusted inputs** — everything crossing a trust boundary
9. **Open questions** — `Q-n` still undecided, `UX-n` proposed and not yet accepted

## EARS

Acceptance criteria are written in [EARS](https://alistairmavin.com/ears/)
(Easy Approach to Requirements Syntax — Mavin, Wilkinson, Harwood and Novak,
IEEE RE'09), in English, using `shall`. Five patterns and nothing else:

| Pattern | Shape |
|---|---|
| Ubiquitous | The system shall `<response>` |
| Event-driven | WHEN `<trigger>`, the system shall `<response>` |
| State-driven | WHILE `<state>`, the system shall `<response>` |
| Unwanted behaviour | IF `<condition>`, THEN the system shall `<response>` |
| Optional feature | WHERE `<feature enabled>`, the system shall `<response>` |

The point is that condition and response stay apart, so a criterion reads as a
test. One behaviour per criterion, numbers instead of adjectives, and each one
names the single thing you would look at to see whether it held.

## Writing one

`spec-creator` runs in two phases, and the first one writes no file:

1. Call it with the feature request, the design (a Figma URL, a screenshot path,
   or a written description) and the modules you think are involved. It returns
   its findings and numbered questions `Q1`–`Qn`.
2. Answer them, and call it again with the original request plus an `## Answers`
   block. It writes the spec.

Skipping phase 1 does not work — the agent detects the phase by whether the
prompt contains `## Answers`, and without it, it will return questions again.
