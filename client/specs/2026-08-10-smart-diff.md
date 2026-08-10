# Spec: Smart Diff (client)

The **Files changed** tab rendered `pr.files` in GitHub's order with no severity
overlay, so a lockfile could outrank the one file that changed behaviour and the
findings sat in a different tab from the lines they describe. This adds a
role-grouped, risk-ordered rendering of the same files, a two-state order
toggle, per-file findings badges and per-line severity pills.

The server spec (`server/specs/2026-08-10-smart-diff.md`) covers classification,
ordering and the endpoint. This spec covers only what the UI does.

## Navigation

No new tab. The existing `?tab=diff` gains a sibling parameter
`?diffOrder=smart|original`, **defaulting to `smart`**, read in `page.tsx` and
threaded into `DiffTab` as `order` / `onOrderChange`.

**Read through a whitelist.** `search.get("diffOrder") === "original" ? … : "smart"`
so a hand-typed `?diffOrder=lol` degrades to Smart rather than rendering nothing.

**Written by a dedicated setter, not the shared `setParam`.** `setDiffOrder` calls
`router.replace(…, { scroll: false })`. That flag is load-bearing: Next's
scroll-to-top competes with in-page targeting, and a reviewer 2,000px down the
diff must not be thrown to the top by flipping the order. The shared `setParam`
keeps scrolling, because a tab switch *should* go to the top.

**Why the URL and not local state.** Every other view decision on this page
already lives there (`?tab=`, `?severity=`, `?finding=`, `?trace=`). Reviewer
order is the same kind of state: shareable as "look at this PR the way I saw it",
survives reload, restorable with the back button.

## Data layer

Two queries, joined in the browser. `usePrSmartDiff(prId)`
(`src/lib/hooks/smart-diff.ts`, modelled on `hooks/intent.ts`) supplies the
groups; `usePrReviews` — already fetched by `page.tsx` and already flattened into
`allFindings` — supplies severity.

`enabled: prId != null`, `retry: false`, and **no `isNotComputed` equivalent**: a
404 here means the PR is not addressable, not "not computed yet", and any error
falls back to the original order.

**Severity is joined client-side rather than added to the contract.** The
contract's `finding_lines: number[]` carries line numbers but no severity and no
count. The severity is already in the browser, on `FindingRecord`, being rendered
by the Findings tab one component away. Putting it in the contract instead would
ship a strictly poorer copy, cost a hand-synced two-file mirror edit with no
automated equality check, and go stale the moment a reviewer dismisses a finding —
whereas the client join invalidates with `["reviews", prId]`. So `finding_lines`
stays the server's signal (ordering and auto-expand, correct even before the
reviews query resolves) and the client join supplies the pill colour and the
badge count.

**Every import from `@devdigest/shared` is `import type`.** A type-only import is
erased, but the first *value* import drags the vendored barrel into webpack and
can break `next build` alone (`client/INSIGHTS.md`). `ROLE_ORDER` is therefore a
locally declared `["core","wiring","boilerplate"] as const`, **not**
`SmartDiffRole.options`.

## Layout

**Component:** `DiffTab`
**Behavior:** keeps its `SectionLabel` as the single header and hangs
`DiffOrderToggle` in the `right` slot beside the existing show/hide-comments
button. Renders `SmartDiffViewer` when `order === "smart"` and the **untouched**
`DiffViewer` otherwise, passing the same `commenting` object down both paths so
inline commenting works identically in either order.

## Component: SmartDiffViewer

Colocated at `DiffTab/_components/SmartDiffViewer/`, not promoted to
`src/components/` — one caller today, and premature promotion is this module's
recorded default failure (`client/INSIGHTS.md`).

**Behavior:** renders a summary line (`{files} files · +{additions} −{deletions}`),
the `too_big` banner reusing the pre-existing `largeTitle` / `largeBody` keys, a
caption when overlays are active, then one `SmartDiffGroup` per non-empty role in
`ROLE_ORDER`. Owns the `target` state and the retry-scroll effect. `patchByPath`,
the scoped findings and the per-file grouping are each built once in `useMemo`.

