---
description: Step 5 of the SDD chain — final verification, documentation, spec status, PR gate
argument-hint: <plan path, e.g. docs/plans/2026-08-20-blast-radius.md>
---

# /sdd-close — the record

Step 5 of 5. The step that is easiest to skip and most expensive to have skipped:
it is what feeds the next feature's `spec-creator` and `implementation-planner`
their context.

Argument: `$ARGUMENTS`

## 1 — plan-verifier, final run

Call `plan-verifier` in **final** mode **on opus**, naming the mode and the fix
files. The agent defaults to sonnet, which is right for the gate run's mechanical
checks and wrong for tracing `AC-n` through the coverage table — ask for the model
explicitly:

> Run in **final** mode against `docs/plans/<plan>.md`. Reviews and tests have
> run. Scope-drift baseline is every task's `Files:`, plus the `Proven by` paths
> in `## Acceptance-criteria coverage`, plus these review fixes: `<paths>`.

Final mode adds what gate mode deliberately left out: the plan-level sections,
and **one item per `AC-n` in the spec** — traced through the coverage table,
judged against each criterion's own `Observed by:` line. An `AC-n` the spec
declares and the plan never listed is `NOT MET` against the plan even when every
task passed. That check is the whole reason this chain writes a spec at all.

Do not continue on `INCOMPLETE`. Send it back to `implementer`.

## 2 — doc-writer

Call `doc-writer` with the plan path and the diff. It writes the module spec into
`<module>/specs/`, topic docs into `<module>/docs/`, and README sections where
the surface changed.

**This step is not optional.** `<module>/specs/` is a required input for
`spec-creator` (its context list, step 3), `implementation-planner` (step 5) and
`test-writer`. Skipping it does not fail today — it starves the next feature, and
the failure surfaces two features later as agents planning into a vacuum.

## 3 — spec status → implemented

Call `spec-creator` with the spec path and the word `implemented`, pointing at
the merged work. It verifies the acceptance criteria against the code and reports
any criterion it could not confirm rather than quietly marking it done.

A spec left at `approved` forever is the same failure as a spec left at `draft`:
the directory stops telling the truth about what the product does.

## 4 — the retrospective

Invoke the `workflow-retrospective` skill with the feature slug and the plan path.
It measures the run from the session transcripts — orchestrator versus subagent
tokens, how many agents ran and in what order, where each one struggled, what work
was duplicated — and writes `docs/retros/YYYY-MM-DD-<feature>.md`.

Carry every agent's report forward to it, and tell it explicitly how many gate
rounds it took and what came back `UNKNOWN`: that is orchestrator state which never
reaches a transcript, and it is the strongest signal the chain produces about
whether the *plan* described the work.

The retro proposes changes to `.claude/agents/` and `.claude/commands/` and makes
none of them. Report its path and its recommendations; the user decides.

## 5 — hand over to the gate

`/pr-self-review` is the merge gate and **the user runs it, not you** — it is a
user-invocable skill, and `gh pr ready` is hooked to its report. Tell the user
that is the next command, and stop.

Do not commit, push or open a pull request from this command.

## Then

Report: the final verdict with its AC ledger, the documents written, the retro's
path with its headline numbers and recommendations, the spec's
new status, and anything still open. Say plainly what was left undone and why —
a close-out that hides a gap is worse than one that names it.
