---
description: Step 4 of the SDD chain — architecture, security and test coverage, in parallel
argument-hint: <plan path, e.g. docs/plans/2026-08-20-blast-radius.md>
---

# /sdd-review — the second opinion

Step 4 of 5. Three agents, none of which wrote the code, each owning a verdict
the others refuse to give.

Argument: `$ARGUMENTS`

Precondition: `/sdd-build`'s gate returned `COMPLETE`. If it did not, or was
never run, say so and go back — reviewing unfinished work wastes the review.

## Dispatch all three in one message

They are independent: two are read-only, and `test-writer` writes only into the
test globs, so nothing collides.

1. **`architecture-reviewer`** — pin its subject, do not let it take the raw diff:

   > Review against `docs/plans/<plan>.md` — the union of every task's `Files:`.
   > Drop test files and generated migrations from the subject.

   Without the pin it reviews whatever is in the diff, which by now includes
   `test-writer`'s output arriving concurrently, and its own 25-file rule fires
   on files nobody asked it to look at.

2. **`security-auditor`** — same subject, plus anything security-relevant the
   plan did not declare. Give it the plan's `## Contract & version impact` and
   every implementer `## Handoff`.

3. **`test-writer`** — give it the **spec** path, not just the module. Its cases
   come from the spec's `## Acceptance criteria` and their `Observed by:` lines,
   and the plan's `## Acceptance-criteria coverage` table says which `AC-n` each
   file is expected to prove.

## Reduce

Merge the two reviewers' findings. Severity is `CRITICAL | WARNING |
SUGGESTION` and nothing else — normalise any foreign scale on the way in
(`HIGH → WARNING`, `MEDIUM → SUGGESTION`). Deduplicate by `file:start_line`:
the same defect reported by both agents is one finding, kept at the higher
severity.

Present the merged list to the user with a recommendation per finding, and let
them decide what gets fixed. Zero findings is a valid and good answer from either
reviewer — do not send an agent back to find something.

## Fix

Fixes go through `implementer`, one message describing the finding, the file and
the direction — never by editing the file here, and never by asking a reviewer to
fix what it found. Record which files the fixes touched: `/sdd-close` needs them,
because they are legitimately outside the plan's `Files:` lists.

## Then

Report the merged findings by severity, what was fixed and what was accepted,
and the test files added with the `AC-n` each covers.

Next step: `/sdd-close <plan path>`.
