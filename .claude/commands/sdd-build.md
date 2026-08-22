---
description: Step 3 of the SDD chain — execute an Implementation Plan and gate it with plan-verifier
argument-hint: <plan path, e.g. docs/plans/2026-08-20-blast-radius.md>
---

# /sdd-build — the change

Step 3 of 5. Executes the plan and stops the chain the moment the work does not
match it.

Argument: `$ARGUMENTS`

Read the plan's `## Execution mode` first — it decides the shape of this step.

## single-agent

Call `implementer` once with the plan path. It works through the tasks in
`Depends on` order.

## multi-agent

One wave at a time, never two.

1. Dispatch every task in the wave as its own `implementer`, **all in a single
   message** so they run concurrently.
2. Wait for the whole wave. Do not start the next wave on a partial result.
3. Run the gate (below) against that wave's tasks.
4. Only then move to the next wave.

The plan already guarantees a wave's tasks have disjoint `Files:` lists — if two
running agents report touching the same file, that is a planning defect: stop,
say so, and do not paper over it.

## The gate — after every wave, and after single-agent execution

Call `plan-verifier` in **gate** mode, naming the mode explicitly and scoping it
to the tasks just executed:

> Run in **gate** mode against `docs/plans/<plan>.md`, tasks T1–T4. Nothing else
> has run yet: test files are not expected, and every changed file outside those
> tasks' `Files:` lists is real scope drift.

In gate mode the verifier enumerates task items only, runs each **distinct**
`Verify:` command once, and treats a missing test as `N/A` rather than `NOT MET`.

**On `INCOMPLETE`** the next agent is `implementer` again, not a reviewer. Hand
the failing item ids and their evidence straight back and re-run the gate. Do not
proceed to `/sdd-review` with a red gate — an architectural review of unfinished
code produces findings against code that is about to change, and it costs an opus
pass to learn something `ls` already knew.

## Then

Report: tasks completed, what each `implementer` said it was blocked on, the gate
verdict, and any scope drift. Carry every implementer's `## Handoff` section
forward verbatim — the review agents in the next step read it first.

Next step: `/sdd-review <plan path>`.

## Boundaries

- No agent in this step commits, pushes or opens a pull request.
- Do not fix findings here. This step delivers what the plan asked for; judging
  it is `/sdd-review`.
