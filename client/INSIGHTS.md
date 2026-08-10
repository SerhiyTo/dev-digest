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
- 2026-08-05: `element.click()` does NOT flush React state — it is a raw DOM click outside `act()`, so a handler that calls `setState` leaves the DOM unchanged and the next query fails with "Unable to find …". The existing tests here use `.click()` and pass only because they assert on a mock being called, never on a state transition, so copying the nearest test teaches the wrong pattern. ALWAYS use `fireEvent.click` (RTL wraps it in `act`) for anything that toggles component state — edit modes, expanders, tab switches (evidence: ConventionCard edit-mode tests failed on `.click()` and passed unchanged with `fireEvent.click` — client/src/app/repos/[repoId]/conventions/_components/ConventionsView/_components/ConventionCard/ConventionCard.test.tsx; prior-art pattern client/src/app/skills/[id]/_components/SkillEditor/_components/VersionsTab/VersionsTab.test.tsx)
- 2026-08-05: `./scripts/e2e.sh` POISONS a running dev server's bundle. It starts its own `next dev -p 3100` from the same `client/` directory, so both servers share `client/.next`; the e2e process recompiles with `NEXT_PUBLIC_API_BASE=http://localhost:3101` inlined, and your :3000 server then serves those chunks — the app silently calls the (now torn-down) e2e API and every page shows a permanent skeleton or "Could not load…" while `curl localhost:3001` answers fine. Symptom-to-cause shortcut: `agent-browser network requests --filter 3001` returning nothing while requests to `:3101` appear. Fix = stop the dev server, `rm -rf .next`, restart. ALWAYS stop your dev server before running the e2e script (evidence: scripts/e2e.sh exports NEXT_PUBLIC_API_BASE + runs next dev from client/; client/src/lib/api.ts:5 reads it at compile time)
- 2026-08-05: correction to the entry below — its "check `lsof -ti:3000` before building" advice is right, but a `pgrep -fl "next dev"` check gives a FALSE all-clear: the long-running process renames itself to `next-server (v15.5.19)` once booted, so only the port check finds it. Building against a live dev tree cost a debugging pass here (evidence: `lsof -ti:3000` → PID running `next-server`, while `pgrep -fl "next dev"` returned nothing)
- 2026-08-04: NEVER run `pnpm build` while a `pnpm dev` server is running — they share `client/.next` and emit incompatible artifacts. `next dev` creates `.next/server/vendor-chunks/<pkg>.js` per package; `next build` emits no `vendor-chunks/` directory at all, so a build over a live dev tree leaves `webpack-runtime.js` requiring a chunk that no longer exists → `Cannot find module './vendor-chunks/recharts.js'` on any route importing that package (recharts arrives via the `@devdigest/ui` charts barrel). Equally, do NOT `rm -rf .next` under a running dev server: Next cannot recover and every route 500s until it is restarted. Check `lsof -ti:3000` before doing either (evidence: client/src/vendor/ui/charts/Donut.tsx:3 imports recharts; clean `next build` produced no vendor-chunks/ dir)
- 2026-08-04: `pnpm typecheck` + `pnpm test` BOTH GREEN does not mean the app builds. Type-only imports are erased before bundling, so a file that only ever did `import type { X } from "@devdigest/shared"` never makes the bundler resolve that package at all; the first `import { X }` (a runtime value — e.g. a Zod enum for `SkillType.options`) is what drags the vendored barrel into the graph and can fail there alone. ALWAYS run `pnpm build` as a separate verification step when a change adds a VALUE import from `@devdigest/shared` (evidence: three files added `import { SkillType }` — client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal/constants.ts:1 and two siblings — with typecheck and 163 tests green while `pnpm build` failed on `./contracts/brief.js`, `knowledge.js`, `trace.js`)

## Codebase Patterns
<!-- Module-specific conventions, architecture decisions, naming patterns -->
- 2026-08-10: when a feature has a primary action, put it on the affordance that
  is visible in the COLLAPSED state. Smart Diff's severity pill lives on a diff
  line, so it only exists once a card is expanded — the file-header badge is the
  only severity control on a collapsed or null-patch file. Splitting "expand
  here" onto the badge and "go to the finding" onto the pill hid the feature's
  central action and the work came back from review for it (evidence:
  client/src/components/diff-viewer/FileCard/FileCard.tsx `onFindingsClick`;
  client/specs/2026-08-10-smart-diff.md "Both the badge and the pill navigate")
