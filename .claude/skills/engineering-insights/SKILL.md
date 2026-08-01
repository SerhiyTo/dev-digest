---
name: engineering-insights
description: Reads and appends per-module INSIGHTS.md engineering learnings in dev-digest. Use when starting a task in client/, server/, reviewer-core/, or e2e/; when discovering something non-obvious mid-task (failed approach, library or tool quirk, workaround, architectural decision, recurring error and its fix, a user correction); and when wrapping up any session that involved a problem, decision, or discovery.
---

# Engineering Insights

Each module owns an append-only `INSIGHTS.md` — notes a previous session left
for the next one to read cold. Knowledge lives next to the code it describes;
no external memory needed. This skill covers both directions: recall at session
start, capture at discovery time and at wrap-up.

## Hard invariant: never destroy existing content

INSIGHTS.md is append-only. Add new bullets at the top of a section, below the
section's comment line. NEVER rewrite the whole file, NEVER edit, reorder, or
delete existing entries or section headings. A wrong or outdated entry is fixed
by appending a new dated correction bullet next to it, e.g.
`- 2026-08-02: correction — the 30-item limit above was removed in <commit>`.
If an Edit fails to anchor, re-read the file and retry with a smaller anchor —
do not fall back to rewriting the file.

## Where to write

| Task touched            | File                        |
|-------------------------|-----------------------------|
| `client/`               | `client/INSIGHTS.md`        |
| `server/`               | `server/INSIGHTS.md`        |
| `reviewer-core/`        | `reviewer-core/INSIGHTS.md` |
| `e2e/`                  | `e2e/INSIGHTS.md`           |

Multi-module task: each module gets only its own entries — no copy-paste
duplication. Cross-cutting insight: the module where the evidence lives.

## Session start

Before the first change in a module, read its INSIGHTS.md and apply entries as
high-confidence guidance unless the user says otherwise.

## Capture — at wrap-up, or the moment a discovery is confirmed

1. **Gate the session.** Nothing beyond routine edits — no problem, decision,
   correction, or discovery? Stop. Write nothing. Silence is the correct
   output; a filler entry is worse than none.
2. **Collect candidates** (max ~5, in priority order): user corrections of your
   approach; approaches that failed or were abandoned, and why; conventions or
   architectural decisions established; library/tool quirks discovered;
   recurring errors and their confirmed fixes; questions left unresolved.
3. **Apply the quality gate** to each candidate — all three must hold:
   - Would the next session plausibly get this wrong without it?
   - Is it invisible from just reading the code and existing docs (CLAUDE.md,
     README, specs)?
   - Will it still be true next month?
4. **Read the target INSIGHTS.md and dedup.** Already covered → skip. Covered
   but now wrong → append a dated correction bullet (step 1 of the invariant).
5. **Append survivors** to the matching section, newest first:
   `- YYYY-MM-DD: <insight> (evidence: path/file.ts:line)`.
   Section mapping: proven approach → What Works; dead end → What Doesn't Work;
   convention/decision → Codebase Patterns; dependency quirk → Tool & Library
   Notes; repeated error + fix → Recurring Errors & Fixes; unresolved → Open
   Questions. Add ONE dated line to Session Notes only if you appended entries.
6. **Report.** In your final message list verbatim what was appended and where,
   or state that nothing substantive was found. The user spot-checks entries —
   they are a draft under review, not ground truth.

## Writing entries

Lead with why; prefer NEVER/ALWAYS phrasing for rules; include the concrete
command, path, or value. Evidence must be something you verified this session —
a real `path:line`; never attribute to a commit hash or issue you didn't check.

Bad (noise): `- 2026-07-29: be careful with the vendored shared package`
Good: `- 2026-07-29: NEVER edit client/src/vendor/shared directly — it is a
mirror; change server/src/vendor/shared (canonical) and re-copy, otherwise the
Zod contracts drift (evidence: client/CLAUDE.md vendor rule; server/src/vendor/shared/)`

## Red flags — if you think this, stop

| Thought                              | Reality                                          |
|--------------------------------------|--------------------------------------------------|
| "I'll capture it next session"       | Context dies with the session. Capture now.      |
| "I should write *something*"         | Banal entries bury real ones. Gate says skip.    |
| "Something like this is already there" | Read it. Truly covers it → skip; differs → dated correction. |
| "The workaround belongs here"        | If the root cause is fixable, fix it — don't document a crutch. |
| "I'll just rewrite the file cleanly" | NEVER. Append-only. See the hard invariant.      |

## Maintenance

If a section exceeds ~30 entries, tell the user it needs a human-reviewed
prune — do not prune it yourself.