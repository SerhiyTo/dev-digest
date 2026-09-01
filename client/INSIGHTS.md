# Insights

Accumulated non-obvious lessons from working in this module. Read this before
starting work here and treat entries as high-confidence guidance. Append-only:
add bullets at the top of the matching section (newest first); never rewrite,
reorder, or delete existing content — correct a wrong entry with a new dated
note. Entry format: `- YYYY-MM-DD: <insight> (evidence: path/file.ts:line)`.

## What Works
<!-- Approaches, patterns, and solutions that have proven effective here -->

- 2026-08-31: a card that is ENTIRELY wrapped in one `<Link>` cannot grow a
  second link inside it (nested anchors are invalid HTML) and its accessible
  name is the concatenation of every string it renders — `EvalAgentCard`'s
  wrapper link was named "Security Reviewer 75% 90% 50% v3 Ran at 5m 6/8
  passed". Moving the anchor onto the agent NAME (card becomes a plain `<div>`)
  both frees the card to hold a create-affordance link and narrows the
  accessible name to exactly the agent name, which is what
  `e2e/specs/11-evals.flow.json` selects on. `agent-browser`'s `--name` is a
  case-insensitive SUBSTRING match, so the flow kept working across that change
  — but assert the link's name AND its href in the colocated test, because
  nothing else connects the component to the flow (evidence:
  client/src/app/evals/_components/EvalAgentCard/EvalAgentCard.tsx:83-87;
  client/src/app/evals/page.tsx:78-89; e2e/INSIGHTS.md 2026-08-23 substring entry)

## What Doesn't Work
<!-- Failed approaches, dead ends, antipatterns to avoid -->
- 2026-09-01: an absence-only assertion cannot tell "correctly absent" from
  "rendered nothing at all". Four tests written this session passed while the
  code they covered was DELETED — proved by mutation: removing EvalCaseList's
  whole empty-state block, dropping `onClick={onRun}`, making `EvalsTab` return
  `null`, and forcing `EvalRecentRunsTable` into its empty branch each left the
  relevant test green. ALWAYS pair `queryByX(...).not.toBeInTheDocument()` with a
  positive anchor proving the component rendered, and when a test's title claims
  it wires N callbacks, click all N — a control left disabled by the fixture is
  never exercised (evidence:
  client/src/app/agents/[id]/_components/EvalsTab/_components/EvalCaseList/EvalCaseList.test.tsx;
  client/src/app/evals/_components/EvalRecentRunsTable/EvalRecentRunsTable.test.tsx)
- 2026-09-01: `<ProgressBar value={metric ?? 0} />` is the SAME "not computed"
  bug the text renderers already guard against, and it is worse because it is
  invisible to the usual test. A 0-width bar still paints its full-width grey
  TRACK, so a cancelled run whose metrics are null showed three empty bars
  reading as 0% — while `expect(textContent).not.toMatch(/%/)` passed, because
  the defect is the track, not a number. Render no bar at all when the metric is
  null, and assert the bar's ABSENCE (`data-metric-bar`), not just the absence
  of a percentage (evidence:
  client/src/app/evals/[agentId]/_components/EvalRunTable/EvalRunTable.tsx:159;
  client/src/app/evals/[agentId]/_components/EvalRunTable/EvalRunTable.test.tsx
  "draws no metric bar at all")