- 2026-08-10: a `useState(propA ?? heuristic)` initializer reads the prop ONLY at
  mount, so when the prop is derived from a second, independently-resolving query
  the component silently keeps the heuristic forever. Two TanStack queries on one
  page WILL race in both orders — pair every such initializer with a
  one-directional `useEffect(() => { if (prop) setOpen(true) }, [prop])` rather
  than assuming the data is there on first render (evidence:
  src/components/diff-viewer/FileCard/FileCard.tsx `defaultOpen`)
- 2026-08-10: a `getByText("1 findings")`-style assertion locks a missing ICU
  plural into the suite. next-intl supports `{count, plural, one {#…} other {#…}}`
  and this repo already had the singular bug in two new keys — write the plural
  form when you add the key, not after a reviewer reads "1 findings" in the UI
  (evidence: client/messages/en/shell.json `diffViewer.findingsBadge`)
- 2026-08-10: `severityRank` (`src/lib/severity.ts:37`) is an INDEX into
  `SEVERITIES`, so **lower is worse** (`CRITICAL` → 0). Worst-severity-wins
  comparisons use `<`, not `>` — the inverted version silently shows the mildest
  severity on a line with several findings (evidence: src/lib/severity.ts:37-40;
  src/components/diff-viewer/FileCard/FileCard.tsx)
- 2026-08-10: `lineRowFor` (`src/components/diff-viewer/styles.ts`) is the only
  styling seam that reaches every rendered diff row — it set no border property
  at all, which is what made an optional `accent` parameter safe. Emit the
  `borderLeft` ALWAYS (transparent when absent), never conditionally: a
  conditional shorthand both trips the mixed-shorthand rule and shifts every row
  3px whenever an overlay appears (evidence:
  src/components/diff-viewer/styles.ts:79-92)
- 2026-08-10: widening a shared component for one new caller = optional props
  plus `??` (not `||`) on the initializer, so `undefined` reproduces the old
  behaviour exactly and the existing caller file is not edited at all. `FileCard`
  gained four optional props with `DiffViewer.tsx` untouched (evidence:
  src/components/diff-viewer/FileCard/FileCard.tsx;
  src/components/diff-viewer/DiffViewer/DiffViewer.tsx:28)
