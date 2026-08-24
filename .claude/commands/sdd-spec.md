---
description: Step 1 of the SDD chain — write or approve the root specification via spec-creator
argument-hint: <feature request + design (Figma URL, image path, or description)> | resolve SPEC-NN | approve SPEC-NN
---

# /sdd-spec — the requirement

Step 1 of 5. Produces `specs/YYYY-MM-DD-<feature>.md`, the document every later
step is checked against. Nothing downstream may start without it.

Argument: `$ARGUMENTS`

## Asking the agent's questions — the one rule both modes share

`spec-creator` returns questions in two places: phase 1, before the spec exists,
and a resolve restate, for the `Q-n` and `UX-n` the written spec still carries.
**Both are rendered with `AskUserQuestion`, never as console text.** The agent
writes each one already carrying a `header`, a `question` and 2–4 options —
pass them through:

- One `AskUserQuestion` option per option the agent wrote, `label` and
  `description` as given. Its recommended option goes first with
  `(Recommended)` in the label, exactly as it wrote it.
- The tool takes at most 4 questions per call and the agent returns more, so send
  them in batches of 4 in the agent's order — it orders them by how much the
  answer changes the spec, so the first batch is the one that matters most.
- Never add an `Other` option; the tool adds one itself.
- `multiSelect: false` unless the question's options are plainly additive.

Do not rewrite the questions, do not answer them on the user's behalf, do not
collapse two into one to fit a batch, and do not skip the round because the
request looked complete — the questions are the part of SDD that finds the
states nobody drew.

If a question comes back malformed — no options, more than 4, an `Other` the
agent wrote itself — render what is there rather than dropping it, and say so
when you report. Losing a question silently is worse than an ugly one.

## If the argument starts with `approve`

The user is asking for the `draft` → `approved` transition, which is the gate
between this step and `/sdd-plan`. Call `spec-creator` with the spec path and the
word `approve`, and relay its answer.

`spec-creator` refuses the transition while `## Open questions` still holds an
unresolved `Q-n`, or a `UX-n` that is neither accepted nor rejected. When it
refuses, show the user the blocking items and stop — do not argue the spec into
`approved` yourself, and never edit the `Status:` line by hand. The refusal is
the mechanism working.

## If the argument starts with `resolve`

The spec exists, it is `draft`, and its `## Open questions` is what is blocking
`approve`. This mode closes those entries the same way phase 1 closed the
discovery questions — the user picks from options, never composes prose.

Three steps:

1. **Restate.** Call `spec-creator` with the spec path and the word `resolve`,
   and nothing else. It writes nothing and returns every unresolved `Q-n` and
   unaccepted `UX-n` in the `AskUserQuestion` shape, keyed by their real spec
   ids, plus any entry the repo has settled since the spec was written.
2. **Ask.** Render them under **Asking the agent's questions** above, `Q-n`
   before `UX-n`. A `UX-n` arrives as `Accept` / `Reject`; render it as it came
   and do not turn it into a yes/no in text.
3. **Fold.** Call `spec-creator` again with the spec path and a `## Resolutions`
   block, one line per id:

   ```
   ## Resolutions
   Q-5: Stated function
   UX-2: Accept
   Q-6: not decided
   ```

   The answer is the selected `label` with `(Recommended)` stripped, or the
   user's free text when they chose `Other`, or `not decided` when they skipped
   it. A skipped question stays open — never write the entry's stated default in
   its place, because a default is what happens when nobody answers, not consent.

`Status:` does not move here. When the agent reports nothing left open, the next
command is `/sdd-spec approve SPEC-NN` — a separate, deliberate act.

If the spec has no open questions at all, say so and point at `approve` rather
than calling the agent twice for nothing.

## Otherwise — write the spec

`spec-creator` runs in two phases and detects the phase mechanically: a prompt
without an `## Answers` heading is phase 1 and writes nothing. Both phases happen
inside this one command.

**Phase 1 — discovery.** Call `spec-creator` with the request verbatim, plus the
design reference and the modules you believe are involved. It returns its
findings and numbered questions `Q1`–`Qn` and writes no file.

Render them under **Asking the agent's questions** above. The agent returns 3–8,
so that is two batches at most.

**Phase 2 — write.** Collect the answers into a `## Answers` block: each `Qn`
takes the `label` the user selected with the `(Recommended)` suffix stripped, or
their free text when they chose `Other`, or `not decided` when they skipped it.
Then call `spec-creator` again with the original request verbatim followed by:

```
## Answers
Q1: <answer>
Q2: <answer>
Q3: not decided
```

An unanswered question is written as `not decided` and becomes an
`## Open questions` entry — the spec is still written, and it stays `draft`.

## Then

Report the spec path, its `Spec ID`, how many acceptance criteria it carries,
and whether any open question remains. Tell the user the next step explicitly:

- open questions remain → **run the `resolve` steps above straight away, in this
  same command run.** The spec is fresh, the agent's context is warm and the user
  is already here; making them come back with `/sdd-spec resolve SPEC-NN` later
  is the step that silently gets skipped. Then `/sdd-spec approve SPEC-NN`.
- none remain → `/sdd-spec approve SPEC-NN`, then `/sdd-plan`

The user can decline the resolve round and answer later — say so, and name the
command. What you may not do is leave `Q-n` and `UX-n` sitting in a file with no
prompt attached to them.

## Boundaries

- `spec-creator` writes only under the root `specs/`. A request to put it
  anywhere else — `<module>/specs/`, `docs/` — is a different agent's job
  (`doc-writer`) and belongs to `/sdd-close`.
- Do not call `implementation-planner` from this command. Planning against a
  `draft` spec is what this step exists to prevent.