- 2026-08-30: a leaf component that gates a required affordance on an OPTIONAL callback prop passes its own colocated test while the integrated page silently drops the affordance — `EvalCaseButton` renders its "Open eval case" control only `{onOpen && …}`, and `FindingsPanel` never passes `onOpen`, so the finding-card confirmation offers no way to open the created case anywhere in the running app. When an acceptance criterion demands an affordance, assert it on the component that owns the mutation as well as on the leaf (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/EvalCaseButton/EvalCaseButton.tsx:44-50; client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:113-126)
- 2026-08-30: wiring a NEW `lib/hooks/*` mutation into an EXISTING component that
  already has a passing test breaks that test if the test doesn't already mock
  hooks — `useMutation` (and thus any `lib/hooks/evals.ts` hook built on it)
  calls `useQueryClient()` internally, which throws synchronously on render
  ("No QueryClient set, use QueryClientProvider to set one") the instant the
  component mounts, before the mutation is ever invoked; there is no way to
  guard this with a conditional call (Rules of Hooks) or a try/catch around the
  hook call that doesn't itself count as papering over the crash. T27 of
  `docs/plans/2026-08-30-eval-pipeline.md` added `useCreateEvalCaseFromFinding()`
  to `FindingsPanel.tsx` exactly per the plan's `Do`, and it broke 9 tests in
  `FindingsPanel.test.tsx` plus 2 in the entirely unrelated
  `ReviewRunAccordion.test.tsx` (which renders `FindingsPanel` internally) —
  both mock `lib/hooks/reviews` already (the established per-component pattern:
  `vi.mock(".../lib/hooks/reviews", () => ({ useFindingAction: () => ({...}) }))`)
  but neither mocks `lib/hooks/evals`, so the real hook body ran unmocked. A
  task whose `Files:` list is only the `.tsx` component(s), not their `.test.tsx`
  siblings, cannot fix this without going outside its own file list — check
  BEFORE adding a hook call whether every existing consumer test already mocks
  that hook's module, not just whether the target component's own test does
  (evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx`
  no `vi.mock` for `lib/hooks/evals`; same gap in
  `.../ReviewRunAccordion/ReviewRunAccordion.test.tsx`; error reproduced at
  `src/lib/hooks/evals.ts:181` `useCreateEvalCaseFromFinding`'s `useQueryClient()`).
- 2026-08-24: composing an existing feature card INTO a new section component
  (`IntentCard`/`BlastRadiusCard` moved inside `BriefPanel` for the PR Brief
  feature) requires deleting the old top-level mount in the same commit, or the
  card renders twice — once from its old call site, once from the new section.
  `OverviewTab.tsx` now mounts only `BriefPanel`, which itself renders
  `IntentCard` and `BlastRadiusCard` in its card grid; check the section's own
  render output for the moved components before assuming the old page-level
  mount is still needed (evidence:
  client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx
  — only `<BriefPanel .../>`; BriefPanel.tsx:190-191 — `<IntentCard .../>` and
  `<BlastRadiusCard .../>` inside `s.cardGrid`)
- 2026-08-24: a pure domain helper that formats a user-facing STRING (not just
  a value) is the wrong place for that string once i18n needs to own the
  wording — `lib/brief.ts`'s `costLine()` returns a hardcoded English
  `"12,345 in / 678 out · $0.02"`, but `BriefPanel` never calls it; it calls
  `t("cost.line", {...})`/`t("cost.lineNoCost", {...})` directly from the
  `brief` namespace instead, because AC-77 required every brief string to come
  through next-intl. The helper still exists (and is still tested) but is dead
  in production — a pure `lib/*.ts` module should return the DATA a formatted
  string needs (tokens, cost) and let the component interpolate it via `t()`,
  not pre-assemble the sentence itself (evidence: client/src/lib/brief.ts:41-48
  `costLine`; client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/BriefPanel.tsx:86-87
  calling `t("cost.line", ...)` directly; `grep -rn "costLine" src/` outside
  `brief.test.ts` returns only the definition)
- 2026-08-23: NEVER debounce an ARRAY through the usual
  `useState(value)` + `useEffect(() => setTimeout(() => setSettled(value)), [value])`
  hook. The array is rebuilt on every render, so its identity changes, the
  effect re-arms every render, and `setSettled` with a fresh identity re-renders
  — the loop is structural, not a timing accident, and no dependency list fixes
  it. Debounce a PRIMITIVE key instead (`paths.join("\n")`) and split it back on
  the way out; TanStack hashes query keys structurally, so the array identity was
  never what the query needed anyway (evidence:
  client/src/components/doc-attach/DocAttachPanel.tsx `useDebouncedPaths`)
- 2026-08-05: `element.click()` does NOT flush React state — it is a raw DOM click outside `act()`, so a handler that calls `setState` leaves the DOM unchanged and the next query fails with "Unable to find …". The existing tests here use `.click()` and pass only because they assert on a mock being called, never on a state transition, so copying the nearest test teaches the wrong pattern. ALWAYS use `fireEvent.click` (RTL wraps it in `act`) for anything that toggles component state — edit modes, expanders, tab switches (evidence: ConventionCard edit-mode tests failed on `.click()` and passed unchanged with `fireEvent.click` — client/src/app/repos/[repoId]/conventions/_components/ConventionsView/_components/ConventionCard/ConventionCard.test.tsx; prior-art pattern client/src/app/skills/[id]/_components/SkillEditor/_components/VersionsTab/VersionsTab.test.tsx)
- 2026-08-05: `./scripts/e2e.sh` POISONS a running dev server's bundle. It starts its own `next dev -p 3100` from the same `client/` directory, so both servers share `client/.next`; the e2e process recompiles with `NEXT_PUBLIC_API_BASE=http://localhost:3101` inlined, and your :3000 server then serves those chunks — the app silently calls the (now torn-down) e2e API and every page shows a permanent skeleton or "Could not load…" while `curl localhost:3001` answers fine. Symptom-to-cause shortcut: `agent-browser network requests --filter 3001` returning nothing while requests to `:3101` appear. Fix = stop the dev server, `rm -rf .next`, restart. ALWAYS stop your dev server before running the e2e script (evidence: scripts/e2e.sh exports NEXT_PUBLIC_API_BASE + runs next dev from client/; client/src/lib/api.ts:5 reads it at compile time)
- 2026-08-05: correction to the entry below — its "check `lsof -ti:3000` before building" advice is right, but a `pgrep -fl "next dev"` check gives a FALSE all-clear: the long-running process renames itself to `next-server (v15.5.19)` once booted, so only the port check finds it. Building against a live dev tree cost a debugging pass here (evidence: `lsof -ti:3000` → PID running `next-server`, while `pgrep -fl "next dev"` returned nothing)
- 2026-08-04: NEVER run `pnpm build` while a `pnpm dev` server is running — they share `client/.next` and emit incompatible artifacts. `next dev` creates `.next/server/vendor-chunks/<pkg>.js` per package; `next build` emits no `vendor-chunks/` directory at all, so a build over a live dev tree leaves `webpack-runtime.js` requiring a chunk that no longer exists → `Cannot find module './vendor-chunks/recharts.js'` on any route importing that package (recharts arrives via the `@devdigest/ui` charts barrel). Equally, do NOT `rm -rf .next` under a running dev server: Next cannot recover and every route 500s until it is restarted. Check `lsof -ti:3000` before doing either (evidence: client/src/vendor/ui/charts/Donut.tsx:3 imports recharts; clean `next build` produced no vendor-chunks/ dir)
- 2026-08-04: `pnpm typecheck` + `pnpm test` BOTH GREEN does not mean the app builds. Type-only imports are erased before bundling, so a file that only ever did `import type { X } from "@devdigest/shared"` never makes the bundler resolve that package at all; the first `import { X }` (a runtime value — e.g. a Zod enum for `SkillType.options`) is what drags the vendored barrel into the graph and can fail there alone. ALWAYS run `pnpm build` as a separate verification step when a change adds a VALUE import from `@devdigest/shared` (evidence: three files added `import { SkillType }` — client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal/constants.ts:1 and two siblings — with typecheck and 163 tests green while `pnpm build` failed on `./contracts/brief.js`, `knowledge.js`, `trace.js`)

## Codebase Patterns
<!-- Module-specific conventions, architecture decisions, naming patterns -->
- 2026-09-01: a pure `lib/*.ts` module must return the DATA a label needs, never
  the rendered label — it has no `t`, so any English it returns escapes next-intl
  entirely. `formatDeltaLabel` returned `"+4 pts"` and reached the screen through
  `MetricCard.deltaLabel`; it is now `deltaLabelDescriptor`, returning
  `{ key, amount }` that the component feeds to
  `eval.metricStrip.{deltaUp,deltaDown,deltaFlat}`. Same shape as the `lib/brief.ts`
  `costLine` entry below (evidence: client/src/lib/evals.ts `deltaLabelDescriptor`;
  client/messages/en/eval.json `metricStrip.delta*`)
- 2026-09-01: `MetricCard` picks its arrow and colour from the SIGN of `delta`
  while printing `deltaLabel`, so passing the unrounded fraction as `delta` and a
  rounded label put a green up-arrow beside the text `±0 pts` on any
  sub-half-point move. Feed both from the same rounded number
  (`metricDeltaPoints`) (evidence:
  client/src/app/evals/[agentId]/_components/EvalMetricCards/EvalMetricCards.tsx;
  client/src/vendor/ui/charts/MetricCard.tsx)
- 2026-09-01: on `/evals` the e2e selector is a **substring** match
  (`find role link --name "Security Reviewer"`), so a page may hold at most ONE
  link whose accessible name contains an agent name. That constraint drove three
  decisions on the redesigned dashboard: the agent row's chevron is `aria-hidden`
  rather than a second link, the row is not wrapped in a `<Link>`, and the
  cross-agent run table links its **version** cell (`v7`) while leaving the agent
  name as plain text. `EvalRecentRunsTable.test.tsx` asserts the ABSENCE of an
  agent-named link — the presence assertions would all still pass if a second one
  appeared (evidence:
  client/src/app/evals/_components/EvalRecentRunsTable/EvalRecentRunsTable.test.tsx;
  client/src/app/evals/_components/EvalAgentRow/EvalAgentRow.test.tsx asserts
  `getAllByRole("link")` has length 1)
- 2026-09-01: there is NO endpoint returning eval runs across agents, and
  `EvalDashboard.trend` carries neither `agent_version` nor the passed/total
  tally, so a cross-agent run table cannot be built from `GET /evals` alone.
  `useEvalSuiteRunsForAgents` fans out with TanStack `useQueries` under the SAME
  `evalSuiteRunsKey(agentId)` that `useEvalSuiteRuns` uses, so navigating into an
  agent's own dashboard afterwards is a cache hit, not a refetch. Reuse that key
  for any future fan-out rather than inventing a list key (evidence:
  client/src/lib/hooks/evals.ts `useEvalSuiteRunsForAgents`;
  client/src/app/evals/helpers.ts `recentRunsAcrossAgents`)
- 2026-09-01: correction to the 2026-09-01 correction directly below — the eval
  surface is split on TIME, not on metrics. `EvalsTab` does NOT keep only
  eval-case CRUD: it also renders `EvalMetricsSummary`, the latest completed
  run's recall / precision / citation accuracy plus a traces-passed tally.
  `app/evals/[agentId]` owns everything that compares runs to EACH OTHER — the
  trend, the run table, selection and compare. Stripping every number out of the
  tab was the user's stated complaint, because "is my set passing right now" is
  asked while EDITING the set and must not cost a navigation. The two surfaces
  share `lib/evals.ts`, never a component — a `_components` folder stays private
  to its route (evidence:
  client/src/app/agents/[id]/_components/EvalsTab/_components/EvalMetricsSummary/;
  client/src/app/agents/[id]/_components/EvalsTab/EvalsTab.test.tsx asserts both
  the metrics present and "Metric trend"/"Recent runs" absent)
- 2026-09-01: `EvalRunRecord.actual_output` is `z.unknown()` on the wire and has
  TWO shapes the client must tell apart — `outcome.review` (an object with
  `findings: Finding[]`) on success, and `{ error: message }` when the case threw
  (server/src/modules/eval/runner.ts:174,193). Any client count derived from it
  must return null, NEVER 0, for the error shape: "the run failed" and "the agent
  found nothing" are different statements and one keystroke apart. The per-case
  rows only reach the client through `GET /eval-suite-runs/:id`, and a case run
  singly via `useRunEvalCase` writes `suite_run_id: null`, so it is absent from
  that list — the UI must degrade to "expected N findings" with no `got` clause
  rather than inventing `got 0` (evidence:
  client/src/app/agents/[id]/_components/EvalsTab/_components/EvalCaseList/helpers.ts
  `gotFindingCount`; its colocated helpers.test.ts)
- 2026-09-01: correction — the 2026-08-31 "tab body goes NEXT TO the editor
  shell" entry below still states the placement RULE correctly, but its running
  example is reversed: the eval metrics, trend and run history moved back OUT of
  `EvalsTab` onto a real page at `app/evals/[agentId]/page.tsx`, and
  `EvalsTab` now keeps only eval-case CRUD. Split a surface on WHOSE BREADCRUMB
  IT IS, not on which route currently owns the data: reading a regression is
  `Skills Lab › Eval Dashboard › <Agent>`, authoring a case is
  `Skills Lab › Agents › <Agent>`. Nesting the first under the second is what
  forced `/evals/[agentId]` to exist purely as a `redirect()` (evidence:
  client/src/app/evals/[agentId]/page.tsx;
  client/src/app/agents/[id]/_components/EvalsTab/EvalsTab.tsx)
- 2026-09-01: when two ROUTES need the same domain helpers, they go to
  `src/lib/<domain>.ts` — never imported across `_components/` folders. A
  `_components/` directory is private to its route, so
  `app/evals/**` reaching into `app/agents/[id]/_components/EvalsTab/_components/**`
  is the exact import direction the placement rules forbid, and the deeper
  folder is also the one most likely to be deleted. The eval metric formatters,
  delta maths, `fallenMetrics`, the run-state predicates and the selection
  helpers therefore live in `src/lib/evals.ts` as a peer of `lib/cost.ts` and
  `lib/time.ts`, with their acceptance tests in `src/lib/evals.test.ts`
  (evidence: client/src/lib/evals.ts; client/src/lib/evals.test.ts;
  client/src/app/evals/[agentId]/_components/EvalRunTable/EvalRunTable.tsx imports `@/lib/evals`)
- 2026-08-31: a `NAV[].key` in `src/vendor/ui/nav.ts` is not a free-form label —
  it is simultaneously (a) a JSON path into `messages/en/shell.json`'s `nav.*`
  block, resolved by `useShellCommands` as `t(\`nav.${it.key}\`)` for EVERY nav
  item on EVERY shell mount, and (b) the value `activeKeyFor` must return for
  the sidebar entry to highlight. Nothing typechecks either coupling. Adding
  `{ key: "evals", … }` when `shell.json` declared `nav.eval` and `activeKeyFor`
  already returned `"eval"` threw `MISSING_MESSAGE: Could not resolve
  'shell.nav.evals'` on every page in the app and left the entry unhighlighted
  on its own route — with `pnpm typecheck`, 498 tests and the build all green.
  ALWAYS grep `messages/en/shell.json` for the exact key and read `activeKeyFor`
  before adding a NAV item, and match the hardcoded `label` to the `nav.*`
  value the way every other item does (evidence:
  client/src/vendor/ui/nav.ts:36; client/messages/en/shell.json `nav.eval`;
  client/src/components/app-shell/helpers.ts:36;
  client/src/components/app-shell/hooks/useShellCommands.ts:24)
- 2026-08-31: `messages/en/*.json` in this repo is a DESIGN CONTRACT written
  before the code, not a bag the feature fills in — `agents.json`'s
  `editor.tabs.{evals,stats,ci}` and `eval.json`'s whole `evalsTab` block
  predate the eval pipeline. A declared-but-unreferenced key is therefore a
  signal that a surface has not been built or has been built beside the design,
  and a NEW key whose string duplicates an existing one (`trendChart.title`
  vs `dashboard.metricTrend`, `runList.heading` vs `dashboard.recentRuns`,
  `metricStrip.metricNames.*` vs `dashboard.metrics.*`/`dashboard.legend.*`)
  is the defect, not the missing key. Before adding a key, grep the file for
  the label you are about to write (evidence: client/messages/en/agents.json
  `editor.tabs`; client/messages/en/eval.json `evalsTab`; the four blocks this
  feature added, three of which were deletable duplicates)
- 2026-08-31: a tab body with its own component cluster goes NEXT TO the editor
  shell, not inside it. `frontend-ui-architecture` caps nesting at
  `_components/<Parent>/_components/<Child>/`, so putting the eval surface at
  `AgentEditor/_components/EvalsTab/_components/EvalRunList/` (which is where
  colocation and consistency with `ConfigTab`/`SkillsTab`/`ContextTab` both
  point) would need a third `_components` level. `EvalsTab` therefore sits at
  `app/agents/[id]/_components/EvalsTab/` as a sibling of `AgentEditor`, which
  imports it as `../EvalsTab`; the other three tabs stay where they are because
  they are one file each. Two pre-existing three-level paths under
  `pulls/[number]/_components/OverviewTab/` are the violation, not the
  precedent (evidence:
  client/src/app/agents/[id]/_components/EvalsTab/;
  client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx imports
  `../EvalsTab`)
- 2026-08-31: addendum to the page-scope-test entry below — the cheapest way
  out of those four mock factories is to not need them. Moving a surface from
  an `app/**/page.tsx` into a tab component that takes its id as a PROP drops
  both the `next/navigation` mock (no `useParams`) and the
  `@/components/app-shell` mock (the shell belongs to the page above), leaving
  only the feature's own `lib/hooks/*` factory (evidence:
  client/src/app/agents/[id]/_components/EvalsTab/EvalsTab.test.tsx, converted
  from the four-mock `app/evals/[agentId]/page.test.tsx`)
- 2026-08-31: a PAGE-scope test for an `app/**/page.tsx` needs
  `vi.mock("@/components/app-shell")` on top of the mocks for the page's own
  `lib/hooks/*` — `AppShell` reaches `usePulls`/`useDeleteRepo` through
  `useShellContext`, so a page whose every own hook is mocked STILL throws "No
  QueryClient set" from the shell chrome alone; and `useParams` must be mocked
  because the route param is read from `next/navigation`, not passed as a prop.
  With those four factories (`next/navigation`, `@/components/app-shell`,
  `@/lib/hooks/agents`, `@/lib/hooks/evals`) the page renders synchronously and
  needs no `QueryClientProvider` and no `findBy*`, so a page test costs about as
  much as a component test (evidence:
  client/src/app/evals/[agentId]/page.test.tsx;
  client/src/components/app-shell/hooks/useShellContext.ts:28-29)
- 2026-08-30: correction — the entry below that REMOVED `EvalRunList`'s "Compare selected runs" button has been reversed. AC-44 requires a control whose `disabled` attribute is observable at 0, 1, 2 and 3 selections, and an implicit "open the modal the moment `selectedRunIds.length === 2`" cannot be observed that way; it also left `eval.runList.compare`/`compareHint` referenced by nothing. The button is back with `disabled={!isCompareReady(selected)}` and an `onCompare?: (selectedRunIds: string[]) => void` prop, and `page.tsx` now holds a `compareOpen` flag that the button sets and any selection change clears (evidence: client/src/app/evals/[agentId]/_components/EvalRunList/EvalRunList.tsx `compareReady`; client/src/app/evals/[agentId]/page.tsx `compareOpen`)
- 2026-08-30: `EvalCompare` carries ONE server-computed patch, `prompt_diff` (built by `skillBodyPatch`), not the two snapshots' prompts — so `EvalCompareRunInput` must not carry a per-run `systemPrompt`. Passing the same patch string into both runs printed it twice under "Older"/"Newer" headings and made the availability check compare a value with itself. The modal now takes `promptDiff: string | null` and renders it once, with `promptDiffState(promptDiff, sameVersion)` choosing between `unavailable` (null), `same_version`, `unchanged` (empty patch — `skillBodyPatch` returns `''` when there are no hunks) and `patch` (evidence: client/src/app/evals/[agentId]/_components/EvalCompareModal/helpers.ts `promptDiffState`; server/src/modules/eval/service.ts `compareRuns`)
- 2026-08-30: a nullable aggregate from a contract is rendered as "not computed", NEVER coerced with `?? 0`. `eval_suite_runs.cases_passed`/`cases_total` are written only by `finish()`, so every `running`, `failed` and `cancelled` row carries null there and "0 of N passed" would be indistinguishable from a suite where every case failed. `EvalAgentCardRun.casesPassed`/`.agentVersion` are `number | null` for the same reason and render the same `—` the three metric props already did (evidence: client/src/app/evals/[agentId]/_components/EvalRunList/helpers.ts `caseTally`; client/src/app/evals/_components/EvalAgentCard/EvalAgentCard.tsx `NOT_COMPUTED`)
- 2026-08-30: correction to gap (2) in the entry below (`caseRuns` scoped to
  only the latest suite run) — fixed by giving `EvalRunList` an
  `onExpandedChange?: (runId: string | null) => void` prop fired on row
  expand/collapse, and having `page.tsx` call the already-existing
  `useEvalSuiteRun(expandedRunId)` hook (`GET /eval-suite-runs/:id`, which
  returns `{ suite_run, runs }` for **any** run regardless of status) instead
  of feeding `EvalRunList.caseRuns` from `dashboardQuery.data?.recent_runs`.
  No new hook was needed — `useEvalSuiteRun` already existed in
  `lib/hooks/evals.ts`, unused until this wiring. Expanding a cancelled row,
  or any non-latest row, now shows its real per-case rows (AC-62) instead of
  an empty list (evidence: client/src/app/evals/[agentId]/page.tsx
  `expandedRunQuery`; .../_components/EvalRunList/EvalRunList.tsx
  `onExpandedChange`/`handleToggleExpanded`).
- 2026-08-30: `EvalRunList`'s "Compare selected runs" button had no click
  handler and no `onCompare` prop, and its own AC-44 test only ever asserted
  the button's `disabled` state — never clicked it — so a dead control passed
  review unnoticed. Removed the button entirely rather than wiring it up:
  `page.tsx` already opens `EvalCompareModal` the moment
  `selectedRunIds.length === 2` (`compareRunIds` derivation in `page.tsx`), so
  an explicit button click would have been a second, redundant trigger for the
  same action. The AC-44 substance (enable-at-exactly-two) now lives entirely
  in that page-level derivation and in what `onSelectionChange` reports; a
  future component that needs a VISIBLE compare affordance should call
  `onSelectionChange`'s reported array to decide `disabled`, not add a second
  internal `compareDisabled` computation the way the removed button had
  (evidence: client/src/app/evals/[agentId]/_components/EvalRunList/EvalRunList.tsx
  before/after; client/src/app/evals/[agentId]/page.tsx `compareRunIds`).
- 2026-08-30: T26 (`/evals/[agentId]/page.tsx`) found two real data-sourcing gaps
  left by the wave-3/wave-4 split, both worth fixing in a follow-up rather than
  papering over from the page: (1) NO client hook anywhere fetches a historical
  `agent_versions` snapshot's `system_prompt` — `hooks/agents.ts` only has
  `useAgent`/`useAgents` (current config, not a past version), yet
  `EvalCompareModal` (T17) wants each compared run's own raw prompt text via
  `EvalCompareRunInput.systemPrompt`. The page instead calls the already-built
  `useEvalCompare` (T21) and feeds its server-computed `prompt_diff` string as
  BOTH sides' `systemPrompt` when `prompt_diff_unavailable` is false — this
  keeps `isPromptDiffUnavailable`/`isSameAgentVersion` correct (real signals)
  but means the modal's "older" and "newer" prompt panels show the *same* diff
  text rather than each side's actual full prompt. A real fix needs a
  `useAgentVersion(agentId, version)` hook hitting the already-existing
  `GET /agents/:id/versions/:version` route (`server/src/modules/agents/routes.ts:140-146`),
  added to `hooks/agents.ts` — out of T26's `Files:` list. (2) `EvalRunList`'s
  `caseRuns` prop wants every per-case run row across every suite run so its
  internal per-row expansion can show "cases that ran" for ANY row, but the only
  hook that returns `EvalRunRecord[]` without a specific known `suiteRunId` is
  `useEvalDashboard`'s `recent_runs` field, and the server scopes that to only
  the agent's LATEST suite run (`server/src/modules/eval/service.ts:328-331`
  `listRunsBySuiteRun(workspaceId, latest.id)`). T26 passes `recent_runs`
  through as-is, so expanding any run OTHER than the newest one renders an empty
  per-case list — not wrong data, just incomplete for older rows. Needs either a
  new "all case runs for this agent" endpoint/hook, or `EvalRunList` gaining a
  per-row lazy-fetch capability it does not have today (evidence:
  client/src/app/evals/[agentId]/page.tsx `compareRunA`/`compareRunB`/`caseRuns`;
  client/src/lib/hooks/agents.ts; server/src/modules/eval/service.ts:305-341 `getDashboard`).
- 2026-08-30: `Modal` (`vendor/ui/kit/Modal.tsx`) renders its OWN dismiss
  control when given `onClose` — an `IconBtn` with a hardcoded `label="Close"`
  in the header, not something the caller supplies — so a modal wrapping a
  child that has no cancel/close button of its own (T26 wrapping
  `EvalCaseEditor`, which only exposes Save) needs no extra footer button and
  no new i18n key; passing `onClose` alone is sufficient and avoids inventing a
  `caseEditor.cancel`/`close` message key that T6's `eval.json` never defined
  (evidence: client/src/vendor/ui/kit/Modal.tsx:57 `<IconBtn icon="X"
  label="Close" onClick={onClose} />`; client/src/app/evals/[agentId]/page.tsx
  case-editor `<Modal onClose={...}>` with no footer).
- 2026-08-30: T25's `/evals` dashboard — `EvalDashboard` (the `GET /evals`
  response entry per agent) carries `owner_id` but NO agent name field, so the
  page must separately call `useAgents()` and join by `owner_id === agent.id`
  to render `EvalAgentCard`'s required `agentName` prop; do not assume a
  dashboard-shaped contract carries its own display name. Also: `current.*`
  (recall/precision/citation_accuracy/traces_passed/traces_total) already IS
  the latest completed suite run's aggregate (server sets it from
  `suiteRunStore.recentCompleted(...)[0]`, `service.ts:291-307`), but the run's
  `agent_version` and `ran_at` are NOT on `current` or `trend` — they only
  exist per-row on `recent_runs` (`EvalRunRecord[]`, the case-level rows of
  that one suite run), ordered newest-first
  (`repository.ts:239` `orderBy(desc(t.evalRuns.ranAt))`), so `recent_runs[0]`
  is the correct source for both fields, and `recent_runs.length === 0` is the
  correct "never had a completed run" test (mirrors the server's own `latest`
  null-check) rather than checking `current.recall == null` (which is also true
  for a completed run with zero `must_find` cases) (evidence:
  server/src/modules/eval/service.ts:280-343 `getDashboard`;
  server/src/modules/eval/repository.ts:231-241 `listRunsBySuiteRun`;
  client/src/app/evals/page.tsx `latestRunFromDashboard`).
- 2026-08-30: `messages/en/eval.json`'s `page` namespace holds only breadcrumb
  labels (`crumbSkillsLab`, `crumbEvals`, `crumbEvalDashboard`, `crumbAgents`,
  `crumbNewCase`, `crumbEvalCase`) — there is no page-level title/subtitle/
  empty-state/error string for the `/evals` index the way `agents.json`'s
  `list.*` block has one for `/agents`. T25 reused `dashboard.defaultTitle`
  ("Eval Dashboard") for the h1 and fell back to the already-established
  cross-page `common.json` `states.empty`/`states.loading` namespace (see
  `OnboardingView.tsx`'s `useTranslations("common")` precedent) rather than
  inventing new eval.json keys outside its `Files:` ownership. A future task
  that wants a more specific "no agents have eval cases yet" empty-state body
  needs that key added by whichever task owns `eval.json` next (evidence:
  client/messages/en/eval.json `page`/`dashboard` blocks;
  client/messages/en/common.json `states`; client/src/app/evals/page.tsx).
- 2026-08-30: T21's `Files:` list ownership was `hooks/evals.ts` + `hooks/index.ts`
  only — no component `helpers.ts` was available to hold the established
  `err.code` → label mapping (the `DocAttachPanel/helpers.ts` `saveErrorText`
  shape: a pure function taking `(error, labels)` where `labels` is supplied by
  the caller from next-intl, keeping the strings out of the data layer). The
  same shape was relocated straight into the hooks file — `evalErrorText(error,
  labels: EvalErrorLabels)` in `hooks/evals.ts` — rather than invented fresh, so
  a wave-5 page importing it gets the exact same `error instanceof ApiError` +
  `switch (error.code)` + `labels.unknown(error.message)` contract as every
  other error-mapping helper in this codebase, just one file up from where it
  usually lives. Reuse it, do not write a second `evalErrorText`-shaped
  function nearer a component once one exists (evidence:
  client/src/lib/hooks/evals.ts `EvalErrorLabels`/`evalErrorText`;
  client/src/components/doc-attach/helpers.ts `SaveErrorLabels`/`saveErrorText`).
- 2026-08-30: `@devdigest/ui`'s `LineChart` (`src/vendor/ui/charts/LineChart.tsx`)
  is unsafe for a nullable metric series — its `ChartSeries.data` is typed
  `number[]` and any missing point is coerced with `s.data[i] ?? 0`, so a
  `null` value (e.g. `EvalTrendPoint.recall` when a run had no `must_find`
  cases) would silently plot as a collapse to zero instead of a gap. T15
  (`EvalTrendChart`) could not touch that vendored file (out of its `Files:`
  list) so it built its own inline SVG instead — filter each series to its
  non-null points before building the `polyline`, plot circles only at known
  points, and never feed a coerced `0` into a metric chart. Any future trend
  chart over a nullable metric needs the same filter-before-plot approach or
  its own local renderer, not the shared `LineChart` (evidence:
  client/src/vendor/ui/charts/LineChart.tsx:34 `s.data[i] ?? 0`;
  client/src/vendor/shared/contracts/eval-ci.ts:127-133 `EvalTrendPoint`
  nullable `recall`/`precision`/`citation_accuracy`;
  client/src/app/evals/[agentId]/_components/EvalTrendChart/EvalTrendChart.tsx).
- 2026-08-30: `messages/en/eval.json` is loaded as ONE next-intl namespace
  named `eval` (the filename), with every top-level key (`trendChart`,
  `metricStrip`, `evalsTab`, …) as a nested path inside it — the working
  pattern already established by `EvalCaseList.tsx` and `EvalAgentCard.tsx` is
  `useTranslations("eval.trendChart")` in components and
  `messages={{ eval: messagesJson }}` in tests, not a per-top-level-key
  namespace. A component may call `useTranslations` a second time for a
  DIFFERENT top-level key in the same file (`eval.metricStrip`) to reuse an
  existing label set (`metricNames.recall`/`precision`/`citationAccuracy`)
  instead of duplicating those three strings under `trendChart` — reuse across
  a shared JSON file's own namespaces is not "inventing a key" (evidence:
  client/src/i18n/request.ts `loadMessages`; EvalTrendChart.tsx two
  `useTranslations` calls; EvalTrendChart.test.tsx `messages={{ eval:
  messages }}`).
- 2026-08-30: `dashboard.neverRun` in `eval.json` covers "this agent has never
  completed a run" (AC-39) but the catalogue carries no "not computed"
  counterpart for an individual nullable metric on an agent that HAS run
  (`EvalDashboard.current.recall` etc. are nullable after T2 for that reason
  too — a completed run with zero `must_find` expectations still reports
  `recall: null`). `EvalAgentCard` (T13) renders that per-metric null case with
  a bare "—" rather than borrowing `metricStrip.notComputed` from a different
  component's namespace or inventing a new key outside T6's ownership — the
  same fallback `lib/time.ts`'s `relativeTime()` already uses for a missing
  timestamp, so it reads as an established repo convention rather than a
  one-off. A card-list component one level up the ownership chain that needs
  the words "not computed" for this state, not just the glyph, has to get that
  key added by whichever task owns the eval message file next (evidence:
  client/src/app/evals/_components/EvalAgentCard/EvalAgentCard.tsx
  `formatPercent`; client/src/lib/time.ts `relativeTime` returning "—";
  client/messages/en/eval.json has `metricStrip.notComputed` but no
  `dashboard.notComputed`)
- 2026-08-30: a plan's `Files:` list for a messages task can include a file
  that needs no actual edit — T6 of `docs/plans/2026-08-30-eval-pipeline.md`
  lists `client/messages/en/agents.json` as owned/edited, but its Do paragraph
  never names any string to add there, and none of the wave-3/5 tasks that
  consume the eval message catalogue touch any `AgentEditor` file. The existing
  `agents.json` keys (`editor.agentFallback`, `editor.loadErrorTitle`,
  `editor.loadErrorBody`) already cover the one plausible need (showing agent
  context/error state on the new `/evals/[agentId]` page), so the file was left
  untouched rather than padded with speculative keys nobody reads. Being listed
  in `Files:` grants edit rights for that file to one task, not an edit
  requirement — audit for actual consumers before adding content on the
  strength of the list alone (evidence:
  docs/plans/2026-08-30-eval-pipeline.md T6 and T13–T20/T25–T27 `Files:` lines;
  client/messages/en/agents.json `editor.agentFallback`/`loadErrorTitle`/`loadErrorBody`)
- 2026-08-24: an `{a && b && (<JSX/>)}` gate built from two independent
  conditions (`review && meta`, `blockingReasons.length > 0`) hides a reachable
  branch when the two conditions are actually independent — `AC-86`'s `ⓘ`
  control only needs `blockingReasons.length > 0`, but nesting it inside
  `{review && meta && (…)}` made it silently unreachable on an unreviewed PR
  with a `high` risk, because `composeBlockingReasons` unions `high` risks in
  regardless of whether a review exists. Caught by `plan-verifier`, not by
  typecheck or the original test suite — the original `BriefVerdictStrip.test.tsx`
  never exercised "no review + a high risk" as its own case. Fix: hoist the
  gated JSX into a variable (`infoControl`) computed from its own condition
  only, then reference that variable from both the reviewed and unreviewed
  branches — the two branches render identical JSX for the shared case, so
  nothing about the reviewed layout moves (evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/BriefVerdictStrip.tsx`
  `infoControl` variable and the `{!(review && meta) && infoControl && (...)}`
  branch; `docs/plans/2026-08-24-pr-why-risk-brief-blocking-reasons.md` AC-86).
- 2026-08-24: when a live-computed value (`composeBlockingReasons(...).length`)
  replaces a frozen one (`run.blockers`) as a component's source of truth, widen
  the prop to carry the raw domain objects the computation needs (the full
  `ReviewRecord` + the run's `ci_fail_on`), not the pre-derived scalar — the
  caller (`BriefPanel`) stopped computing `blockers` itself and the callee
  (`BriefVerdictStrip`) now calls `composeBlockingReasons` internally, so the
  badge count and the hover card's row count can never read from two different
  places and disagree again. `BriefVerdictStripReview.review: ReviewRecord` +
  `.ciFailOn: CiFailOn | null` replaced the old `.blockers: number` field for
  exactly this reason (evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/helpers.ts`
  `stripReviewFrom`; `BriefVerdictStrip.tsx`'s `blockingReasons` /
  `liveBlockerCount`).
- 2026-08-24: the Overview tab now has TWO differently-priced paid controls in
  one section, and they are told apart only by their LABEL, not by position —
  `IntentCard`'s own Recompute control (`t("recompute")`/`t("compute")`, `intent`
  namespace) and `BriefPanel`'s Generate/Regenerate control
  (`t("regenerate")`/`t("generating")`, `brief` namespace) both render inside
  `BriefPanel`'s card grid after the PR Brief feature moved `IntentCard` in, so
  proximity no longer distinguishes which button triggers which paid call. Any
  future paid control added to this section needs its own visibly distinct
  label for the same reason (evidence:
  client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/IntentCard.tsx:97
  `t("recompute")`/`t("compute")`;
  client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/BriefPanel.tsx:156
  `t("regenerate")`/`t("generating")`)
- 2026-08-23: `client/src/vendor/ui/nav.ts` IS editable, despite the general
  "vendored, treat as read-only" rule for `src/vendor/ui/` — SPEC-02 (AC-39,
  AC-57) required adding exactly one item to `NAV`. The `Onboarding Tour` entry
  in the WORKSPACE group plus its `g o` line in `SHORTCUTS` is the one
  deliberate, spec-mandated edit to this file for this feature; nothing else in
  it moved, renamed or was removed. Check the spec/plan before assuming a diff
  touching `vendor/ui/` is a mistake to revert (evidence:
  client/src/vendor/ui/nav.ts:26,65; specs/2026-08-23-onboarding-generator.md
  AC-39, AC-57)
- 2026-08-23: `activeKeyFor`'s per-route matching must be an ANCHORED pattern,
  not a bare `.includes()` — `pathname.includes("/onboarding")` matched both
  `/repos/:id/onboarding` (the new per-repo tour route) and the unrelated,
  top-level `/onboarding` Add Repository screen, so the wrong sidebar item lit
  up on that screen. Fixed with
  `/^\/repos\/[^/]+\/onboarding(\/|$)/.test(pathname)`, scoped to the
  repo-prefixed path. Any future nav key whose route segment is a substring of
  another route needs the same anchoring, not `.includes()` (evidence:
  client/src/components/app-shell/helpers.ts:29 `activeKeyFor`)
- 2026-08-23: `client/src/lib/onboarding.ts` is the one place the three
  complexity colours and the five section-kind order live, precisely so a THIRD
  hand-rolled colour map is not created — two `SEV_COLOR` copies already exist
  and have already drifted from `SEV` (see the 2026-08-01 entry below).
  `COMPLEXITY[complexity].label` ("Low"/"Medium"/"High") is DEAD — nothing
  reads it. The accessible pill word comes from
  `` t(`complexity.${task.complexity}`) `` via next-intl instead, because a
  hardcoded English `label` would violate the "every user-facing string goes
  through next-intl" rule; only `.c`/`.bg` are consumed from the module. Do not
  delete `.label` assuming it is unused dead code without checking for a
  non-next-intl consumer, and do not read it expecting it to be the rendered
  word (evidence: client/src/lib/onboarding.ts:11-18;
  client/src/app/repos/[repoId]/onboarding/_components/FirstTasksSection/FirstTasksSection.tsx:24,35)
- 2026-08-23: a mutation's failure is already derived state — read
  `mutation.error` from the hook's return and map it, rather than passing
  `mutate(vars, { onError })`. Two reasons beyond "derive, don't store": the
  per-call form adds a second argument to every `mutate` call, which breaks
  every `expect(mutate).toHaveBeenCalledWith([...])` assertion in a test that
  mocks the hook (six of them here), and `lib/hooks/*` is frequently owned by
  someone else in a parallel build, so `error` is the surface you can rely on
  without editing the hook. TanStack clears it when the next mutation starts,
  so the banner disappears on the next successful save by itself (evidence:
  client/src/components/doc-attach/DocAttachPanel.tsx `saveError`;
  client/src/components/doc-attach/helpers.ts `saveErrorText`)
- 2026-08-23: `useTokenEstimate` (hooks/context.ts) is UNGUARDED — it takes an
  unbounded `paths: string[]`, applies no slice and has no `onError`, while the
  server caps `POST /repos/:id/context/estimate` at 20 paths **in the route
  schema**, which surfaces as **422** (not the 409 the attach route uses; a
  preview deliberately does not 409). Every caller must therefore slice to
  `MAX_ATTACHMENTS` itself AND render an `isError` fallback, or the footer
  breaks on a set the attach route would have accepted. The footer maps any
  failure to ONE string rather than branching on status — the three-404 trap
  recorded below is the reason not to branch (evidence:
  client/src/lib/hooks/context.ts:100-106;
  client/src/components/doc-attach/DocAttachPanel.tsx `footerText`;
  server/src/modules/context/routes.ts:16-18 `.max(MAX_ATTACHMENTS)`)
- 2026-08-23: a shared component that takes its strings as a `labels` prop
  (the `markdown-editor/MarkdownEditor.tsx:1-6` rule) hits a wall as soon as a
  string interpolates a value the COMPONENT owns rather than the caller —
  `MarkdownEditor`'s callers precompute `t("config.bodyTokens", {count})`
  because they hold the count, but an attached/total badge or a token footer
  does not exist until the component's own queries resolve. The shape that
  keeps i18n in the caller is a FUNCTION-valued label
  (`attachedCount: (attached, total) => string`), not a `useTranslations` call
  inside the shared component and not a formatted string prop (evidence:
  client/src/components/doc-attach/DocAttachPanel.tsx `DocAttachLabels`;
  callers client/src/app/{agents,skills}/[id]/.../ContextTab/ContextTab.tsx)
- 2026-08-23: an HTTP status is NOT this API's error taxonomy — `err.code` is,
  and branching on `err.status` alone silently collapses distinct server errors
  into one message. `server/src/platform/errors.ts` gives every `AppError` a
  string `code`, `app.ts`'s `setErrorHandler` ships it as
  `{ error: { code, message, details } }`, and `apiFetch` parses it onto
  `ApiError.code` (`src/lib/api.ts:10`) — but three different Project Context
  failures all answer **404**: `not_cloned`, `not_found` (absent from the walk)
  and `document_unreadable` (listed but unreadable). A `status === 404` branch
  told the user to "Resync" for a file that resync cannot fix, and the test
  stayed green because it pinned only one of the three. ALWAYS map `err.code` to
  a message (with `err.message` as the fallback for an unrecognised code, since
  `code` is `undefined` when the error body is not the JSON envelope), and write
  one test case PER code (evidence:
  server/src/modules/context/service.ts:75,83,84;
  client/src/app/repos/[repoId]/context/_components/ProjectContextView/_components/DocumentPreview/constants.ts)
- 2026-08-23: `src/vendor/shared` is a mirror in intent but NOT byte-identical
  today — `diff -rq server/src/vendor/shared client/src/vendor/shared` reports
  `contracts/{eval-ci,productionize,trace}.ts` drifting, and `eval-ci.ts` is the
  sharp one: the client copy has **no `AgentManifest` block at all** (and no
  `Provider`/`CiFailOn` imports), so an instruction to "mirror the new field on
  `AgentManifest`" is unsatisfiable here without importing the whole missing
  block — i.e. repairing drift that was scoped out. ALWAYS diff the specific
  file before promising to carry a contract addition into the client; a `cp` of
  the canonical file is only safe for files whose sole difference IS the
  addition (that held for `adapters.ts`, `contracts/platform.ts`, `index.ts` and
  the new `contracts/context.ts`). `scripts/verify-l04.sh` gates only three
  files, so nothing catches the rest (evidence:
  client/src/vendor/shared/contracts/eval-ci.ts:3 vs
  server/src/vendor/shared/contracts/eval-ci.ts:145-176)
- 2026-08-16: a next-intl message KEY, not just its value, can be swapped for a
  small namespaced set (`callerCount` → `callerCount.{call,type,mixed}`) and
  looked up with a template literal (`` t(`callerCount.${kind}`, {count}) ``)
  with zero typecheck fallout — `useTranslations` types the key as `string`
  here, there is no generated message-key union (confirmed no `IntlMessages`/
  `next-intl` module augmentation exists under `src/`). The same dynamic-key
  pattern was already load-bearing one file over
  (`` t(`degraded.reason.${reasonKey(data.reason)}`) ``
  in `BlastRadiusCard.tsx`), which is the precedent to reach for instead of
  keeping a single flat ICU key and branching in JS (evidence:
  BlastRadiusCard/_components/BlastSymbolRow/BlastSymbolRow.tsx `labelKind`;
  BlastRadiusCard/BlastRadiusCard.tsx `reasonKey`)
- 2026-08-16: `tsconfig.json` sets `noUncheckedIndexedAccess: true`, so a regex
  capture group accessed via `match[1]` types as `string | undefined` even right
  after `if (!match) return …` — the exec array's numeric indices are treated
  like any other index signature. Add an explicit `match[1] == null` guard (or
  destructure with a fallback) before using a capture group, or `pnpm typecheck`
  fails with "Type 'string | undefined' is not assignable to type 'string'"
  (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/helpers.ts `parseEndpoint`; client/tsconfig.json:8)
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
- 2026-09-01: `MetricCard` renders its delta as `Math.abs(delta).toFixed(2)`, so
  passing the FRACTION difference the eval metrics work in shows a four-point
  rise as `0.04` — silently disagreeing with `formatDeltaLabel`, which the
  regression banner already speaks in "pts". It now takes an optional
  `deltaLabel` that replaces only the number; the arrow and the colour still come
  from `delta`'s sign, so omitting it keeps every existing caller unchanged
  (evidence: client/src/vendor/ui/charts/MetricCard.tsx;
  client/src/app/agents/[id]/_components/EvalsTab/_components/EvalMetricsSummary/EvalMetricsSummary.tsx)
- 2026-09-01: `IconName` admits `Edit`, NOT `Pencil`. `Pencil` is imported from
  lucide and then exposed only under the aliased key `Edit: Pencil`, so
  `icon="Pencil"` fails `tsc` with a 60-name union in the message — read the
  `Icon` object at the bottom of the file, not the import list at the top
  (evidence: client/src/vendor/ui/icons.tsx:146-147, `export type IconName =
  keyof typeof Icon`)
- 2026-09-01: correction — the 2026-08-30 `LineChart` entry below told the next
  session to hand-roll SVG rather than use the shared chart. That is no longer
  the answer: `ChartSeries.data` is now `(number | null)[]`, the `?? 0` is gone
  and `<Line connectNulls>` draws the gap, so a nullable metric series is safe
  on the vendored `LineChart`. Widening the vendored component was cheaper than
  a third local renderer and non-breaking for `StatsTab`/`Showcase` (evidence:
  client/src/vendor/ui/charts/LineChart.tsx:15,61;
  client/src/app/evals/[agentId]/_components/EvalTrendPanel/EvalTrendPanel.tsx)
- 2026-09-01: Recharts renders NOTHING under vitest/jsdom — `ResponsiveContainer`
  measures 0×0 and logs "The width(0) and height(0) of chart should be greater
  than 0". A component test can therefore assert nothing about a Recharts chart,
  and a suite that looks green may be asserting on an empty `<div>`. Keep the
  accessible textual reading of the series (summary + a `<ul>` of points) in the
  DOM as a visually-hidden block: it is both the a11y answer and the only
  surface the test can assert on. `position:absolute; clip:rect(0 0 0 0)` keeps
  it in `textContent`, so `getByText` and `agent-browser`'s `wait --text` both
  still see it (evidence:
  client/src/app/evals/[agentId]/_components/EvalTrendPanel/EvalTrendPanel.tsx:53 `s.srOnly`;
  client/src/app/evals/[agentId]/_components/EvalTrendPanel/EvalTrendPanel.test.tsx)
- 2026-09-01: `@devdigest/ui`'s `Checkbox` renders its `label` as VISIBLE text
  and only sets `aria-label` when that label is a `string` — so wrapping the
  label in a hidden `<span>` to get a bare checkbox silently strips the
  control's accessible name. Pass `hideLabel` instead (added for the eval run
  table), which keeps the string as `aria-label` while dropping it from the
  layout (evidence: client/src/vendor/ui/kit/Checkbox.tsx:9,14;
  client/src/app/evals/[agentId]/_components/EvalRunTable/EvalRunTable.tsx)
- 2026-08-30: RTL's `getByText("multi\nline")` NEVER matches text inside a `<pre>`: the default matcher normalizes whitespace, so a unified-diff patch rendered verbatim cannot be found by its own string. Match it with the matcher-function form instead — `screen.queryAllByText((_, el) => el?.tagName === "PRE" && el.textContent === PATCH)` — which also gives you the "rendered exactly once" assertion (evidence: client/src/app/evals/[agentId]/_components/EvalCompareModal/EvalCompareModal.test.tsx `promptPatchBlocks`)
- 2026-08-30: `pnpm typecheck` on the whole project can fail on a FILE YOU
  DID NOT TOUCH when another concurrently-run implementer's task references a
  package that is not yet installed — e.g. `EvalCompareModal.test.tsx` imports
  `@testing-library/user-event`, which is not in `package.json` or
  `node_modules/@testing-library/`. `pnpm typecheck` type-checks `.test.tsx`
  files too, so this is a whole-tree failure, not scoped to the file that
  needs the dependency. Before treating a `pnpm typecheck` failure as caused
  by your own change, `grep` the error for a path outside your task's `Files:`
  list (evidence: `client/src/app/evals/[agentId]/_components/EvalCompareModal/EvalCompareModal.test.tsx(3,23): error TS2307` while implementing T16 `EvalRunList`, an unrelated sibling folder)
- 2026-08-30: `pnpm exec vitest related --run "<path>/Foo.tsx"` only follows the
  DIRECT import graph from that one file — a sibling `helpers.test.ts` that
  imports `./helpers` but never imports `Foo.tsx` is NOT picked up, even though
  it lives in the same component folder and Foo.tsx imports the same helpers.
  A plan's per-task `Verify:` line that names only the component file is
  therefore not proof the folder's `helpers.test.ts` passes — run
  `pnpm exec vitest run "<path>"` (the folder, not one file) once as a
  supplementary check whenever the task also added a `helpers.ts` +
  `helpers.test.ts` pair (evidence: `EvalCaseEditor/helpers.test.ts` did not
  run under `vitest related --run ".../EvalCaseEditor.tsx"`, 1 test file/2
  tests; `vitest run ".../EvalCaseEditor"` picked up both files, 2 test
  files/5 tests).
- 2026-08-24: a plan's own `Verify:` line can be a false green if it embeds a
  `client/`-prefixed path AFTER the command already does `cd client` — vitest's
  `include` glob is `src/**/*.test.{ts,tsx}`, so
  `cd client && pnpm exec vitest related --run "client/src/…/Foo.tsx"` resolves
  to nothing, prints `No test files found, exiting with code 0`, and exits
  successfully without running a single test. Always re-derive the real command
  by dropping the leading `client/` segment (`--run "src/…/Foo.tsx"`) and confirm
  it actually lists test files before trusting a green run reported against the
  plan's literal text (evidence: ran both forms for T9 of
  `docs/plans/2026-08-24-pr-why-risk-brief-blocking-reasons.md` — the `client/`-
  prefixed one printed "No test files found"; the corrected one ran 28 tests).
- 2026-08-24: `fireEvent.focus(descendantButton)` DOES reach an ancestor's
  `onFocusCapture` in jsdom + RTL, even though native `focus` does not bubble —
  the capture phase of `dispatchEvent` still walks every ancestor regardless of
  the event's `bubbles` flag, only the bubble phase is skipped. This is what
  makes hover-card components that put `onFocusCapture`/`onBlurCapture` on a
  wrapping anchor (`BlockingReasonsCard`, copied from `FindingsHoverCard`)
  actually keyboard-openable, and it is safe to assert by firing focus directly
  on the real focusable descendant (an `IconBtn`'s `<button>`) rather than on the
  anchor span itself (evidence:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/BriefVerdictStrip.test.tsx`
  "keeps the badge count and the opened list's row count in sync after a
  dismissal (AC-85)" — `fireEvent.focus(control)` where `control` is the
  `IconBtn` button, opens the portal-rendered `role="tooltip"` card).
