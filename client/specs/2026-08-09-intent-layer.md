# Spec: Intent Layer (client)

The PR Overview tab rendered only the PR description. This adds the card that
answers "what is this PR trying to do?" above it. The server side — data
sources, the derived-confidence decision, and the injection controls — is in
`server/specs/2026-08-09-intent-layer.md`; this spec covers only what the UI
does.

## Navigation

No new route. `src/app/repos/[repoId]/pulls/[number]/page.tsx` now passes
`prId` into `OverviewTab` alongside `prBody`. `prId` was already resolved there
(the URL carries the PR *number*; the uuid comes from `usePulls`).

## Data layer

`src/lib/hooks/intent.ts`, reached through `src/lib/api.ts` like every other
hook — a `fetch` in a component is a defect.

- `usePrIntent(prId)` — `GET /pulls/:id/intent`, key `["pr-intent", prId]`,
  `enabled: prId != null`, **`retry: false`**.
- `useComputeIntent(prId)` — `POST /pulls/:id/intent`, writes the response
  straight into the cache and invalidates.
- `isNotComputed(error)` — `error instanceof ApiError && error.status === 404`.

**A 404 is the empty state, not an error.** The server returns it whenever the
intent has never been derived, which is the normal state of every PR before the
button is pressed. `retry: false` stops React Query from retrying a condition
that will not change on its own, and `isNotComputed` is what splits the empty
state from a real failure.

`PrIntentRecord` is imported with `import type`. A value import from the
vendored barrel drags it into webpack and breaks `pnpm build` while typecheck
and tests stay green (`INSIGHTS.md`).

## Layout

**Component:** `OverviewTab`
**Behavior:** renders a responsive card grid
(`repeat(auto-fit, minmax(320px, 1fr))`) above the existing Description section.
Two cards sit in it. `auto-fit` rather than a fixed `1fr 1fr` so the pair stacks
on a narrow viewport instead of crushing both.

## Component: IntentCard

**Behavior:** `SectionLabel icon="Target"` reading INTENT, with the recompute
`Button` in its `right` slot. Then, in order:

- the intent statement, italic, in typographic quotes;
- a two-column sub-grid, IN SCOPE (green heading) / OUT OF SCOPE (muted), each a
  bullet list; an empty list renders `—` rather than collapsing, so the reader
  can tell "nothing excluded" from "not derived";
- RISK AREAS — a wrapped row of `Badge` chips, shown only when non-empty;
- a footer with confidence, model, cost, relative `computed_at`, and a `Stale`
  badge when the PR head has moved since the intent was derived.

**Severity mapping.** The contract's `RiskSeverity` (`high|medium|low`) and the
UI's `Severity` (`CRITICAL|WARNING|SUGGESTION|INFO`) are different enums. They
are mapped once in the card's `constants.ts`, and colours/icons come from the
canonical `SEV` in `src/vendor/ui/primitives/tokens.ts`. Two hand-rolled
`SEV_COLOR` copies already exist in this codebase and one has drifted; a third
was not added.

**Evidence coverage, not model confidence.** The number is
`scoreConfidence(evidence)` — a deterministic sum of weights for the signals that
were actually present. It is rendered as "55% evidence coverage" with the
evidence details in the element's `title`, so the figure is auditable rather than
taken on faith. The vendored `ConfidenceNum` primitive is deliberately NOT used:
it hardcodes `title="Model confidence"`, which is the one thing this number is
not, and the primitive is read-only. When `confidence` is `null` the card prints
"Evidence coverage unknown" and **never** `0%` — a null means the row predates
scoring, and `0%` would read as a real verdict that the PR is incomprehensible.

**States:**

| Condition | Render |
|---|---|
| `isLoading` | three `Skeleton` bars |
| record present | the body above, recompute action in the header |
| 404 | `EmptyState` + "Compute intent" |
| any other error | `ErrorState` with retry |
| mutation in flight | `Button loading`, CTA label "Computing…" |

## Component: BlastRadiusCard

**Behavior:** `SectionLabel icon="Workflow"` reading BLAST RADIUS over an
`EmptyState`. **It fetches nothing** — Blast Radius is a separate feature. The
card exists so the Overview grid has the two-column shape the design calls for
instead of one card floating next to whitespace. (`Radar` is not in the vendored
icon set; `Workflow` reads as downstream impact.)

## i18n

All strings live under the `intent` and `blast` objects in
`messages/en/brief.json`. The pre-existing `block.*`, `unavailable` and
`unavailableHint` keys were left alone — they belong to the future full PR
Brief, not to this card, and the card's empty state needed wording specific to
deriving rather than to "running a review".

## Tests

`IntentCard.test.tsx`, colocated, with the repo's `renderWithIntl` wrapper and
the both-themes loop. The hooks module is mocked so the card is tested as a view.
Covered: statement, both scope lists, risk chips, confidence as a percentage and
as "Confidence unknown", the stale badge appearing only when stale, the 404
empty state firing the mutation, a non-404 error rendering `ErrorState`, and the
loading branch rendering neither statement nor empty state.

`fireEvent.click` throughout — a raw `element.click()` does not flush React state
outside `act()`, and the neighbouring tests get away with it only because they
assert on a mock rather than on a state transition (`INSIGHTS.md`).

## Component: SettingsIntentLinks

**Route:** `/settings/intent-links`, a third entry in `SETTINGS_SECTIONS`.

**Behavior:** a domain allowlist editor — text field plus Add, and a removable
chip per domain. `normaliseDomain` accepts either a bare host or a pasted URL and
returns the host, so "https://wiki.acme.com/rfc/12" and "wiki.acme.com" both add
the same entry.

The panel leads with a warning rather than burying it in a hint, because the
default is safe and every entry a user adds moves it: the URLs come from a PR
body its author controls, and anything fetched is fed to the classifier as
untrusted text. The empty state says what the empty list *means* — links are
recognised but never fetched — instead of reading like unfinished configuration.
The hint states that linked GitHub issues need no entry; they go through the
authenticated GitHub client, not this list.

## Out of scope

Blast Radius itself, auto-recompute when the head moves (the badge waits for a
human), a per-evidence-item detail view (the details are in a tooltip, not a
panel), and any e2e coverage of the compute button.
