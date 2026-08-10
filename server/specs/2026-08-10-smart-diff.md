# Spec: Smart Diff (server)

A reviewer opening **Files changed** gets `pr.files` in GitHub's order, so
`package-lock.json` (+92 −24) can sit above the one middleware file that
actually changed behaviour. Attention is spent on generated noise before it
reaches the substance, and after a Run Review the findings live in a different
tab from the lines they describe.

Smart Diff sorts a PR's changed files by review risk. It classifies each file as
`core`, `wiring` or `boilerplate` **from its path alone**, orders
findings-bearing files first, and reports which lines carry findings.

Its design is shaped by one asymmetry, and it is the opposite of the Intent
Layer's: nothing here is attacker-controlled, nothing here costs money, and
nothing here is uncertain. **Smart Diff makes no LLM call.** Every decision below
follows from treating the output as a deterministic function of
`(pr_files, latest review's findings)` — which is why it is computed on read and
never stored.

## What the starter already shipped

Like the Intent Layer, most of the contract surface was present and unreachable.

- Contracts — `SmartDiffRole`, `SmartDiffFile`, `SmartDiffGroup`,
  `ProposedSplit`, `SmartDiff` (`src/vendor/shared/contracts/brief.ts:111-144`),
  byte-identical in the client mirror, with **zero readers**.
- Transport alias — `SmartDiffResponse = SmartDiff`
  (`contracts/review-api.ts:72-74`), served by no route.
- A passing contract test — `test/contracts.test.ts:108-120`.
- i18n — a complete `prReview.smartDiff.*` namespace in the client, orphaned.
- Roadmap slot — `README.md:84` (L03), and
  `server/specs/2026-08-09-intent-layer.md:325` lists Smart Diff as explicitly
  out of the Intent Layer's scope.

**Consequence: this feature edits no contract.** No `vendor/shared` change in
either copy, no mirror sync, no `reviewer-core` export, no migration. A new route
plus a new UI subtree — additive, **MINOR**.

## Data sources

| Signal | Source | Available from |
|---|---|---|
| `path`, `additions`, `deletions` | `pr_files` | PR import |
| `file`, `start_line`, `end_line`, `severity` | `findings` via `reviews.pr_id` | first Run Review |
| `patch` text | `PrDetail.files`, already in the browser's cache | PR import |

**`patch` is deliberately not selected.** The route returns stats and line
numbers; the client already holds the patch text from `GET /pulls/:id`. Not
selecting it keeps the response small and, more importantly, keeps the
unindexed `pr_files` scan (there is no index on `pr_id`) from dragging
TOAST-adjacent text through the buffer pool.

**Why no cache.** `pr_brief` exists and stays empty. `GET /pulls/:id` deletes and
re-inserts every `pr_files` row on each request (`src/modules/pulls/routes.ts`),
so a cached Smart Diff would be stale within one page load and would need an
invalidation hook it cannot get. Two cheap queries beat a cache that cannot be
correct.

## Which review the overlays come from

`reviews.kind` is `'summary' | 'review'` and `desc(created_at)` does not
distinguish them, so **the newest review row can legitimately carry zero
findings** while a `kind: 'review'` row from a minute earlier has ten. Ordering
by `created_at` alone would blank the overlays on any PR that got a summary last.

`getLatestReviewFindings` therefore selects the latest row with
`kind = 'review'`, **falling back** to the latest row of any kind when none
exists, and reports `fellBackToSummary` so the service can log it. Findings are
then filtered `isNull(dismissed_at)`, matching the precedent in
`src/modules/pulls/routes.ts`, and the query hits
`findings_review_id_severity_idx` on its leading column.

`findings` has no `pr_id` — every per-PR aggregate must join through `reviews`
(`server/INSIGHTS.md`).

## Classification is ordered rules, not globs

No glob library is a declared dependency in any module; `picomatch`, `minimatch`
and `ignore` exist under `server/node_modules` only as hoisted transitive deps of
`dependency-cruiser` and `drizzle-kit`, so using one would be an undeclared
dependency. `constants.ts` is therefore frozen `as const` arrays consumed as
`ReadonlySet`s, in the shape of `src/modules/repo-intel/constants.ts`.

