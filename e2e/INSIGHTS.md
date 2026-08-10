# Insights

Accumulated non-obvious lessons from working in this module. Read this before
starting work here and treat entries as high-confidence guidance. Append-only:
add bullets at the top of the matching section (newest first); never rewrite,
reorder, or delete existing content — correct a wrong entry with a new dated
note. Entry format: `- YYYY-MM-DD: <insight> (evidence: path/file.ts:line)`.

## What Works
<!-- Approaches, patterns, and solutions that have proven effective here -->

## What Doesn't Work
<!-- Failed approaches, dead ends, antipatterns to avoid -->
- 2026-08-05: `find text "<label>" click` is NOT a reliable way to click a button — the text locator resolves to a wide ancestor whose click point can land under the sidebar, failing with "Element … is covered by `<aside>` at its click point". It fails even when the label is unique and visible. ALWAYS use `find role button click --name "<label>"` for buttons; keep `find text` for non-interactive assertions and for sidebar/nav text, which sits inside the aside and so is never covered (evidence: e2e/specs/08-conventions.flow.json Accept/Create skill/Cancel steps; reproduced with `agent-browser find text Accept click` against the conventions page)
- 2026-08-05: flows share ONE browser session and run in order, so a failure cascades into later flows and the failing SET moves between runs — three consecutive runs of the same suite failed 02, then 04+05, then 04 alone. NEVER conclude a flow is broken from a single run; re-run before diagnosing, and read a failure in flow N as possibly caused by flow N-1 leaving the session somewhere unexpected (evidence: three `./scripts/e2e.sh` runs over the unchanged specs 01-07)

## Codebase Patterns
<!-- Module-specific conventions, architecture decisions, naming patterns -->

## Tool & Library Notes
<!-- Quirks, gotchas, and useful behaviors discovered about dependencies -->

## Recurring Errors & Fixes
<!-- Errors seen more than once and their confirmed fixes -->

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-08-05: added `08-conventions.flow.json` (nav → triage a seeded candidate → open the create-skill modal) and switched its button steps from `find text` to `find role button --name` after the text locator proved unusable for buttons.

## Open Questions
<!-- Unresolved things that need more investigation -->