- 2026-08-03: `react-best-practices` was written for a Vite + Tailwind + Axios + react-router stack and several of its rules CONTRADICT this module — most damagingly "Use utility classes for all styling — no inline `style={}` objects", when client/ deliberately styles via inline objects in a colocated `styles.ts`. Its Axios-interceptor, Vite `manualChunks` and `resetKeys={[location.pathname]}` rules are likewise inapplicable here. ALWAYS follow the codebase over that skill; placement/decomposition questions now go to the `frontend-ui-architecture` skill instead, and its "Code Organization" section delegates there (evidence: .claude/skills/react-best-practices/SKILL.md Tailwind + Code Organization sections; client/src/components/severity-counts/styles.ts)
- 2026-08-03: new code here colocates first and is promoted only when a SECOND unrelated caller appears — measured default failure of a cold agent in this module is premature promotion, i.e. creating a fresh shared `src/lib/<thing>.ts` for a constant that one component uses, instead of that component's own `constants.ts`. The other measured failure is naming a hookless function `use*`; if it calls no hook it is a plain function (`getSorted`, not `useSorted`) (evidence: .claude/skills/frontend-ui-architecture-workspace/iteration-1/eval-2-constants-placement/without_skill/outputs/answer.md routes model ids straight to a new src/lib/models.ts; existing good shape client/src/app/agents/_components/AgentCard/constants.ts)
- 2026-08-02: the app scrolls a `<main>` element, NOT the window — `window.scrollY` / `document.documentElement.scrollTop` stay 0 no matter how far down you are, so they are useless for asserting or debugging scroll position; read `document.querySelector("main").scrollTop` instead. `el.scrollIntoView()` works fine (it walks scrollable ancestors); it was the *diagnostics* that lied and sent two debugging passes down the wrong path (evidence: client/src/components/app-shell/; verified in-page — main.scrollTop 1461 while window.scrollY 0)
- 2026-08-02: a one-shot `scrollIntoView` after a route change is unreliable here — `behavior: "smooth"` gets dropped when the target's accordion is still expanding, and Next's scroll-to-top competes. ALWAYS pass `{ scroll: false }` to `router.push` for deep links AND retry an instant scroll until `getBoundingClientRect()` proves the element is in view, aborting on wheel/touch/keydown so it never fights the user (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx target-scroll effect; tests "keeps retrying while the target is still out of view")
- 2026-08-02: a hover card that is itself scrollable must NOT close on a bare capture-phase `scroll` listener — that fires for the card's own scroll and makes anything below the fold unreachable. Gate on `cardRef.current?.contains(e.target)` (evidence: client/src/app/repos/[repoId]/pulls/_components/FindingsHoverCard/FindingsHoverCard.tsx; test "stays open while scrolling inside the card")
- 2026-08-01: there are TWO `Severity` types and they differ — `@devdigest/ui` exports a 4-value one (adds `INFO`), `@devdigest/shared` exports the 3-value contract enum. ALWAYS build `Record<Severity, number>` counters off the SHARED one, or the object gains a phantom `INFO` key that no API ever sends; import `SEV` (colour/icon/label) from the UI one, which is a superset so indexing it with a shared severity is safe (evidence: client/src/vendor/ui/primitives/tokens.ts:3 vs client/src/vendor/shared/contracts/findings.ts Severity; usage client/src/lib/severity.ts:16)
- 2026-08-01: `SEV` in vendor/ui/primitives/tokens.ts is the ONLY severity→colour/icon map to use; two hand-rolled `SEV_COLOR` copies already exist and one has DRIFTED (`SUGGESTION: var(--accent)` instead of `var(--sugg)`), so copying the nearest one propagates the wrong colour (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/FindingsSection/FindingsSection.tsx:12; correct map client/src/vendor/ui/primitives/tokens.ts:6)

## Tool & Library Notes
<!-- Quirks, gotchas, and useful behaviors discovered about dependencies -->
- 2026-08-10: `SeverityBadge`'s `compact` prop renders the icon WITHOUT its
  label, so colour + glyph become the only signal — it contradicts the
  component's own "never color alone (WCAG AA)" comment. Use the full variant
  wherever the badge is the sole carrier of severity (evidence:
  src/vendor/ui/primitives/Badge.tsx:50-80)
- 2026-08-10: `SectionLabel` accepts only `children`, `icon` and `right` — no
  `title` prop, so a tooltip needs a plain wrapping element (evidence:
  src/vendor/ui/primitives/SectionLabel.tsx; tsc error TS2322 on `title`)
