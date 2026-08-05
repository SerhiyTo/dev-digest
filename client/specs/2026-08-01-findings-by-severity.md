# Spec: Findings by severity (client)

Severity counters on both PR surfaces, doubling as the filter control:
`3 CRITICAL · 5 WARNING · 2 SUGGESTION`, click a level → only that level.

Rules that hold everywhere:
- Counters tally **active** findings (`dismissed_at == null`). Dismissed
  findings still render in the list — they just aren't counted.
- **Single-select toggle.** Click a level → only it. Click it again → all.
  Click another → switch.
- Filter state lives in the URL as `?severity=CRITICAL|WARNING|SUGGESTION`,
  alongside the existing `?tab=` / `?status=`. An unrecognised value is
  ignored (= no filter), so a hand-typed URL degrades gracefully.
- Colour + icon come from `SEV` in `vendor/ui/primitives/tokens.ts`. No new
  severity→colour map. Never colour alone — every counter carries an
  `aria-label` naming the severity (WCAG AA, per `vendor/ui/primitives/Badge.tsx`).

## `severity` helpers

**Component:** `src/lib/severity.ts`
**Behavior:**
- `SEVERITIES` — `["CRITICAL", "WARNING", "SUGGESTION"]`, display order.
- `parseSeverity(raw)` — URL param → `Severity | null`.
- `emptySeverityCounts()` / `countActiveBySeverity(findings)` — client twin of
  the server's `rollupSeverities`; skips `dismissed_at != null`.
- `countsByRunId(reviews)` — `run_id → counts`, for the timeline.

## `SeverityCounts`

**Component:** `src/components/severity-counts/` (shared — used by both route
trees)
**Data:** `Record<Severity, number> | null | undefined`
**Behavior:** the compact `⊘2 ⚠1` cluster. One button per **non-zero** level;
all-zero → muted `0`; `null`/`undefined` (never reviewed) → muted `—`. Active
level gets the accent + dotted underline treatment. `onSelect` fires with the
severity; clicks `stopPropagation()` so a counter inside a clickable PR row or
accordion header does not also navigate/expand. Read-only (no `onSelect`) →
renders spans, not buttons.

## PR detail — aggregate filter bar

**Component:** `app/repos/[repoId]/pulls/[number]/_components/SeverityFilterBar`
**Data:** counts derived from `usePrReviews` → all runs' findings
**Behavior:** a row of `Chip`s directly under the "Review runs" section label.
All three levels always shown (this is the "how bad is this PR" summary);
zero-count levels are disabled. Hidden when the PR has no runs.

## PR detail — per-run counters

**Components:** `.../RunHistory` (TIMELINE rows), `.../ReviewRunAccordion`
(header)
**Data:** `countsByRunId(reviews)` / `review.findings`
**Behavior:** replaces the flat "N findings" text with `<SeverityCounts>` +
the existing `· N blockers` suffix. Clicking a level sets the same page-wide
filter. Runs with no review row (running / failed / cancelled) are unchanged —
no counts exist for them.

## PR detail — filtering

**Component:** `.../FindingsPanel`
**Behavior:** `visibleFindings(findings, hideLow, severity)` narrows by
severity before the existing sort. `focusIdx` resets to 0 whenever the filter
changes — otherwise `j/k` and the `a`/`d` shortcuts target an out-of-range
finding.

## PR detail — run visibility while filtering

**Components:** `.../FindingsTab`, `.../ReviewRunAccordion`
**Behavior:** with a severity active, the reader should never have to hunt for
the matches.
- Runs with no finding at that severity are **hidden**, replaced by a
  `N agent runs hidden — no {severity} findings · Show all` line so the
  omission is visible and one click reverses it.
- Every remaining run **auto-expands**, so matches are on screen immediately.
  Applied both on mount (`defaultOpen`) and on filter change (an effect), since
  a run that stays mounted keeps its own open state. Clearing the filter does
  not re-collapse anything — no surprise collapse of something the reader
  opened.
- Hiding, auto-expanding, and what `FindingsPanel` renders all share one
  predicate — `hasFindingAtSeverity` in `src/lib/severity.ts`, which matches on
  severity **regardless of dismissal**. Using the counters' active-only rule
  here instead would hide a run whose only match is dismissed while the panel
  would still render it.
- If no run matches (reachable only via a hand-typed URL, since zero-count
  chips are disabled), the section shows the filter `EmptyState`.

## PR list — FINDINGS column

**Component:** `app/repos/[repoId]/pulls/_components/PRRow`
**Data:** `PrMeta.findings_by_severity` (`GET /repos/:id/pulls`)
**Behavior:** new column between Score and Status. Grid track (`GRID`),
`COLUMN_KEYS`, and the positional cell in `PRRow` change together. Never
reviewed → muted "—".

## PR list — findings hover card

**Component:** `app/repos/[repoId]/pulls/_components/FindingsHoverCard`
**Data:** lazily fetched from `GET /pulls/:id/reviews` via
`usePrReviews(prId, { enabled: open })` — the list endpoint carries counts
only, and nothing is requested until the pointer actually rests on the
counters. TanStack Query caches it, so a second hover is instant.
**Behavior:** hovering the Findings cell opens a card listing every finding
(worst severity first): severity icon, title, category, `file:line` linked to
the pinned GitHub blob, confidence, and a 2-line rationale.
- 220 ms hover-intent delay; stays open while the pointer is over the card;
  closes on Escape or on the page behind it scrolling — but NOT on the card's
  own scroll, or its overflowing tail would be unreachable.
- Portalled and fixed-positioned; flips above the anchor near the fold and
  clamps to the viewport so the table never clips it.
- Disabled for never-reviewed PRs.
- Each row is a button: click (or Enter/Space) navigates to
  `/repos/:repoId/pulls/:number?tab=findings&finding=<id>`.

## PR detail — deep link to one finding

**Components:** `.../page.tsx` (`?finding=`), `.../ReviewRunAccordion`,
`.../FindingsPanel`
**Behavior:** the accordion holding that finding opens, the card scrolls to
centre and is marked focused. Navigation uses `{ scroll: false }` so Next's
scroll-to-top doesn't compete, and the scroll is an **instant** one retried
until `getBoundingClientRect()` confirms the card is in view (bounded, and
abandoned the moment the reader scrolls). A single smooth `scrollIntoView`
was unreliable — it gets dropped while the accordion is still expanding.

## PR list — filtering

**Components:** `app/repos/[repoId]/pulls/page.tsx`, `.../FilterBar`
**Behavior:** clicking a level adds `?severity=` and keeps only PRs with ≥1
active finding at that level, composing with the existing `?status=` filter.
`FilterBar` renders a dismissible chip while the filter is on — otherwise it
is only clearable by re-clicking the exact counter that set it, which may be
the last row left.