- 2026-08-23: `@testing-library/user-event` is NOT a dependency of `client/`
  (absent from `package.json`) even though the `react-testing-library` skill's
  own examples import it unconditionally — a test that does
  `import userEvent from "@testing-library/user-event"` fails `pnpm typecheck`
  with TS2307 ("Cannot find module"), not a runtime error, so it surfaces before
  the test even runs. Prove keyboard operability of a native `<button>` instead
  by asserting `element.tagName === "BUTTON"` (native buttons are keyboard
  operable by HTML semantics; jsdom's `fireEvent` does not simulate the
  browser's own Enter/Space-to-click translation for real elements anyway, so
  simulating it would prove nothing even if the package were installed) plus
  `element.focus()` /`toHaveFocus()` for reachability, and use `fireEvent.click`
  for the actual toggle (evidence: `client/package.json` has
  `@testing-library/react` + `@testing-library/jest-dom` but no
  `@testing-library/user-event`; onboarding/_components/SectionCard/SectionCard.test.tsx)
- 2026-08-23: mocking the `mermaid` package's dynamic `import("mermaid")` (as
  `MermaidDiagram.tsx` does) needs `vi.mock("mermaid", factory)` to reference
  its mock functions via `vi.hoisted()` — `vi.mock` factories are hoisted above
  top-level `const` declarations, so a factory that closes over an
  un-hoisted `const parse = vi.fn(...)` throws "Cannot access 'parse' before
  initialization". Once hoisted, the mock functions are MODULE-LEVEL and their
  call counts persist across `it()` blocks in the same file — an
  `expect(mermaidRender).not.toHaveBeenCalled()` in a later test failed on a
  call recorded by an earlier test, not by the code under test in that test;
  fix with `vi.clearAllMocks()` in `afterEach` alongside `cleanup()`. This is
  this repo's first test to mock `mermaid` at all (evidence:
  onboarding/_components/ArchitectureSection/ArchitectureSection.test.tsx;
  client/src/components/mermaid-diagram/MermaidDiagram.tsx:36 `await
  import("mermaid")`)
