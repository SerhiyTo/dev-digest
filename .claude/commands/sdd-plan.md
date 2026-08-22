---
description: Step 2 of the SDD chain — turn an approved spec into an Implementation Plan
argument-hint: <spec path or Spec ID, e.g. specs/2026-08-20-blast-radius.md>
---

# /sdd-plan — the plan

Step 2 of 5. Produces `docs/plans/YYYY-MM-DD-<feature>.md`.

Argument: `$ARGUMENTS`

## Before delegating

Read the spec's header. **If `Status:` is not `approved`, stop and say so**, and
point at `/sdd-spec approve SPEC-NN`. `implementation-planner` treats a `draft`
spec as a non-mandate and will say the same thing more slowly.

If no spec exists at all, say that plainly and offer `/sdd-spec` first. Planning
without a spec is allowed — the planner handles it and marks the plan as having
no source of truth — but it is a decision the user makes knowingly, not a default.

## Plan mode — resolve this before delegating

`implementation-planner` writes exactly one file, into `docs/plans/`. Plan mode
permits writes only to its own plan file, so under plan mode the delegation below
**cannot complete** — and it fails silently: the step still looks like it ran,
because whoever holds the conversation writes a plan anyway.

If plan mode is active, take one of these and say which:

- **Leave plan mode first**, then delegate normally. This is the default, and the
  only path where the planner's six preloaded skills are in context at the moment
  the plan is written.
- **Write the plan yourself.** Then you are the planner and you inherit its
  obligations: read `.claude/agents/implementation-planner.md` for the plan
  format, the skill-routing table and the per-module `Verify:` table, and invoke
  `onion-architecture`, `frontend-ui-architecture`, `semver-discipline`,
  `breaking-change` and `deprecation-policy` before writing — the plan routes
  tasks to all five, and a plan written without them is guessing at its own
  routing. Write the plan-mode file, then copy it to
  `docs/plans/YYYY-MM-DD-<feature>.md` once it is approved: that is the path
  `/sdd-build` reads, and a plan that never lands there is invisible to the rest
  of the chain.

Not hypothetical. `docs/retros/2026-08-22-project-context.md` records a
`/sdd-plan` run under plan mode with **zero** dispatches of
`implementation-planner` and its six skills never loaded.

## Delegate

Call `implementation-planner` with the spec path and the request. It answers in
one round with clarifying questions, the single-agent-or-multi-agent question,
and its recommendations, **before** writing anything.

**If you fan out helper agents around this step** — `Explore` or `researcher`
passes that map the code before planning — hand each one the spec *excerpt* it
needs and say the spec is already resolved. Passing the path alone makes every
agent read the whole file and rediscover what you already know: in the run above,
all three helper agents independently read the same 38 KB spec and all three
opened their report with the same finding, about 115 KB of redundant input that
scales linearly with agent count. `implementation-planner` is the exception — the
spec is its source of truth and it reads the file itself.

**Ask that round with `AskUserQuestion`, never as console text.** The planner
returns each question already carrying a `header`, a `question` and 2–4 labelled
options — pass them through unrewritten, its default first with `(Recommended)`
in the label, and no `Other` option because the tool adds one. The clarifying
questions and the execution-mode question fit one call; drop the mode question
only when the user has already stated the mode.

Its **recommendations are prose, not a question** — show them as text above the
tool call so the user reads them before choosing.

Answer nothing on the user's behalf. Then call the planner again with the
answers — the selected `label` with any `(Recommended)` suffix stripped, or
their free text when they chose `Other` — and it writes the plan.

## Check the plan before handing it on

Two things, both mechanical, both cheap, and both cheaper here than three steps
later:

1. **Acceptance-criteria coverage.** The plan carries an
   `## Acceptance-criteria coverage` table. Compare its row count against the
   spec's criteria:

   ```sh
   rg -o 'AC-[0-9]+' <spec> | sort -uV | wc -l      # criteria the spec declares
   rg -c '^\| AC-[0-9]+ \|' <plan>                  # rows the table carries
   ```

   Count the **ids**, not the lines: criteria are written `- **AC-1 (US-1)**:`,
   so an anchored `^AC-` matches nothing and the check passes on every spec while
   measuring none of them. A criterion the spec declares and the table omits is a
   dropped requirement — send it back to the planner rather than discovering it
   in `/sdd-close`.
2. **Per-task `Verify:` is the unit lane.** No task may run `pnpm test` in
   `server/`: that suite starts a Postgres testcontainer per `*.it.test.ts` file.
   The integration lane belongs to `## Verification (end to end)` and nowhere
   else. A plan that gets this wrong makes every later step minutes slower.

## Then

Report the plan path, the task count, the modules, the execution mode and its
wave count, what the coverage table leaves uncovered, and whether anything is
breaking. Next step: `/sdd-build <plan path>`.