Three matchers over a normalised path (backslashes folded, lowercased, leading
`./` stripped): exact basename, exact `/`-split **segment**, and `endsWith`.

**Segment matching is exact, never substring.** `repo-intel`'s existing
`isJunkPath` uses substring matching, which mislabels `mydist/x.ts` and
`distributed/y.ts` as build output. Exact-segment matching is the fix, and there
is a test pinning both paths to `core`.

Precedence is **boilerplate → wiring → core**, and within each role
**basename → segment → suffix**, first match wins.

**Why boilerplate outranks wiring.** `dist/index.js` matches both the `dist`
segment and the `index.js` barrel name; `pnpm-workspace.yaml` matches both the
lockfile list and the `.yaml` suffix. The "generated / skim" verdict must win,
because mislabelling generated output as something to read is the exact problem
this feature exists to remove. The reverse error — a hand-written `public/sw.js`
demoted to boilerplate — costs one click, because **boilerplate is collapsed,
never hidden**, and a findings-bearing boilerplate file still shows its badge.

**`core` has no positive list.** It is the fallthrough, so a language nobody
anticipated lands in "review this" rather than silently in "skim".

**Tests are `core`; snapshots are `boilerplate`.** A review that reads the logic
and skips its tests is the failure mode this feature exists to prevent, so test
sources stay visible. They are demoted *within* `core` by an ordering tier, never
hidden. `__snapshots__/` and `.snap` are machine-written and caught earlier.

**`.md`, `docs/` and `specs/` are `wiring`.** With three roles, a spec is not
generated and is not the code under review.

The filename and directory lists are lifted from GitHub Linguist's
`generated.rb` and `vendor.yml`, the only primary-source lists for this. Two
deliberate divergences: `yarn.lock` is **absent** from Linguist's own table and
is added here, and Linguist's *content*-marker rules (Go's
`// Code generated … DO NOT EDIT.`, protobuf's banner) are **not** implemented,
because Smart Diff never reads patch text server-side. That is a known
over-match on hand-edited generated files, and the industry answer to it —
per-repo `.gitattributes` overrides — is out of scope.

## Ordering is a total order with no locale dependence

`orderGroup` sorts by, in order: `findingWeight` descending, `isTest` ascending,
`additions + deletions` descending, then `path` ascending via `<` / `>`.

**Never `localeCompare`.** It is locale- and ICU-version-dependent, which would
make the response differ between machines and break any snapshot of it.

`SEVERITY_WEIGHT` is `CRITICAL: 10_000, WARNING: 100, SUGGESTION: 1`, spread wide
so one CRITICAL always outranks any number of warnings elsewhere. It reproduces
the `SUGGESTION < WARNING < CRITICAL` order of `SEV_RANK`
(`reviewer-core/src/output/to-review.ts`) **without importing it** — that symbol
is not on the reviewer-core barrel, and adding it would turn a tracked public
surface into a versioned event for no gain.

`findings.severity` is plain `text NOT NULL` with no enum and no CHECK, and the
reviews DTO only *casts* it. An unknown value would key `SEVERITY_WEIGHT` to
`undefined` and poison an ordering sum with `NaN`, silently scrambling a whole
group. It is therefore filtered against `KNOWN_SEVERITIES` at the repository
boundary, summed with `?? 0`, and logged once per distinct value.

**Ordering is the one thing that must be server-side.** The repository sees
`severity`; the DTO does not carry it. That asymmetry is what makes
`finding_lines` the right amount of information for the contract to hold.

## split_suggestion

`total_lines` counts **every** file, so it matches the `+247 −38` the reviewer
sees in the header. The threshold uses `reviewable_lines` — `core + wiring` only:

    too_big = reviewable_lines > 400 || coreFileCount > 12

Excluding boilerplate is the whole point: a three-line fix plus a 9,000-line
lockfile bump is not too big to review, and there is a test pinning exactly that.
`400` is anchored to `DEFAULT_MAP_THRESHOLD_LINES` — the point at which the
engine itself stops reviewing a diff in one pass.

`proposed_splits` buckets `core + wiring` by the first two path segments, drops
buckets under two files, returns `[]` if fewer than two survive (a one-bucket
"split" is not advice), keeps the top four by lines, and **folds every remaining
file into the last kept bucket** so no file is silently lost. `name` is the real
path prefix — no i18n, cannot be wrong, directly actionable.