- 2026-08-23: next-intl's MISSING_MESSAGE fallback RENDERS THE KEY PATH as the
  string (`"agents.context.saveErrorLimit"` appears in the DOM), so a message
  added to the wrong block of a messages file still renders something and still
  satisfies `getByRole("alert")` / `getByText(/Not saved/)`-shaped assertions —
  only an exact-text assertion catches it, and the real signal is an
  `IntlError: MISSING_MESSAGE` line on stderr of an otherwise green-looking run.
  The trap that puts it in the wrong block: `messages/en/agents.json` has three
  `"loadError"` keys and `skills.json` has six, so anchoring a textual insert on
  a key NAME lands in whichever namespace comes first in the file. Anchor on the
  namespace (`  "context": {` … its closing brace) and insert inside that range
  (evidence: client/messages/en/skills.json:191-195 vs the `list` namespace's
  own `loadError` at :13)
- 2026-08-23: RTL's default TextMatch normaliser (trim + collapse whitespace
  runs) also defeats `getByText` for a MULTI-LINE `<pre>` — asserting a prompt
  segment renders "the full text as sent" against a literal `\n`-joined fixture
  never matches, and `toHaveTextContent` collapses it the same way. Pass an
  identity normaliser, `screen.getByText(BLOCK, { normalizer: (v) => v })`, then
  assert `el.textContent).toBe(BLOCK)`; this is the `<pre>` sibling of the
  2026-08-05 `getByDisplayValue` entry below and it bites for the same reason
  (evidence:
  client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.test.tsx
  "labels the segment as untrusted attached specs")
