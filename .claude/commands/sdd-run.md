---
description: Run the SDD chain from an existing plan to close-out — build, gate, review, remediate, record — with one human checkpoint
argument-hint: <plan path> [--req "extra requirements"] [--design <figma url | image path>]...
---

# /sdd-run — plan to close, in one command

Steps 3–5 of the chain in a single run: `/sdd-build` + `/sdd-review` +
`/sdd-close`, plus the remediation loop those three never had.

Argument: `$ARGUMENTS`

**This command starts at the plan.** It never calls `spec-creator` and never
calls `implementation-planner` — those two decide what gets built, and that
decision stays a deliberate human act. Run `/sdd-spec` and `/sdd-plan` first;
this command refuses to invent a plan it can execute.

It is also the **cheap** lane of the chain. `test-writer` does not run,
`architecture-reviewer` and `plan-verifier`'s gate run on sonnet, and every
re-review after a fix is pinned to the fixed files instead of the whole diff.
What that costs is stated in **The tests you are not getting** below — read it
once, then stop thinking about it.

## 0 — Preflight, before any agent

Parse the argument into three parts:

- **plan path** — the first bare path. Required. If absent, or the file does not
  exist, stop and point at `/sdd-plan`.
- **`--req <text>`** — extra requirements that arrived after the plan was
  written. Optional, may be quoted prose of any length.
- **`--design <ref>`** — a Figma URL, an image path, or a design description.
  Optional, repeatable.

Then:

1. Read the plan's `## Execution mode` and its task graph. The mode decides the
   shape of step 1 and nothing else.
2. Read the spec the plan points at. **If its `Status:` is not `approved`, stop**
   and point at `/sdd-spec approve SPEC-NN`. Building against a `draft` spec is
   the failure the chain exists to prevent, and it is no less a failure for
   happening inside an automated command.
3. Build the **context pack** — the plan task, plus every `--req`, plus every
   `--design` — and hand it to **each** implementer. Subagents share no context:
   a design reference given once to the first implementer is invisible to the
   second. Repeat it every time or it does not exist.
4. If `--req` contradicts the plan rather than extending it, say so and stop.
   A requirement the plan never accounted for is a re-plan, not a bigger task —
   send it back to `/sdd-plan`.

## 1 — Build

**single-agent:** call `implementer` once with the plan path and the context pack.

**multi-agent:** one wave at a time, never two. Dispatch every task in the wave as
its own `implementer` **in a single message** so they run concurrently, wait for
the whole wave, run the gate against that wave, and only then start the next one.
The plan guarantees a wave's `Files:` lists are disjoint; two agents reporting the
same file is a planning defect — stop and say so rather than papering over it.

## 2 — Gate

Call `plan-verifier` in **gate** mode, naming the mode and scoping it to the tasks
just executed:

> Run in **gate** mode against `docs/plans/<plan>.md`, tasks T1–T4. Reviews have
> not run and `test-writer` will not run at all in this lane: a missing test file
> is `N/A`, not `NOT MET`. Every changed file outside those tasks' `Files:` lists
> is real scope drift.

On `INCOMPLETE` the next agent is `implementer`, never a reviewer. Hand back the
failing item ids with their evidence and re-run the gate. **Two attempts, then
stop and escalate** — a gate that fails three times is not an implementation
problem, it is a plan that does not describe the work.

Do not enter step 3 on a red gate. An architectural review of unfinished code
produces findings against code that is about to change.

## 3 — Review

Dispatch both in **one message**. They are read-only and independent.

1. **`architecture-reviewer`** — pin its subject:

   > Review against `docs/plans/<plan>.md` — the union of every task's `Files:`.
   > Drop test files and generated migrations from the subject.

2. **`security-auditor`** — the same subject, plus anything security-relevant the
   plan did not declare. Give it the plan's `## Contract & version impact` and
   every implementer `## Handoff` verbatim.

`test-writer` is not dispatched here. That is this lane's defining choice, not an
oversight.

## 4 — Reduce

Merge both reviewers' findings. Severity is `CRITICAL | WARNING | SUGGESTION` and
nothing else — normalise any foreign scale on the way in (`HIGH → WARNING`,
`MEDIUM → SUGGESTION`). Deduplicate by `file:start_line`; the same defect found by
both agents is one finding, kept at the higher severity.

Zero findings is a valid and good answer from either reviewer. Never send an agent
back to find something.

## 5 — Checkpoint (the only stop in this command)

Present the merged list to the user with a recommendation per finding, and wait.
This is the one decision the command does not make on its own, because it is the
one where "the agent was confident" is not evidence of anything.

Default proposal, which the user may override per finding:

| Severity | Default |
|---|---|
| `CRITICAL` | fix |
| `WARNING` | fix |
| `SUGGESTION` | report only — never fixed automatically |

## 6 — Remediation loop

Everything the user marked *fix*, up to **three rounds**:

1. **Fix.** Dispatch `implementer` with the finding, the file, and the direction —
   one message per finding, or one per file when several land in the same file.
   Never edit the file here yourself, and never ask a reviewer to fix what it
   found: the agent that formed the theory is the worst judge of whether the
   patch disproves it.
2. **Re-review, pinned to the fix.** Re-dispatch only the reviewer whose findings
   were fixed, with its subject set to **the files this round changed** and
   nothing else:

   > Re-review only these files, changed to address `<finding ids>`:
   > `<paths>`. Prior findings for context: `<the ones being fixed>`. Report
   > whether each is resolved, and any new finding these edits introduced.

   The narrow pin is what makes the loop affordable. It is also what makes it
   honest: a fix that breaks something outside its own files shows up in step 7's
   `plan-verifier` run, which sees the whole plan.
3. **Merge** the round's findings into the ledger, reusing step 4's rules.

Track every file each round touched — step 7 needs them, because they are
legitimately outside the plan's `Files:` lists.

**Exit conditions**, checked in this order:

- **Clean** — no `CRITICAL` and no `WARNING` remain. Go to step 7.
- **Stalled** — a round resolved nothing, or resolved one finding and introduced
  another at the same severity. Stop the loop and escalate to the user with what
  is left. A loop that is not converging will not converge by running again.
- **Exhausted** — three rounds done. Stop, and report every finding still open.

Never silently drop a finding to `SUGGESTION` to satisfy an exit condition.

## 7 — Close

1. **`plan-verifier`, final mode — on opus.** Ask for the model explicitly; the
   agent's own default is sonnet, which is right for the gate and wrong here.

   > Run in **final** mode against `docs/plans/<plan>.md`. Reviews have run,
   > `test-writer` did not. Scope-drift baseline is every task's `Files:`, plus
   > the `Proven by` paths in `## Acceptance-criteria coverage`, plus these
   > remediation fixes: `<paths>`.

   Final mode adds one item per `AC-n` in the spec, traced through the coverage
   table and judged against each criterion's own `Observed by:` line. Do not
   continue on `INCOMPLETE` — send it back to `implementer`.

2. **`doc-writer`** with the plan path and the diff. It writes the module spec into
   `<module>/specs/`, topic docs into `<module>/docs/`, README sections where the
   surface changed. **Not optional:** `<module>/specs/` is a required input for
   `spec-creator`, `implementation-planner` and `test-writer`. Skipping it does not
   fail today; it starves the next feature.

3. **`spec-creator` with the word `implemented`**, pointing at the merged work. It
   verifies the criteria against the code and reports what it could not confirm.
   This is the one `spec-creator` call this command makes, and it authors nothing —
   it moves a status line that would otherwise lie forever.

4. **The `workflow-retrospective` skill**, with the feature slug and the plan path.
   It measures the run from the session transcripts and writes
   `docs/retros/YYYY-MM-DD-<feature>.md`.

   This lane is the richest input it will ever get: it is the only one that tracks
   **gate retry rounds** and how the remediation loop ended — `clean`, `stalled` or
   `exhausted`. Neither reaches a transcript, so hand both to the skill explicitly,
   along with every finding that was accepted rather than fixed and the
   `## AC without test evidence` list. A run that stalled is the chain telling you
   the plan was wrong, and this is the only place that gets written down.

   It proposes changes to the agents and commands and applies none.

## The tests you are not getting

`test-writer` is skipped to save tokens, and the cost is precise: acceptance
criteria whose `Observed by:` line names a test file that nobody wrote come back
from the final `plan-verifier` run as `UNKNOWN`, not `MET`.

Make that visible instead of letting it pass as done. The final report **must**
carry:

```
## AC without test evidence
AC-3 — <criterion> — Observed by: server/test/foo.test.ts — file does not exist
AC-7 — ...
```

An empty section is a good report. A missing section is a dishonest one. To pay
the debt down later, run `test-writer` against the spec on its own, or use the
full `/sdd-review`, which still dispatches it.

## Then

Report, in this order:

- tasks completed, and what each implementer said it was blocked on
- the gate verdict, and any scope drift
- merged findings by severity: fixed, accepted, still open
- how the remediation loop ended — clean, stalled or exhausted — and after how
  many rounds
- the final verdict with its AC ledger, plus `## AC without test evidence`
- documents written, and the spec's new status
- the retrospective path, its headline numbers, and its recommendations

Then tell the user the next command is **`/pr-self-review`**, and that **they** run
it, not you — it is a user-invocable skill and `gh pr ready` is hooked to its
report.

## Boundaries

- No agent in this command commits, pushes or opens a pull request.
- No `spec-creator` authoring, no `implementation-planner`. Preconditions, not
  steps.
- One checkpoint, at step 5. Everything else runs through, including failures —
  but a failure stops the command and says so; it never degrades into continuing
  with less.
- Say plainly what was left undone and why. A close-out that hides a gap is worse
  than one that names it.