## Layering

`src/modules/smart-diff/` follows the `intent` slice: `constants.ts` (patterns
and thresholds, zero logic), `classify.ts` (pure), `ports.ts`, `repository.ts`
(the only file touching Drizzle), `service.ts`, `helpers.ts`, `routes.ts`.
Registered with one import and one entry in `src/modules/index.ts`.

**The row types live in `ports.ts`, not `classify.ts`.** The first attempt put
`ClassifierFile` / `ClassifierFinding` in `classify.ts` and had `ports.ts` import
them. dependency-cruiser rejected it: `ring-1-domain-stays-pure` is
`severity: error` and allows `domain.ts` / `ports.ts` to import only
`vendor/shared`, a sibling `domain|ports|constants.ts`, and `zod`. Moving the
shapes into `ports.ts` and importing them from `classify.ts` is both what the
rule wants and the consumer-owns-the-interface direction.

**The classifier is not in `reviewer-core`.** It is pure and dependency-free, so
it would fit — but `reviewer-core/src/index.ts` is a tracked public surface, and
exporting from it makes every future filename-list tweak a versioned event on a
package whose stated job is LLM review logic. One consumer today; promote on the
second, as a pure move of two files.

**A self-owned repository, not a shared one.** `no-cross-slice-imports` is
`severity: error`, so importing `modules/reviews/repository/review.repo.ts` is a
hard failure, and putting a helper on `Container` is worse
(`server/INSIGHTS.md`). `IntentRepository` already reads `pull_requests`,
`repos`, `pr_files` and `pr_commits` for itself; two slices owning the same
`SELECT path FROM pr_files` is the intended cost of slice independence.

## Routes

- `GET /pulls/:id/smart-diff` — `params: IdParams` only. Non-uuid → **422** via
  the app error handler; PR absent or in another workspace → **404**; a PR with
  no `pr_files` → **200** with empty groups, which is not an error.

No `config.rateLimit`: the route spends nothing. Contrast
`POST /pulls/:id/intent`, which caps at 5/min precisely because it spends money.

## The response validates itself

No route in this server declares `response:`, so response bodies are hand-written
DTOs that nothing checks — "edit a contract without its DTO and the contract
silently lies" (`server/CLAUDE.md`). Smart Diff does not become the exception,
for two reasons: a `response:` schema routes failures through
`isResponseSerializationError` and hides *which* field drifted behind a generic
500, and `fastify-type-provider-zod` **strips unknown keys**, turning a future
additive field into silent data loss.

Instead the service runs `SmartDiffResponse.safeParse` on its own DTO and, on
failure, logs `error` with `result.error.issues` and throws
`AppError('internal_error', …, 500)`.

**Not a bare `.parse()`.** `app.setErrorHandler` maps any `ZodError` to **422**,
which would tell the client it sent a bad request when in fact the server
produced a bad response.

`pseudocode_summary` is **omitted**, not set to `null`. The field is `.nullish()`
so absence parses, and omitting keeps the payload honest: not computed, rather
than computed-as-empty.

## Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant R as smart-diff/routes.ts
    participant S as SmartDiffService
    participant P as classify.ts (pure)
    participant DB as SmartDiffRepository

    C->>R: GET /pulls/:id/smart-diff
    R->>R: IdParams → 422 on a bad uuid
    R->>R: getContext → workspaceId
    R->>S: get(workspaceId, prId)
    S->>DB: getPullSummary
    alt not in workspace
        S-->>R: undefined
        R-->>C: 404 not_found
    else found
        par
            S->>DB: getFiles (no patch, de-duplicated by path)
        and
            S->>DB: getLatestReviewFindings
        end
        Note over DB: prefer kind='review'; fall back + warn<br/>dismissed_at IS NULL; KNOWN_SEVERITIES only
        S->>P: buildSmartDiffModel(files, findings)
        Note over P: one file in, exactly one bucket out —<br/>no model takes any part in the ordering
        P-->>S: groups · split · stats
        S->>S: SmartDiffResponse.safeParse
        alt contract breach
            S-->>R: log.error + AppError 500
        else
            S->>S: log.info 'smart-diff: computed'
            S-->>R: SmartDiff
        end
        R-->>C: 200
    end
