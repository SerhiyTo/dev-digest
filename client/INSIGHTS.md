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
- 2026-08-03: `react-best-practices` was written for a Vite + Tailwind + Axios + react-router stack and several of its rules CONTRADICT this module — most damagingly "Use utility classes for all styling — no inline `style={}` objects", when client/ deliberately styles via inline objects in a colocated `styles.ts`. Its Axios-interceptor, Vite `manualChunks` and `resetKeys={[location.pathname]}` rules are likewise inapplicable here. ALWAYS follow the codebase over that skill; placement/decomposition questions now go to the `frontend-ui-architecture` skill instead, and its "Code Organization" section delegates there (evidence: .claude/skills/react-best-practices/SKILL.md Tailwind + Code Organization sections; client/src/components/severity-counts/styles.ts)
- 2026-08-03: new code here colocates first and is promoted only when a SECOND unrelated caller appears — measured default failure of a cold agent in this module is premature promotion, i.e. creating a fresh shared `src/lib/<thing>.ts` for a constant that one component uses, instead of that component's own `constants.ts`. The other measured failure is naming a hookless function `use*`; if it calls no hook it is a plain function (`getSorted`, not `useSorted`) (evidence: .claude/skills/frontend-ui-architecture-workspace/iteration-1/eval-2-constants-placement/without_skill/outputs/answer.md routes model ids straight to a new src/lib/models.ts; existing good shape client/src/app/agents/_components/AgentCard/constants.ts)
- 2026-08-02: the app scrolls a `<main>` element, NOT the window — `window.scrollY` / `document.documentElement.scrollTop` stay 0 no matter how far down you are, so they are useless for asserting or debugging scroll position; read `document.querySelector("main").scrollTop` instead. `el.scrollIntoView()` works fine (it walks scrollable ancestors); it was the *diagnostics* that lied and sent two debugging passes down the wrong path (evidence: client/src/components/app-shell/; verified in-page — main.scrollTop 1461 while window.scrollY 0)
- 2026-08-02: a one-shot `scrollIntoView` after a route change is unreliable here — `behavior: "smooth"` gets dropped when the target's accordion is still expanding, and Next's scroll-to-top competes. ALWAYS pass `{ scroll: false }` to `router.push` for deep links AND retry an instant scroll until `getBoundingClientRect()` proves the element is in view, aborting on wheel/touch/keydown so it never fights the user (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx target-scroll effect; tests "keeps retrying while the target is still out of view")
- 2026-08-02: a hover card that is itself scrollable must NOT close on a bare capture-phase `scroll` listener — that fires for the card's own scroll and makes anything below the fold unreachable. Gate on `cardRef.current?.contains(e.target)` (evidence: client/src/app/repos/[repoId]/pulls/_components/FindingsHoverCard/FindingsHoverCard.tsx; test "stays open while scrolling inside the card")
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
- 2026-08-03: researched ~60 sources and created the `frontend-ui-architecture` skill (code placement + decomposition), splitting that concern out of react-best-practices; benchmarked 100% vs 90% pass rate against a no-skill baseline on 3 eval prompts.
- 2026-08-01: added findings-by-severity counters + click-to-filter on the PR list and PR detail pages (shared SeverityCounts component, `?severity=` URL state, SeverityFilterBar); spec client/specs/2026-08-01-findings-by-severity.md.

## Open Questions
<!-- Unresolved things that need more investigation -->