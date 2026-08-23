# Spec: Blast Radius (client)

The PR Overview tab shipped with a two-card grid whose right-hand cell was a
placeholder: `BlastRadiusCard` rendered a `SectionLabel` over an `EmptyState`
and fetched nothing (`client/specs/2026-08-09-intent-layer.md:84-90`). It
existed so the grid had the shape the design called for, not because it had
anything to say.

This replaces it with the real card: the map of what else a diff can reach —
which symbols it declares, who calls them, which HTTP endpoints and cron jobs
sit behind those callers, and which earlier PRs touched the same files.

The server side is a separate document
(`server/specs/2026-08-16-blast-radius.md`); this one covers only what the
browser does with the payload.

## Navigation

**No new route, no new query parameter.** The card lives in the existing
`?tab=overview` grid alongside `IntentCard`. Tree-vs-Graph is `React.useState`
inside the card, deliberately **not** URL state — unlike `?diffOrder=`
(`client/specs/2026-08-10-smart-diff.md:12-31`), which is shareable because
"look at this PR the way I saw it" is a real request about a whole page. Which
of two renderings of one card you last looked at is not; putting it in the URL
would add a parameter to every shared PR link to no one's benefit.

## Data layer

One query. `usePrBlastRadius(prId)` (`src/lib/hooks/blast.ts`, modelled on
`hooks/intent.ts`) fetches `GET /pulls/:id/blast-radius` and returns the whole
`BlastRadiusResponse` — symbols, callers, roll-ups, history and the degraded
flags in one payload. The card renders from that alone; nothing is joined
client-side.

**A 404 is a real error here, not an empty state.** This is a deliberate
divergence from `hooks/intent.ts`, whose `isNotComputed` helper treats 404 as
"not derived yet" and shows a *Compute* button. Intent is an LLM artifact that
may genuinely not exist; blast radius is deterministic, free, and always
computable, so the server returns **200 with `degraded: true`** for an
unindexed repo and reserves 404 for a PR id that does not resolve. The hook
therefore ships **no `isNotComputed` equivalent**, and a 404 falls through to
`ErrorState`.

`retry: false` (an error is a real error, not a flake worth re-billing) and
`staleTime: 60_000` — the answer only moves when the repo is re-indexed or the
PR gets new commits, so re-fetching on every remount is waste.

**Every import from `@devdigest/shared` is `import type`.** A type-only import
is erased before bundling; the first *value* import drags the vendored barrel
into webpack and can break `next build` while `typecheck` and `test` stay green
(`client/INSIGHTS.md`). The known-sets this card needs — `DEGRADED_REASONS`,
`PR_STATUS_NOTES`, `METHOD_TOKEN` — are therefore locally declared in
`constants.ts`, never derived from a Zod enum's `.options`.

## Layout

```
BlastRadiusCard/
  BlastRadiusCard.tsx        states + view state; SectionLabel(icon="Workflow")
  constants.ts               METHOD_TOKEN · METHOD_FALLBACK · CRON_TOKEN
                             DEGRADED_REASONS · PR_STATUS_NOTES
  helpers.ts                 basename · ellipsize · parseEndpoint · formatCron
                             layoutGraph + graph geometry
  styles.ts  index.ts
  _components/
    BlastStatsRow/           "5 symbols · 6 callers · 3 endpoints · 1 cron job"
    BlastViewToggle/         Tree | Graph
    BlastSymbolList/         downstream[] → rows
    BlastSymbolRow/          collapsible symbol + caller lines + badges
    BlastImpactBadges/       endpoint + cron pills
    BlastGraph/              inline SVG
    PriorPrsSection/         collapsed history
```

The card takes `{ prId, repoFullName, headSha }`. `page.tsx` already computed
`repoFullName` for the *View on GitHub* link (`page.tsx:100`) and already holds
`pr.head_sha`, so `OverviewTab` threads both through rather than re-deriving
them.

**`BlastViewToggle` is a local copy of `DiffTab/_components/DiffOrderToggle`,
not an import.** Feature-to-feature imports are forbidden by this module's
placement rules, and the promotion rule is a *second unrelated caller* — a
segmented control used by exactly two features, each with its own labels and
its own `role="tablist"` aria-label, has not earned `src/components/`. The copy
carries over one non-obvious detail from its source's `styles.ts`:
`borderWidth: 0` + `borderStyle: "none"` rather than `border: "none"`, because
mixing a CSS shorthand with one of its longhands in a state-dependent style
function makes React log on every toggle (`client/INSIGHTS.md`).