- 2026-08-23: react-markdown v9 dropped the `inline` flag on the `code`
  component, so a `code` renderer CANNOT tell an inline chip from a fenced
  block — adding a `pre` renderer with block styling while `code` keeps the
  chip style double-decorates every code block. The fix that works without
  reaching for `className="language-*"` (absent on fenced blocks with no
  language): a module-level `React.createContext(false)` provided by the `pre`
  renderer and read by a small `MarkdownCode` component, which is the only
  place that knows it is inside a block (evidence:
  client/src/vendor/ui/primitives/Markdown.tsx `BlockCodeContext`)
- 2026-08-23: a URL that `urlTransform` rejects renders as `<a href="">`, and
  `getByRole("link")` does NOT match it — dom-accessibility-api maps an anchor
  with an empty `href` to `generic`, so `getByRole("link", { name: "click" })`
  throws "Unable to find an accessible element" instead of returning the inert
  anchor. Assert a dropped `javascript:` URL with
  `getByText(label)).toHaveAttribute("href", "")` plus a
  `queryByRole("link", …)` negative; the role query alone reads as a false
  green only if you assume the element vanished. Also worth knowing:
  react-markdown v9 already strips `javascript:` through `defaultUrlTransform`,
  so an allowlist prop is about narrowing (http/https only) rather than about
  XSS that would otherwise land (evidence:
  client/src/app/repos/[repoId]/context/_components/ProjectContextView/_components/DocumentPreview/DocumentPreview.test.tsx
  "renders a hostile document inert")