- 2026-08-09: `IconName` is a CLOSED set hand-curated in `src/vendor/ui/icons.tsx`, not the whole lucide catalogue — plausible names fail. `Radar` and `Crosshair` are absent while `Target`, `Workflow` and `Boxes` are present, and because `icon` props are typed the miss surfaces as a typecheck error rather than a missing glyph. Grep the icon module for the name BEFORE writing the component, not after (evidence: `grep -oE "\b(Target|Radar|Crosshair)\b" client/src/vendor/ui/icons.tsx` returns only Target; client/.../OverviewTab/_components/BlastRadiusCard uses Workflow)
- 2026-08-05: RTL's `getByDisplayValue` runs the value through the default TextMatch normaliser (trim + collapse runs of whitespace), so a MULTI-LINE textarea can never be matched against its raw value — `getByDisplayValue("# Title\n\nBody\n")` always fails even though `.value` is exactly that. Address multi-line editors by `getByPlaceholderText(...)` (or a role query) and assert on `.value` directly; `getByDisplayValue` stays fine for single-line inputs (evidence: client/src/app/repos/[repoId]/conventions/_components/ConventionsView/_components/CreateSkillFromConventionsModal/CreateSkillFromConventionsModal.test.tsx bodyEditor())
- 2026-08-04: `client/next.config.mjs` carries `webpack: (config) => { config.resolve.extensionAlias = { ".js": [".ts",".tsx",".js"] } }` and it is load-bearing — do not delete it as dead config. `src/vendor/shared/index.ts` is a byte-identical mirror of the server's NodeNext copy, so it writes `export * from './contracts/findings.js'` for a file that is actually `findings.ts`. tsc (`moduleResolution: "Bundler"`) and vitest both resolve `.js`→`.ts`; Next's webpack does NOT, and fails with `Module not found: Can't resolve './contracts/findings.js'`. The alias is the right fix rather than editing the barrel, because the mirror must not diverge from the canonical server copy (evidence: client/next.config.mjs webpack hook; client/src/vendor/shared/index.ts:17; client/tsconfig.json moduleResolution)
- 2026-08-02: the shorthand trap nests — `borderColor`/`borderWidth`/`borderStyle` LOOK like longhands but are themselves shorthands for the four sides, so `borderColor` + `borderLeftColor` still warns (an in-repo comment claimed that pairing was the fix, and it was wrong). Rules of thumb that hold: keep every border declaration at ONE level — either all four side-shorthands (`borderTop/Right/Bottom/Left`, which never conflict with each other) or all per-side longhands (`borderTopColor`, `borderLeftWidth`, …); NEVER `border` or `borderColor` alongside a side. Scan for regressions by looking at innermost style objects only — a `styles.ts` barrel merges sibling entries and produces pure false positives (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:5 card(); client/src/vendor/ui/kit/Tabs.tsx:28)
- 2026-08-01: in a stateful `styles.ts` style function (`s.item(active)`), NEVER mix a CSS shorthand with one of its longhands when either value changes with state — React logs "Updating a style property during rerender … don't mix shorthand and non-shorthand" on every toggle. Concretely: `textDecoration` + `textDecorationStyle` → write one shorthand `"underline dotted"`; `font: "inherit"` + `fontWeight` → use `fontFamily: "inherit"`. Easy to miss because the app's whole styling convention is inline style objects (evidence: client/src/components/severity-counts/styles.ts:20 item(), fixed after 4 console errors on filter toggle)

## Recurring Errors & Fixes
<!-- Errors seen more than once and their confirmed fixes -->

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-08-10: L03 Smart Diff — role-grouped reviewer-ordered diff in the Files changed tab behind a `?diffOrder=` toggle, per-file findings badges and per-line severity pills joined client-side from `usePrReviews`, boilerplate collapsed, retry-scroll to a target line; widened the shared diff-viewer with four optional props leaving `DiffViewer` untouched; 12 RTL cases; spec client/specs/2026-08-10-smart-diff.md.
- 2026-08-09: L03 Intent Layer — INTENT card on the PR Overview tab (statement, in/out of scope, risk chips, evidence-derived confidence, stale badge, compute/recompute), a BLAST RADIUS placeholder card, and `lib/hooks/intent.ts` treating a 404 as the empty state; spec client/specs/2026-08-09-intent-layer.md.
- 2026-08-05: L02 conventions extractor — `/repos/:repoId/conventions` page (evidence-backed candidate cards, accept/reject/inline edit, scope-prefix re-scan, create-skill modal with update-to-vN mode), promoted the ConfigTab body editor to `src/components/markdown-editor` behind a `labels` prop and `relativeTime` to `src/lib/time.ts`; spec client/specs/2026-08-05-conventions.md.
- 2026-08-04: L02 skills — `/skills` list + 5-tab editor (Config/Preview/Evals/Stats/Versions), file+zip import drawer with preview-before-network, and the agent editor's Skills tab (link + native HTML5 reorder); spec client/specs/2026-08-04-skills.md.
- 2026-08-03: researched ~60 sources and created the `frontend-ui-architecture` skill (code placement + decomposition), splitting that concern out of react-best-practices; benchmarked 100% vs 90% pass rate against a no-skill baseline on 3 eval prompts.
- 2026-08-01: added findings-by-severity counters + click-to-filter on the PR list and PR detail pages (shared SeverityCounts component, `?severity=` URL state, SeverityFilterBar); spec client/specs/2026-08-01-findings-by-severity.md.

## Open Questions
<!-- Unresolved things that need more investigation -->