```

## Logging

One `info` per request — `'smart-diff: computed'` with twelve numeric fields
(group counts, finding counts, line totals, `tooBig`, split count). Enough to
answer "why did this file end up in boilerplate" after the fact; cheap enough to
leave on.

Every degradation is a `warn` and none of them throws, because the endpoint has
no failure mode that justifies a 5xx except its own contract breach: a
summary-only PR, findings naming files absent from the diff (sample capped at
five paths), an unknown severity (once per distinct value, not per row), a
clamped line span, a PR with no files, a duplicated `pr_files` path.

**Not logged:** patch text, and finding titles or rationales. PR content in logs
is a data-retention question this feature has no reason to open. Per-file
classification decisions are also omitted — 900 lines per request on a large PR,
where the aggregate counts plus a reproducible pure function are strictly more
useful.

## Orphan finding lines are guaranteed, not hypothetical

`reviewer-core/src/grounding.ts` **exempts** `secret_leak`, `lethal_trifecta`,
`phantom` and `hook` findings from line-intersection grounding — they survive if
the *file* is in the diff, so their `start_line` routinely points at a line no
hunk contains. Add a force-push between the review and the page load (every
`GET /pulls/:id` rewrites `pr_files`) and a rename, and there are three
independent sources of drift.

The join is therefore lookup-only and never assumes a hit. Orphans still count
toward a file's badge, so the reviewer can click through to the Findings tab, and
a finding whose file is missing entirely is counted and warn-logged rather than
rendered as a phantom entry.

## Server tests

- `test/smart-diff-classify.test.ts` — 28 pure cases: every rule, the
  exact-segment guard (`mydist/`, `distributed/`), boilerplate-beats-wiring,
  one-bucket-per-file with path-set equality, span clamping, reversed ranges,
  the ordering tiers, and the lockfile-does-not-count-as-too-big case.
- `test/smart-diff-service.test.ts` — 11 cases against an in-memory
  `SmartDiffStore` and a spy logger: DTO validity, `pseudocode_summary` absence,
  each warn message by exact text, the summary-fallback pair, and an assertion
  that no log line carries `patch`, `title` or `rationale`.
- `test/smart-diff.it.test.ts` — 8 cases against Testcontainers Postgres,
  including the one no unit test can make: a `kind:'review'` with findings
  followed by a **newer** `kind:'summary'` with none still yields overlays.
- `test/routes-smoke.test.ts` — route registration and the 422.

`.bin` reached `core` on the first integration run, which is how the binary
extension list got the rest of its entries. The gap was in the classifier, not
the fixture.

## Out of scope

`pseudocode_summary` and the "What this does" row — that needs an LLM call, a
`FeatureModelId`, a prompt template, a persistence decision (where `pr_brief`
would finally earn its keep) and cost accounting. The contract already reserves
the field, so filling it later needs no contract edit. `pr_brief` caching. A
`?review=<id>` parameter for pinning overlays to a non-latest run. A per-repo
`.gitattributes`-style classification override.

Deliberately not built for the ordering: **`getFileRank` is not used**, even
though `src/modules/repo-intel/repository.ts` names smart-diff as its intended
consumer in a docstring. It returns `[]` when `REPO_INTEL_ENABLED=false` or the
repo is unindexed, which would make the order differ between environments —
poison for a feature whose entire value is determinism — and it cannot rank
`.json`, `.md` or lockfiles at all, which is most of what `wiring` and
`boilerplate` contain. Reaching it also means either a cross-slice import
(dependency-cruiser `error`) or a new port in `vendor/shared/adapters.ts`, for a
tiebreaker that only fires when finding weight, test status and line count all
tie. It belongs behind the existing tiers once repo-intel indexing is reliably on.

Also deliberately absent: **no index on `pr_files.pr_id`**. The unindexed scan is
a pre-existing condition shared with `GET /pulls/:id` and
`IntentRepository.getFilePaths`, and adding one turns a zero-migration feature
into one with a schema change for an access pattern nobody has measured. Not
selecting `patch` removes the part of the cost that actually matters. The index
belongs in its own change with `EXPLAIN` evidence.