- 2026-08-16: RTL's `getByText` only aggregates an element's DIRECT text-node
  children (`getNodeText` filters `childNodes` for `nodeType === TEXT_NODE`,
  ignoring nested elements), so a stat row built as
  `{t("a")} · {t("b")} · {t("c")}` inside one `<span>` — several ICU-plural
  `t()` results interleaved with literal `" · "` strings — concatenates into
  ONE matchable text and `getByText(/3 endpoints/)` finds it directly; no need
  to fall back to `container.textContent` or split into per-stat spans just to
  assert one plural branch (evidence: BlastRadiusCard/_components/BlastStatsRow/BlastStatsRow.tsx:31-36;
  BlastRadiusCard/BlastRadiusCard.test.tsx "stats row plurals")
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
- 2026-09-01: a message key pointed at the wrong namespace renders the KEY
  ITSELF and throws only to the console — `useTranslations("eval")` with
  `t("legend.recall")` resolved nothing, because the real path is
  `eval.dashboard.legend.recall`. Every test still passed, because they were all
  phrased as absences (`queryByText("RECALL")` is absent whether the label is
  missing or merely wrong). ALWAYS assert the rendered label TEXT positively for
  a component whose labels come from messages, and grep the vitest output for
  `MISSING_MESSAGE` — vitest does not fail on it (evidence:
  client/src/app/evals/_components/EvalAgentRow/EvalAgentRow.tsx
  `METRIC_LABEL_KEYS`; its test now asserts "Recall"/"Precision"/"Citation")
