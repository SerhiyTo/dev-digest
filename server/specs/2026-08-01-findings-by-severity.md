# Spec: Findings by severity (server)

Serve a per-PR severity breakdown on the PR-list endpoint so the UI can show
`⊘3 ⚠5 ⚡2` per row and filter by level. The PR **detail** page needs no server
change — `GET /pulls/:id/reviews` already returns every finding.

Counts tally **active** findings only: `findings.dismissed_at IS NULL`. A
dismissed finding still exists and still renders on the detail page; it just
does not inflate the counters.

## `rollupSeverities`

**Component:** `src/modules/pulls/status.ts`
**Behavior:** the helper already existed (pure, unit-tested) but was never
called. Its return is re-keyed from `{critical, warning, suggestion}` to the
contract's `Record<Severity, number>` (`CRITICAL` / `WARNING` / `SUGGESTION`)
so the route needs no mapping layer. Unknown severity strings are ignored —
`findings.severity` is plain `text` with no DB enum or CHECK, so a row written
by an older/looser path must not throw.

New sibling `foldSeverityRows` accumulates pre-grouped
`{ severity, n }` rows into the same shape (the route aggregates in SQL, not
in JS, so it never loads finding rows).

## `PrMeta.findings_by_severity`

**Data:** canonical in `src/vendor/shared/contracts/platform.ts`, mirrored to
`client/src/vendor/shared/contracts/platform.ts` in the same commit.

```ts
findings_by_severity: z
  .object({ CRITICAL: z.number().int(), WARNING: z.number().int(), SUGGESTION: z.number().int() })
  .nullish()
```

`.nullish()` and object-keyed (not an array) to match the existing
`findings_by_severity` precedent in `contracts/observability.ts`.

## PR-list aggregate

**Component:** `src/modules/pulls/routes.ts` (`GET /repos/:id/pulls`)
**Behavior:** one `COUNT(*) … GROUP BY pr_id, severity` over `findings`
INNER JOINed to `reviews` (findings carry no `pr_id`), filtered to the listed
PR ids and `dismissed_at IS NULL` — the same one-IN-query + JS Map shape as the
existing score and cost aggregates.

NULL-preserving, gated on the same "has a review" signal that drives `score`:
- PR never reviewed → `null` → UI renders "—"
- PR reviewed, nothing found (or everything dismissed) → `{0, 0, 0}`

Never `?? 0` on the unreviewed branch — that fabricates "reviewed, clean".

Counts span **all** of the PR's reviews (every agent, every re-run), matching
the detail page's aggregate. This deliberately differs from `score`, which is
latest-review-only.

## `findings` index

**Data:** `index('findings_review_id_severity_idx').on(reviewId, severity)`
in `src/db/schema/reviews.ts`, generated into a new numbered migration via
`pnpm db:generate` (never hand-written). `findings` had no index at all; the
new aggregate joins on `review_id` and groups by `severity`.