**Overlays are scoped to the newest review.** `latestReviewFindings` takes the
`review_id` of the first finding in the flattened list — the newest review that
produced any — then drops dismissed ones. Filtering in that order matters: a
review whose findings are *all* dismissed yields empty overlays, which is exactly
what the server does, so a badge count can never contradict `finding_lines`. The
tab counter still shows all runs, so a one-line caption says which review the
overlays come from.

**States:**

| Condition | Render |
|---|---|
| `isError` | `smartDiff.unavailable` above a full `DiffViewer` fallback |
| `!data` (loading) | `DiffViewer` in the original order — never a spinner in place of the diff |
| zero files across all groups | `smartDiff.empty` |
| otherwise | summary, optional banner, optional caption, the groups |

A Smart Diff failure must never take the Files-changed tab down with it.

## Component: SmartDiffGroup

**Behavior:** a header of coloured dot, bold `smartDiff.<role>Label`, italic
`smartDiff.<role>Subtitle` and a right-aligned `smartDiff.filesCount`, over a
list of `FileCard`s. `role="region"` with an `aria-label` of the role label, which
is also what the tests assert group order on.

A file present in the response but absent from `pr.files` still renders, with a
synthetic `patch: null` — the response is the source of truth for *which* files
exist, `pr.files` only for their patch text.

## The shared diff viewer gained four optional props

`src/components/diff-viewer` is already shared, so it stays shared and every
addition is optional. `DiffViewer.tsx` passes none of them and is untouched.

**`FileCard`** takes `defaultOpen`, `findings`, `target` and `onFindingsClick`.
The open-state initializer became `defaultOpen ?? (…AUTO_EXPAND_MAX_LINES)` —
`??` and not `||`, so an explicit `defaultOpen={false}` actually collapses a
*small* boilerplate file. With all four absent, `undefined ?? heuristic`
reproduces the previous behaviour exactly, which is what makes the Original-order
path provably unchanged.

`defaultOpen` also needs a companion effect, because it is only read at mount and
a target can arrive later: `target.path === file.path → setOpen(true)`, keyed on
`nonce` so a repeat click on the same target re-fires. `open` stays uncontrolled —
a controlled pair would force the viewer to own N booleans and would re-collapse
a card the reviewer deliberately opened.

**A findings file with a null patch stays collapsed.** `shouldDefaultOpen` returns
`hasPatch` for a findings-bearing file, so expanding never reveals an empty body;
the badge still shows and the findings stay reachable in the Findings tab.

**`lineRowFor` is the only styling seam that reaches every diff row.** It
previously set no border property at all, so it took a second parameter:
`lineRowFor(kind, accent?)`, always emitting
`borderLeft: 3px solid ${accent ?? "transparent"}`. Always-emitting is
deliberate — a conditional border would both mix a shorthand across renders
(`client/INSIGHTS.md`) and shift the row 3px whenever a pill appeared. The cost is
a uniform 3px transparent gutter on every diff row in both orders, which is
consistent rather than jittery.

**`CodeLine`** takes `severity` and `anchor`, sets
`data-diff-line="<path>:<newNo>"`, and renders a `SeverityBadge`
right-aligned by `marginLeft: auto` inside the existing flex row.

**Line matching uses the new side only.** `groundFindings` grounds against
`newLineNumbers`, so a `del` line has no `newNo` and gets no pill — correct, since
a finding cannot be about a removed line.

**The pill is not `compact`.** `SeverityBadge`'s `compact` variant renders the icon
*without* its label, which would leave colour and a glyph as the only signal and
contradict the primitive's own "never colour alone" comment. The full variant
carries the text the screenshot shows.

## Click a pill, land on the finding

The severity pill is a button that navigates to the finding's detail block on the
Agent runs tab. It reuses machinery that already existed and was only reachable
from the PR *list* page: `?tab=findings&finding=<id>`, which `page.tsx` reads into
`targetFindingId`, `ReviewRunAccordion` uses to force its run open, and
`FindingsPanel` uses to retry-scroll to `[data-finding-id]`. Nothing new was
built for the landing side — `FindingsHoverCard` pushes the identical URL.