- 2026-08-30: `Error: invariant expected app router to be mounted` after adding `useRouter()` to a shared component — the failure surfaces in EVERY test that renders it transitively, not just its own. Adding `useRouter` to `FindingsPanel` broke `ReviewRunAccordion.test.tsx`, which never mentions the panel by name. Fix: `vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))` in every affected test file — grep the component's importers before adding a navigation hook (evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx; .../ReviewRunAccordion/ReviewRunAccordion.test.tsx)

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-09-01: pr-self-review on the eval-UI slice — 7 auditors, 0 CRITICAL, and
  the WARNINGs were worth the run: a reintroduced `ProgressBar value={percent ?? 0}`,
  four mutation-proven vacuous tests, English wording leaking out of `lib/`, a
  fan-out whose loading state rendered as "no runs yet", and duplicated
  eval.json keys. All fixed and each fix re-proved by mutation before commit.
- 2026-09-01: second slice of the eval redesign — rebuilt `/evals` from a card
  grid into agent rows (model badge, recall sparkline, three metrics, decorative
  chevron) plus a cross-agent `RECENT EVAL RUNS` table fed by a new
  `useEvalSuiteRunsForAgents` fan-out; moved `sparklineSeries` into
  `lib/evals.ts` as `metricTrendSeries`; deleted `EvalAgentCard` after carrying
  its four invariants onto `EvalAgentRow`. 568/568 and typecheck green; verified
  in the running app in both themes.
- 2026-09-01: restored the eval metrics summary into the agent Evals tab and
  reshaped its case rows to the design (status icon, expected/got, severity chip,
  icon actions); widened `MetricCard` with `deltaLabel`; rewrote the two spec
  sections and the three tests that asserted the metrics were absent.