There is **no `Collapsible` primitive** in `@devdigest/ui`, so both disclosures
are hand-rolled the way `ReviewRunAccordion` and `diff-viewer/FileCard` already
do it: `useState` + `role="button"` + `tabIndex={0}` + `aria-expanded` +
`onKeyDown` for `Enter` and `" "` + a chevron rotated by a `chevronFor(open)`
style function.

## Component: BlastSymbolRow

The tree row. `Icon.Code` + the symbol name + the changed file's basename on the
left, the caller count on the right, a chevron only when there is something to
expand.

**`()` is appended only for `kind` in `{function, method}`.** A blast row can
name a class, a type or a const, and rendering `PaymentConfig()` would assert a
call signature that does not exist.

**Zero-caller symbols render, but are inert.** They keep their row — a symbol
vanishing between the `N symbols` stat and the list below it reads as a bug —
and show `no callers` via the `=0` branch of the `callerCount` ICU message. They
get **no** `role="button"`, **no** `tabIndex`, **no** `aria-expanded` and no
chevron: a focusable element that does nothing when activated is a keyboard
trap, and an `aria-expanded` that never changes is a lie to a screen reader.

Expanded, each caller is `Icon.CornerDownRight` + `file:line` + the enclosing
symbol name. When `repoFullName` and `headSha` are both present the path becomes
a `MonoLink` to `githubBlobUrl(...)` (`src/lib/github-urls.ts`) — reusing the
helper the findings panel already uses, so no new URL-building code exists — and
degrades to plain mono text when either is missing.

**The enclosing caller name is never treated as a function.** `repo-intel`'s
`enclosingFromRows` falls back to the file's basename when it cannot resolve a
symbol, so `caller.name` is legitimately sometimes `"routes.ts"`. It is rendered
as a muted label, never with `()`.

## Component: BlastGraph

A bipartite left-to-right SVG: changed symbols on the left, **distinct caller
files** on the right. Collapsing per-caller rows into per-file nodes is what
keeps a twenty-caller diff readable; the Tree view is where the per-line detail
lives.

Geometry is a pure function — `layoutGraph(downstream)` in `helpers.ts` returns
`{nodes, edges, width, height}` and is unit-tested independently of React. The
SVG uses `viewBox="0 0 320 {height}"` with `width: 100%` so it scales into the
`minmax(320px, 1fr)` grid cell without a resize observer.

**Labels are truncated in JavaScript, not in CSS.** SVG has no `text-overflow`,
so `text-overflow: ellipsis` would silently do nothing and long paths would run
out of the card. `ellipsize(label, 20)` does it, with the untruncated string in
a child `<title>`.

**Overflow is stated, never silent.** Past `MAX_GRAPH_SYMBOLS`/`MAX_GRAPH_FILES`
the layout emits an explicit `+N more` node rather than quietly dropping rows.

### Accessibility: the graph is a presentation, the tree is the source

The `<svg>` is `role="img"` with an `aria-label` naming the counts, plus a
`<title>` and a `<desc>` carrying the server's `summary`. **Nodes are
deliberately not focusable.** Making a dozen `<rect>`s tabbable would put a
keyboard user through a tab-stop gauntlet in which nothing can be activated —
strictly worse than skipping the figure. Below the graph, `graph.hint` points at
Tree, which carries identical data, is fully keyboard-navigable, and is the
default view. That is the honest arrangement: the graph is an alternative
*rendering* of data the accessible view already presents in full.

## Component: PriorPrsSection

