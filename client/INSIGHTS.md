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

## Codebase Patterns
<!-- Module-specific conventions, architecture decisions, naming patterns -->
- 2026-08-01: there are TWO `Severity` types and they differ — `@devdigest/ui` exports a 4-value one (adds `INFO`), `@devdigest/shared` exports the 3-value contract enum. ALWAYS build `Record<Severity, number>` counters off the SHARED one, or the object gains a phantom `INFO` key that no API ever sends; import `SEV` (colour/icon/label) from the UI one, which is a superset so indexing it with a shared severity is safe (evidence: client/src/vendor/ui/primitives/tokens.ts:3 vs client/src/vendor/shared/contracts/findings.ts Severity; usage client/src/lib/severity.ts:16)
- 2026-08-01: `SEV` in vendor/ui/primitives/tokens.ts is the ONLY severity→colour/icon map to use; two hand-rolled `SEV_COLOR` copies already exist and one has DRIFTED (`SUGGESTION: var(--accent)` instead of `var(--sugg)`), so copying the nearest one propagates the wrong colour (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/FindingsSection/FindingsSection.tsx:12; correct map client/src/vendor/ui/primitives/tokens.ts:6)

## Tool & Library Notes
<!-- Quirks, gotchas, and useful behaviors discovered about dependencies -->
- 2026-08-02: the shorthand trap nests — `borderColor`/`borderWidth`/`borderStyle` LOOK like longhands but are themselves shorthands for the four sides, so `borderColor` + `borderLeftColor` still warns (an in-repo comment claimed that pairing was the fix, and it was wrong). Rules of thumb that hold: keep every border declaration at ONE level — either all four side-shorthands (`borderTop/Right/Bottom/Left`, which never conflict with each other) or all per-side longhands (`borderTopColor`, `borderLeftWidth`, …); NEVER `border` or `borderColor` alongside a side. Scan for regressions by looking at innermost style objects only — a `styles.ts` barrel merges sibling entries and produces pure false positives (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:5 card(); client/src/vendor/ui/kit/Tabs.tsx:28)
- 2026-08-01: in a stateful `styles.ts` style function (`s.item(active)`), NEVER mix a CSS shorthand with one of its longhands when either value changes with state — React logs "Updating a style property during rerender … don't mix shorthand and non-shorthand" on every toggle. Concretely: `textDecoration` + `textDecorationStyle` → write one shorthand `"underline dotted"`; `font: "inherit"` + `fontWeight` → use `fontFamily: "inherit"`. Easy to miss because the app's whole styling convention is inline style objects (evidence: client/src/components/severity-counts/styles.ts:20 item(), fixed after 4 console errors on filter toggle)

## Recurring Errors & Fixes
<!-- Errors seen more than once and their confirmed fixes -->

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-08-01: added findings-by-severity counters + click-to-filter on the PR list and PR detail pages (shared SeverityCounts component, `?severity=` URL state, SeverityFilterBar); spec client/specs/2026-08-01-findings-by-severity.md.

## Open Questions
<!-- Unresolved things that need more investigation -->