- 2026-09-01: redesigned the per-agent Eval Dashboard to a supplied mockup — turned `/evals/[agentId]` from a `redirect()` into the real page (header with model badge, agent switcher and a client-side 7/30/90/all range filter, regression banner, three `MetricCard`s, a Recharts `LineChart` trend, and a run table with `ProgressBar` metrics), left eval-case CRUD in the agent tab, extracted the shared helpers to `src/lib/evals.ts`, deleted `EvalMetricStrip`/`EvalTrendChart`/`EvalRunList` after carrying their acceptance assertions onto the new components, and widened the vendored `LineChart` and `Checkbox`. Client 534/534 and typecheck green; verified in the running dev app against real seeded runs in both themes.
- 2026-08-31: aligned the eval-pipeline UI to the pre-existing message catalogue — fixed the `evals`→`eval` nav key, built the agent editor's Evals tab from the moved `/evals/[agentId]` composition, turned that route into a redirect, and deleted the three invented message keys that duplicated designed ones. Client 498/498 and both typechecks green; observed in the running dev app (sidebar highlights, console clean on `/evals` and `/agents/:id?tab=evals`, redirect lands).
- 2026-08-31: closed SPEC-04 AC-16 at page scope with `/evals/[agentId]/page.test.tsx`, and AC-68 with `server/test/vendor-mirror-gate.test.ts`.
- 2026-08-30: SPEC-04 eval-pipeline remediation (client half) — restored the AC-44 compare control and moved the compare modal behind it, reshaped the modal around the server's single `prompt_diff`, wired `onOpenEvalCase` from `FindingsPanel` to `/evals/<ownerId>`, and replaced the `?? 0` coercions on nullable eval aggregates with not-computed rendering.
- 2026-08-30: SPEC-04 eval-pipeline test-coverage audit — strengthened the EvalAgentCard, EvalMetricStrip, EvalCompareModal and EvalCaseButton tests, and replaced the tautological AC-44 assertion in EvalRunList.test.tsx with the real disabled-at-each-selection-count walk, which is red because no compare control exists.
- 2026-08-30: T26 of the eval-pipeline plan — built `/evals/[agentId]/page.tsx`
  composing the six wave-3 components with the T21 hooks: case list + editor
  (uncontrolled, remounted via `key={editorTarget}`), metric strip fed the
  latest/second-latest *completed* suite run (not `EvalDashboard.current`/
  `.delta`), trend chart, run list with page-owned selection/cancel state, and
  a compare modal opened only at exactly two selections. `helpers.ts` holds the
  pure snapshot/lookup/mapping functions. Appended two insights on real
  data-sourcing gaps (missing agent-version-snapshot hook; `caseRuns` scoped to
  only the latest suite run) and one on `Modal`'s built-in close control. No
  test file was in this task's `Files:` list, so none was added; `pnpm
  typecheck` clean, `vitest run src/app/evals` 10 files / 35 tests green.
- 2026-08-30: T27 of the eval-pipeline plan — wired `EvalCaseButton` into
  `FindingCard`'s actions row (new optional `onCreateEvalCase`/`onOpenEvalCase`
  props, rendered only when supplied) and made `FindingsPanel` own the
  create-from-finding mutation via `useCreateEvalCaseFromFinding()`. Typecheck
  clean; `FindingCard.test.tsx` and `EvalCaseButton.test.tsx` pass unchanged;
  `FindingsPanel.test.tsx` (9 tests) and `ReviewRunAccordion.test.tsx` (2
  tests) now fail because neither mocks `lib/hooks/evals` — outside T27's
  `Files:` list, reported as blocked rather than edited.
- 2026-08-24: T9 of the blocking-reasons/design-fidelity amendment — rebuilt
  `BriefVerdictStrip` to always render the merge-risk band (AC-83) with the
  review's verdict/score/donut alongside it when a review exists, moved the
  regenerate control and the cost line into the strip (AC-95/AC-96), added the
  `PR Brief` section label to `BriefPanel` (AC-94), and wired the live
  `composeBlockingReasons` count in place of the frozen `run.blockers` (AC-85).
  Appended insights on the plan's own `Verify:` false-green, the
  capture-phase-focus RTL mechanism, and the slot-prop-widening pattern.
- 2026-08-24: L05 PR Why + Risk Brief — appended insights on the two paid
  controls sharing the Overview tab (AC-81), the composed-section duplicate-mount
  hazard from moving `IntentCard`/`BlastRadiusCard` into `BriefPanel`, and the
  bypassed `costLine()` helper in favour of direct `t()` calls for i18n
  ownership. No code changed in this task.
- 2026-08-23: L05 Project Context review fixes — surfaced every attachment
  mutation failure in `DocAttachPanel` as a per-`code` banner (409/400/404/500
  plus an `err.message` fallback), and made the repo scoping explicit: the
  badge and a scope note name the repository the list came from, and an
  unlisted attachment now reads "not in this repo" with a tooltip that offers
  cross-repo, deleted, renamed and beyond-the-cap as causes without asserting
  one; 15 new RTL cases across the panel and the agent tab.
- 2026-08-23: L05 Project Context T10 — one shared `components/doc-attach`
  panel (labels prop, native drag reorder plus the repo's first keyboard
  up/down `IconBtn`s, missing-attachment rows, attached/total badge, debounced
  token footer capped at 20 paths) mounted as a Context tab on both the agent
  and the skill editor; 14 RTL cases.
- 2026-08-23: L05 Project Context T11 — relabelled `runs.trace.prompt.specs` to
  "Project context — attached specs (untrusted)" and added four `TraceBody.test.tsx`
  cases (segment label, full block text as sent, `Specs read` paths in injection
  order, and the segment absent + none state when nothing was injected); no
  component change was needed.
- 2026-08-23: L05 Project Context T8 — `/repos/:repoId/context` page
  (list grouped by category with a `used_by_agents` badge, preview, `?path=`
  selection, not-cloned / no-documents / unreadable / error states, resync with
  last-refresh time), `lib/hooks/context.ts` replacing the dormant
  `useContextFiles`/`useReindexContext`, an opt-in `allowedUrlSchemes` prop plus
  heading/list/table/pre renderers on the vendored `Markdown` primitive, and the
  nav-registry entry (`g d`); 10 RTL cases.
- 2026-08-23: L05 Project Context T6 — mirrored the new `contracts/context.ts`,
  the barrel entry, the `SpecFile` `@deprecated` marker and the `CloneDocsSource`
  port from `server/src/vendor/shared`, and re-exported the eight new types from
  `lib/types.ts`; the `eval-ci.ts` half of the mirror could not be carried
  because the client copy lacks `AgentManifest`.
- 2026-08-16: Blast Radius — distinguished a caller's `kind` ('call' vs
  optional-absent-as-call vs 'type') in `BlastSymbolRow` (muted marker on
  type-kind caller rows) and in the `callerCount`/`stat.callers` wording via a
  new pure `callerLabelKind` helper and a 3-way ICU message set; 5 new
  `BlastRadiusCard.test.tsx` cases + 5 new `helpers.test.ts` cases; spec
  section added to `client/specs/2026-08-16-blast-radius.md`.
- 2026-08-16: T7 Blast Radius client tests — `BlastRadiusCard.test.tsx` (15
  cases: loading/error/empty, singular+plural stat plurals, tree row
  expand/collapse via click and keyboard, Tree↔Graph toggle with graph node
  cap + overflow label, Prior PRs collapsed-by-default, degraded known/unknown
  reason, truncated callers) and `helpers.test.ts` (13 cases: `parseEndpoint`,
  `ellipsize`, `basename`, `formatCron`, `layoutGraph` node placement/caps/dedup).
- 2026-08-10: L03 Smart Diff — role-grouped reviewer-ordered diff in the Files changed tab behind a `?diffOrder=` toggle, per-file findings badges and per-line severity pills joined client-side from `usePrReviews`, boilerplate collapsed, retry-scroll to a target line; widened the shared diff-viewer with four optional props leaving `DiffViewer` untouched; 12 RTL cases; spec client/specs/2026-08-10-smart-diff.md.
- 2026-08-09: L03 Intent Layer — INTENT card on the PR Overview tab (statement, in/out of scope, risk chips, evidence-derived confidence, stale badge, compute/recompute), a BLAST RADIUS placeholder card, and `lib/hooks/intent.ts` treating a 404 as the empty state; spec client/specs/2026-08-09-intent-layer.md.
- 2026-08-05: L02 conventions extractor — `/repos/:repoId/conventions` page (evidence-backed candidate cards, accept/reject/inline edit, scope-prefix re-scan, create-skill modal with update-to-vN mode), promoted the ConfigTab body editor to `src/components/markdown-editor` behind a `labels` prop and `relativeTime` to `src/lib/time.ts`; spec client/specs/2026-08-05-conventions.md.
- 2026-08-04: L02 skills — `/skills` list + 5-tab editor (Config/Preview/Evals/Stats/Versions), file+zip import drawer with preview-before-network, and the agent editor's Skills tab (link + native HTML5 reorder); spec client/specs/2026-08-04-skills.md.
- 2026-08-03: researched ~60 sources and created the `frontend-ui-architecture` skill (code placement + decomposition), splitting that concern out of react-best-practices; benchmarked 100% vs 90% pass rate against a no-skill baseline on 3 eval prompts.
- 2026-08-01: added findings-by-severity counters + click-to-filter on the PR list and PR detail pages (shared SeverityCounts component, `?severity=` URL state, SeverityFilterBar); spec client/specs/2026-08-01-findings-by-severity.md.

## Open Questions
<!-- Unresolved things that need more investigation -->