Collapsed by default — it answers a follow-up question ("has anyone been here
before?"), not the card's primary one. Each row is `#{pr_number}`, the title,
the author, `relativeTime(merged_at)` and a status badge, plus
`history.overlap` pluralised over `files_overlap.length` with the full path list
in a `title` attribute.

**`merged_at` is an approximation and the UI is built so it cannot lie.**
`pull_requests` has no `merged_at` column, so the server maps
`updated_at ?? opened_at` and carries the true state in `notes`
(`server/specs/2026-08-16-blast-radius.md`). The badge renders `notes`, so an
open PR is labelled *open* next to its relative time; the date is only ever a
recency hint, never a claim that a merge happened.

## Both open strings from the server are guarded

`reason` and `notes` are plain `string` in the contract, and **next-intl throws
on a missing message key**. A new `DegradedReason` added server-side would
therefore become a client-side render crash, in the exact situation where the
feature is already degraded.

Both go through a known-set in `constants.ts` with an explicit fallback:
`DEGRADED_REASONS` (six values) → `degraded.reason.unknown`, and
`PR_STATUS_NOTES` (the six `PrStatus` values) → `history.status.unknown`. A test
feeds an unrecognised reason and asserts the card renders without throwing.

## The server's `summary` is never rendered as UI

`BlastRadiusResponse.summary` is an English sentence built on the server for MCP
and LLM consumers. Rendering it would bypass next-intl and put untranslated text
on the page, so the card builds every visible string from `blast.json` messages
and counts. Its one use is inside the SVG `<desc>`, which is not visible copy.

## i18n

Everything lives in the `blast` namespace. `client/messages/en/blast.json`
already existed as an **orphan** — it was pre-seeded with `stat.*`, `view.*`,
`callerCount`, `noDownstream` and `graph.*`, and `grep` confirmed no source file
called `useTranslations("blast")`. It loads automatically via the `readdirSync`
merge in `src/i18n/request.ts`, so nothing had to be registered.

Because nothing read it, **repurposing `stat.*` cost nothing**. They were bare
nouns (`"symbols"`); they are now count-bearing ICU plurals:

```json
"symbols": "{count, plural, one {# symbol} other {# symbols}}"
```

The plurals were written up front rather than after review, which is the
mistake the module already made once — a `getByText("1 findings")` assertion
locked a missing plural into a suite (`client/INSIGHTS.md`). `callerCount`
additionally carries an `=0 {no callers}` branch so a zero-caller row needs no
special-casing in the component.

**Three keys were deleted:** `brief.block.blast`, `brief.blast.comingSoon` and
`brief.blast.comingSoonHint`. A `grep` across `src/` and `e2e/` proved the stub
card was their only reader. An i18n message key in a single-locale app, with no
export and no consumer outside the component being rewritten, is not a shared
boundary, so `deprecation-policy`'s marker-and-window process does not apply —
the keys go in the same change that stops reading them.
`brief.block.{intent,risks,history}` and `brief.overlap` were left alone; they
belong to the future full PR Brief.

## Badge colours

`SEV`/`CAT` have no HTTP-method token, so `METHOD_TOKEN` is a local map. GET,
HEAD, OPTIONS and POST are accent-coloured, matching the design mock, which
shows GET and POST identically; PUT/PATCH are warn and DELETE is crit, adding
signal where the mock is silent about methods it never displays. Anything
unparseable falls back to `METHOD_FALLBACK` rather than throwing.

`parseEndpoint("GET /api/public/items")` splits on the first space; the server's
`extractEndpoints` always emits `"METHOD /path"` with an uppercase verb, so the
regex is anchored to that. `formatCron` strips the `job:` prefix that
`extractCrons` puts on background-job kinds.

## States

| Condition | Render |
|---|---|
| `isLoading` | three `Skeleton` bars, matching `IntentCard` |
| any error, 404 included | `ErrorState` + retry → `refetch` |
| `changed_symbols` empty | `EmptyState` (icon `Workflow`) |
| symbols present, no callers | stats row + `noDownstream` line |
| `degraded` | full render **plus** a `partial` badge in `SectionLabel`'s `right` slot |
| `truncated` | the stats row switches to the `20+ callers` form |

The degraded badge is wrapped in a `<span title=…>` because `SectionLabel`
accepts only `children`, `icon` and `right` — it has no `title` prop, and
passing one is a `tsc` error (`client/INSIGHTS.md`).

Degraded is **not** an error state. The data on a partially indexed repo is
real, just incomplete, so it renders normally and the badge explains the gap on
hover. Hiding it behind an error screen would throw away correct information.

## Tests

`BlastRadiusCard.test.tsx` — 15 cases. `vi.mock("@/lib/hooks/blast")`, a local
`renderWithIntl` importing the **real** `messages/en/blast.json` (so the tests
also guard the ICU syntax), and a `["dark","light"]` theme matrix.

Covered: loading skeletons; `ErrorState` retry wiring; the empty branch; **both**
ICU plural branches independently (singular *and* plural — a suite that only
ever sees the plural is how "1 crons" ships); expand and collapse by click;
expand by `Enter` and by `Space`; the Tree↔Graph switch including `aria-selected`
movement and the appearance of `getByRole("img")`; the graph node cap plus its
`+N more` label; Prior PRs collapsed by default; a known degraded reason showing
its mapped title; an **unknown** reason falling back without throwing; and the
`truncated` treatment.

`helpers.test.ts` — 13 pure cases over `parseEndpoint` (valid, method-less,
garbage), `ellipsize`, `basename`, `formatCron` (including the `job:` form) and
`layoutGraph` (coordinates, both caps, the overflow node, and edge dedup when
two callers share a file).

**`fireEvent`, never `element.click()`.** A raw DOM click runs outside `act()`
and does not flush React state, so every expand/collapse and tab-switch
assertion would fail with "Unable to find …" — the module has paid for this once
already (`client/INSIGHTS.md`).

## Caller kind: call vs type usage

`BlastCaller` gained an optional `kind: 'call' | 'type'` server-side
(`server/specs/2026-08-16-blast-radius.md`), mirrored byte-identically into
`client/src/vendor/shared`. Real data for PR #44 showed the omission this
closes: `SalaryTripItem` — an interface — had four "callers" that were all
type references (`Table.vue`'s prop type, a return-type annotation, a record
type, a function's return type), and calling that "4 callers" asserted
something false. Nothing calls a type.

**`kind` is optional and absence means `call`**, not "unknown" — legacy rows
(and, in practice, any row from before the server started recording it) render
exactly as they did before this change. `callerLabelKind(callers)` in
`helpers.ts` is the single pure decision point: every caller `'call'` or
absent → `'call'`; every caller `'type'` → `'type'`; anything else → `'mixed'`.
An empty caller list also resolves to `'call'`, since the zero-caller branch of
`callerCount.call` (`=0 {no callers}`) already existed and needed no new
wording.

**Per-row marker, not a second visual channel on the graph.** `BlastSymbolRow`
renders a muted `Badge` reading `type` next to a caller line whose own
`kind === 'type'`; a `'call'` row is untouched. `BlastGraph` was deliberately
left alone — the accessibility contract already established for this card
(`## Component: BlastGraph` above) is that the graph is a summary and Tree
carries the full data, so a second visual channel there would duplicate a
decision already made rather than add one.

**Three ICU messages replace one.** `blast.callerCount` was a single message
with an `=0` branch; it is now `callerCount.{call,type,mixed}`, selected by
`callerLabelKind` and looked up with a template key
(`t(\`callerCount.${labelKind}\`, …)`), the same dynamic-key pattern already in
use for `degraded.reason.${reasonKey(...)}`. `call` keeps its `=0 {no callers}`
branch and its exact prior wording (`# caller` / `# callers`) so the design
mock's collapsed state is unchanged; `type` reads `# type usage` / `# type
usages`; `mixed` reads `# usage` / `# usages` — no "call" or "type" claim once
a symbol's callers actually disagree.

**The top stats row can't make the same call.** `blast.stat.callers`
aggregates every downstream caller across every changed symbol, so it is
routinely mixed even when no single symbol is. It now reads the neutral `# usage`
/ `# usages`, and `statTruncated.callers` follows it (`{count}+ usages`) for the
same reason — a truncated aggregate has even less claim to being all calls.

## Out of scope

- Deep-linking a symbol or a caller (`?blastSymbol=`), and cross-linking a
  caller line into the Files-changed tab — the callers are usually *outside* the
  diff, so there is no line to land on.
- Rendering `PrBrief` as a whole; this card is one block of it (L05).
- Any write action — the card is read-only, and blast radius costs nothing to
  recompute, so there is no *Recompute* button to mirror `IntentCard`'s.
- e2e coverage: no `e2e/specs/*.flow.json` touches the Overview tab today, and
  none was added.
- Per-method badge colours for verbs the design never shows were chosen, not
  designed — worth a designer's eye before they mean anything.
