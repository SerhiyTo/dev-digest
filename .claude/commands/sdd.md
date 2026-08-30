---
description: The Spec Driven Development chain — show the five steps, and say which one comes next
argument-hint: [feature name or artifact path, to locate where the work currently is]
---

# /sdd — the chain

The index of this repo's Spec Driven Development workflow, and the only command
here that runs no agent.

Argument: `$ARGUMENTS`

**With an argument**, work out where that feature currently stands and say which
command comes next: look for `specs/*<slug>*.md` and read its `Status:`, for
`docs/plans/*<slug>*.md`, and for whether `<module>/specs/` already documents it.
Report the artifacts that exist, the ones that do not, and the single next
command. **With no argument**, print the table below and stop.

These commands hold the **order** of the chain. The agents in `.claude/agents/`
each know their own job perfectly and nothing about what runs before or after
them — no agent sees the caller's conversation, so the sequence cannot live
inside any of them. It lived in the user's head until these files existed, which
is why the steps that produce no immediate error — approving a spec, writing the
module spec — were the ones that got skipped.

## The chain

| Command | Step | Agents it drives | Artifact |
|---|---|---|---|
| [`/sdd`](sdd.md) | 0 — where am I | none | this table, and the next command |
| [`/sdd-spec`](sdd-spec.md) | 1 — the requirement | `spec-creator` (two phases, then `approve`) | `specs/YYYY-MM-DD-<feature>.md` |
| [`/sdd-plan`](sdd-plan.md) | 2 — the plan | `implementation-planner` | `docs/plans/YYYY-MM-DD-<feature>.md` |
| [`/sdd-build`](sdd-build.md) | 3 — the change | `implementer` ×N, then `plan-verifier` **gate** | code on disk |
| [`/sdd-review`](sdd-review.md) | 4 — the second opinion | `architecture-reviewer` ‖ `security-auditor` ‖ `test-writer` | findings + tests |
| [`/sdd-close`](sdd-close.md) | 5 — the record | `plan-verifier` **final**, `doc-writer`, `spec-creator` | `<module>/specs/`, docs, `Status: implemented` |
| [`/sdd-run`](sdd-run.md) | 3–5 in one run | steps 3–5 above, minus `test-writer`, plus a remediation loop | code, findings ledger, the same records |

`/sdd-run` is the same steps 3–5, run as one command with a single human
checkpoint at the findings. It exists as the **cheap lane**: it skips `test-writer`
entirely and adds the remediation loop that the split commands never had, so a
review finding gets fixed and re-checked without a human re-driving each round.
Use the split commands when you want to stop between steps or you want the tests;
use `/sdd-run` when the plan is trusted and the budget is not. Steps 1–2 have no
cheap lane and never will — `spec-creator` and `implementation-planner` decide
*what* gets built, and that stays a deliberate act.

Then `/pr-self-review` — the merge gate, which the **user** runs, because it is a
user-invocable skill and `gh pr ready` is hooked to its report.

Step 5 also runs the `workflow-retrospective` skill, which measures the run itself —
tokens, agent count and order, friction, duplicated work — into `docs/retros/`. It
is a skill rather than a command because it grades *any* multi-agent run, not only
this chain; the user can invoke it directly at any time.

## The three rules the order encodes

- **The gate run comes before the reviewers.** Reviewing the architecture of an
  unfinished implementation produces findings against code that is about to
  change. `plan-verifier` in gate mode answers "is it done" with `ls` and a test
  run, at a fraction of an opus review.
- **The reviewers' subject is pinned to the plan's `Files:`.** `test-writer` runs
  concurrently with them; without the pin its output lands in the reviewers' diff
  and dilutes a review that explicitly does not grade tests.
- **The chain closes back onto the spec.** `AC-n` → plan task → test file →
  final-run verdict → `Status: implemented`. Break any link and SDD degrades into
  writing a document and then doing whatever.

## Conventions for adding a command

- Frontmatter carries `description` and, when the command takes input,
  `argument-hint`. The body is the prompt; `$ARGUMENTS` is substituted.
- A command names its **preconditions** and refuses to proceed without them. The
  value of a command is that it stops, not that it runs.
- A command delegates; it does not do the agents' work itself. If a step is
  editing files inline, it belongs in an agent.
- No command commits, pushes or opens a pull request.
- Add a row to the table above — this file is the only index of the set.
- **Do not add a `README.md` here.** Unlike `.claude/agents/`, every `.md` in
  this directory is parsed as a command, so a README registers as `/README`.
  That is why the index lives in this file, as a command that earns its slot.