**The badge and the pill do different things, deliberately.** The `N findings`
badge expands the file *in place* (you are triaging the diff); the line pill
*leaves* for the finding's full rationale and suggestion (you are reading one
finding). Two affordances, two intents, no modal in between.

**A line can carry several findings, so the pill links to the worst one** — the
same one whose colour is already on screen. `findingByLine` therefore holds
`{ severity, id }` rather than a bare severity, so the colour and the link target
can never disagree. Ties at equal severity go to the first finding encountered.

**`router.push`, not `replace`.** This is a cross-tab jump, so Back must return to
the diff at the order and scroll position the reviewer left. `{ scroll: false }`
because `FindingsPanel` owns the landing position.

`onFindingOpen` is optional the whole way down (`FileCard` → `CodeLine`), so
without it the pill renders as plain non-interactive text — which is what the
`DiffViewer` original-order path gets, and what the test pins.

Known gap: `FindingsPanel` scrolls only to a finding present in its `shown` list,
so a target hidden by the low-confidence toggle or an active severity filter still
opens its accordion but does not scroll.

## Severity typing

`SEV` (`vendor/ui/primitives/tokens.ts`) is the only non-drifted severity→colour
map and is keyed by the **4-value** UI `Severity` (it adds `INFO`);
`FindingRecord.severity` is the **3-value** shared type. Every map, counter and
prop here is typed off the shared type and indexes `SEV` with it, a safe superset.
Every raw string goes through `parseSeverity`, which returns `Severity | null`, so
an unknown value yields no pill instead of `SEV[undefined].c` throwing the row.

Worst-severity-wins per line uses `severityRank`, where **lower is worse**
(`CRITICAL` is index 0) — the comparison is `<`, not `>`.

## i18n

The orphaned `prReview.smartDiff.*` namespace is now consumed, with
`coreLabel` changed from "Core" to "Core logic" (zero previous consumers, so
nothing regresses) and twelve keys added: the three role subtitles,
`sectionLabel`, `summary`, `orderAriaLabel`, `orderSmart`, `orderOriginal`,
`splitTitle`, `latestReviewOnly`, `empty`, `unavailable`.

`shell.diffViewer.findingsBadge` is added rather than a `prReview` key, because
`FileCard` is a shared component that reads the `shell` namespace; routing a
`prReview` key into it would mean changing its namespace or threading a label
prop. `−` in `summary` is U+2212, matching `FileCard`.

## Click to line

Copied from `FindingsPanel` verbatim, because it is the only pattern here that
works: an **instant** `scrollIntoView({ block: "center" })` retried up to 12
times at 120ms until `getBoundingClientRect()` proves visibility, aborting on
`wheel` / `touchstart` / `keydown`, with full cleanup.

`behavior: "smooth"` is dropped while a card is still expanding, and the app
scrolls `<main>` rather than the window, so `window.scrollY` is useless for
diagnosis. The effect falls back from `[data-diff-line]` to `[data-diff-file]`, so
a file whose findings all landed on removed lines still has an anchor.

## Tests

`SmartDiffViewer.test.tsx` — 12 cases, `usePrSmartDiff` module-mocked so no fetch
is needed, wrapped in `NextIntlClientProvider` with the **real** imported
`prReview.json` and `shell.json` (a missing key fails the test), group-order
assertions in both themes: role order and subtitles, a findings file expanded and
badged, boilerplate collapsed, a pill on the matching line, **no** pill for a
finding at line 9999 of a 20-line patch, no pill for `severity: "INFO"`, a
null-patch findings file collapsed but badged, the error fallback, badge-click
force-open, the split banner, and latest-review scoping.

Always `fireEvent.click`, never `element.click()` — a raw DOM click does not flush
React state, so a state-transition assertion passes vacuously
(`client/INSIGHTS.md`).

## Out of scope

Virtualisation — `DiffViewer` has the same characteristic today and only
findings-bearing files with a patch force open. A `?review=<id>` selector.
Reconciling the tab's all-runs counter with the latest-review badges beyond the
caption. Persisting the chosen order per user rather than per URL. The
"What this does" pseudocode row, which needs an LLM call the endpoint does not
make.
