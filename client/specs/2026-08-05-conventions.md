# Spec: Conventions extractor (client)

Studio UI for the server-side conventions feature
(`server/specs/2026-08-05-conventions.md`): scan a cloned repo for house
rules, triage the evidence-backed candidates, and merge the accepted ones into
a skill. See that spec for the "why" behind the grounding gate, the tri-state
status and the creation gate referenced below.

The page's job is to make the *evidence* the subject, not the model's opinion.
Every card leads with a rule and immediately backs it with real file
citations; the header states plainly how many candidates the gate discarded.

## Navigation

**Component:** `src/vendor/ui/nav.ts`.
**Behavior:** a Conventions item joins the existing **SKILLS LAB** group after
Skills — `icon: "ListChecks"`, `href: "/repos/:repoId/conventions"`,
`gKey: "c"` — plus `{ keys: "g c", label: "Go to Conventions", group:
"Navigation" }` in `SHORTCUTS`. `resolveHref` already substitutes `:repoId`,
`activeKeyFor` (`src/components/app-shell/helpers.ts`) already maps a
`/conventions` pathname to `"conventions"`, and `messages/en/shell.json`
already carries `nav.conventions`, so the command palette and the `g`-chord
need no further wiring.

The route is repo-scoped, not workspace-scoped like `/skills`: a scan runs
against one clone, and the heading names it. This matches
`/repos/:repoId/pulls` and lets the repo switcher change the scan target
without any page-local state.

## Data layer

**Component:** `lib/hooks/conventions.ts` — the only allowed way to reach the
API (`client/CLAUDE.md`).
**Behavior:** follows `lib/hooks/skills.ts`. One query key, `["conventions",
repoId]`, holding `{ state, candidates }`; every mutation invalidates it.

```ts
useConventions(repoId)                  // refetchInterval only while state.status === "running"
useScanConventions(repoId)              // POST …/scan, optional path_prefix
useConventionAction(repoId)             // POST /conventions/:id/(accept|reject)
useUpdateConvention(repoId)             // PATCH /conventions/:id  { rule }
useSetConventionStatuses(repoId)        // POST …/status — "Deselect all" in one call
useConventionSkillDraft(repoId, open)   // GET …/skill-draft, enabled only while the modal is open
useCreateSkillFromConventions(repoId)   // POST …/skill; invalidates ["skills"] too
```

The scan is a background job, so the page polls rather than streaming: the
list query sets `refetchInterval` **only** while `state.status === "running"`
and drops back to idle as soon as the scan finishes. A scan takes tens of
seconds and produces one result set — an SSE channel would buy nothing a poll
does not already give, and the run-log machinery it would need belongs to
review runs.

`useConventionSkillDraft` is gated on the modal being open. The draft is
generated server-side from the currently accepted rows; fetching it eagerly
would generate a body the user may never look at, and would go stale on every
accept.

> **Build gotcha (`client/INSIGHTS.md`, 2026-08-04):** every import from
> `@devdigest/shared` in this feature is `import type`. A type import is
> erased before bundling; the first **value** import (e.g.
> `ConventionStatus.options` for a `<SelectInput>`) drags the vendored barrel
> into webpack's graph and can fail `pnpm build` alone while `pnpm typecheck`
> and `pnpm test` stay green. The status and skill-type option lists are local
> literals in the component's `constants.ts` for exactly this reason.

## Pure helpers

**Component:** `lib/time.ts` (promoted), plus each component's `helpers.ts`.
**Behavior:** `relativeTime` moves out of
`app/repos/[repoId]/pulls/helpers.ts` into `lib/time.ts` and is re-imported
there. The page header needs "last scan 1h ago"; that is the second unrelated
caller, which is the point at which `client/INSIGHTS.md`'s "colocate first,
promote on the second caller" rule says to promote it.

`ConventionsView/helpers.ts` builds the header's chip list from
`ConventionScanState`, **omitting any chip whose value is `null`**. Null means
the scan did not measure that thing — no cost reported by the provider, no
probe run — and the server passes it through rather than coercing to zero
(same rule as `SkillStats`). Rendering `$0.00` or "0 files" would present an
absent measurement as a real one.

## Components

**Component:** `app/repos/[repoId]/conventions/`, following the module's
folder convention — `Component.tsx`, `styles.ts`, `constants.ts`,
`helpers.ts`, `index.ts`, only the files each actually needs.

```
page.tsx                                  "use client", useParams<{repoId}>()
_components/ConventionsView/
  _components/ConventionToolbar/
  _components/ConventionCard/
  _components/CreateSkillFromConventionsModal/
```

- **`ConventionsView`** — breadcrumb *Skills Lab › Conventions*, heading
  `Conventions in <repo>`, and a subtitle assembled from the scan state:
  sample count, candidates kept and dropped, cost, tokens, and the relative
  time of the last scan. A scope input (a path prefix such as `src/api/`) sits
  next to the Re-scan button and is sent with the scan; it is a prefix, not a
  glob, because a prefix is unambiguous to both the user and the filter. While
  a scan runs the button is disabled and reads *Scanning…*. `Skeleton`,
  `ErrorState` and `EmptyState` cover the other states, with a distinct
  message when `degraded_reason` says the repo is not indexed — a generic
  empty state there reads as "the model found nothing" when the truth is "the
  scan never ran".
- **`ConventionToolbar`** — *Deselect all*, the `N of M accepted` counter, and
  the primary *Create skill* button, disabled with an explanatory title until
  something is accepted. Deselect all sends one bulk request rather than N
  parallel ones, which also keeps it clear of the scan route's rate limit.
- **`ConventionCard`** — modelled on `FindingCard`: the rule as the title, one
  evidence block per citation (`MonoLink` `path:start-end`, a copy button, the
  snippet), a confidence bar, and an "seen in N files" chip **only** when
  `occurrence_files` is non-null. Accept and Reject are `Button`s with
  `active` reflecting the persisted status; an accepted card carries a green
  left border. Editing swaps the rule for a `Textarea` with Save/Cancel and
  patches `rule` — the only editable field, because the evidence is a verified
  citation the server refuses to let the client rewrite.
- **`CreateSkillFromConventionsModal`** — seeds its form from the
  server-generated draft, then everything is locally editable: name,
  description, type, and the full markdown body. When the draft reports an
  `existing_skill`, the modal switches to update mode and shows the
  `body_patch` diff instead of implying a new skill. On success it navigates
  to the new skill's Config tab.

**Styling** is the module's inline-`CSSProperties`-in-`styles.ts` convention
on CSS variables, not Tailwind classes. Card borders use **per-side longhands
only** (`borderLeftColor`, `borderLeftWidth`) and never a `border` /
`borderColor` shorthand alongside them — mixing the two makes React warn on
every state toggle (`client/INSIGHTS.md`, 2026-08-02); `FindingCard/styles.ts`
is the reference.

## The Enabled toggle

**Component:** `CreateSkillFromConventionsModal`.
**Behavior:** the toggle is rendered **off and non-interactive**, with a hint
explaining that extracted skills always start disabled and can be enabled from
the skill page after review.

This is a deliberate deviation from the mockup, which shows it on. The server
forces `enabled: false` for any `source !== 'manual'`
(`server/specs/2026-08-04-skills.md`, "Creation rule") because a skill body is
rendered into the prompt *unwrapped*, outside the engine's `<untrusted>`
guard. An interactive toggle here would be a control that silently does
nothing — worse than an honest locked one. `Toggle` in `@devdigest/ui` has no
`disabled` prop and `src/vendor/ui` is not modified for this feature, so the
lock is a wrapper with `pointerEvents: "none"` and `aria-disabled`.

## Promoted shared components

**Component:** `src/components/markdown-editor/`.
**Behavior:** the line-numbered, highlighted markdown editor built for
`SkillEditor/_components/ConfigTab` moves out of that file into a shared
component, taking `splitLines`, `highlightLine`, the highlight regexes and
`HIGHLIGHT_STYLE` with it. The Create-skill modal is its second unrelated
caller, which is the promotion trigger; a plain `<Textarea mono>` there would
lose the filename chip, the unsaved badge, the token count and the gutter that
the mockup shows.

It takes its strings as a `labels` prop instead of calling
`useTranslations("skills")` internally. A shared component bound to one
feature's namespace forces every later caller to add keys to a file that is
not theirs; passing labels keeps each caller's strings in its own namespace,
which is what `src/i18n/request.ts`'s one-file-per-feature mapping assumes.

## i18n

**Component:** `messages/en/conventions.json`.
**Behavior:** the namespace **already exists** in the starter, unused. Its
`page.*` and `card.*` keys are consumed as written; unused ones are left in
place rather than deleted, matching the schema-contains-everything convention.
Added: the scan-state subtitle variants, the grounding and cost chips, the
scope-input label, the whole `toolbar.*` and `modal.*` groups, and the card's
reject/edit/copy strings. `modal.banner` uses `t.rich` for its `<b>` and
`<code>` markup. Adding one file wires itself up — `src/i18n/request.ts`
merges every `messages/en/*.json` by filename.

## Client tests

**Component:** colocated `*.test.tsx`, vitest + RTL, fetch never called.
**Behavior:**

- `ConventionCard.test.tsx` — renders the rule and every citation; the
  occurrence chip is absent when `occurrence_files` is `null` and present when
  it is a number; Accept fires the mutation with the right id and action; edit
  mode patches `rule`.
- `CreateSkillFromConventionsModal.test.tsx` — seeds its fields from the
  draft; submits the user's edits rather than the original draft; the Enabled
  toggle is present but not interactive; an `existing_skill` draft switches
  the modal to update mode.
- `ConventionsView.test.tsx` — the header omits the cost and dropped chips
  when their values are null; the not-indexed state renders its own message
  rather than the generic empty state.
- `markdown-editor/MarkdownEditor.test.tsx` — line numbers track the content
  and the supplied labels render, proving the promotion is
  behaviour-preserving.

Hooks are mocked with `vi.mock("@/lib/hooks/conventions")` declared **above**
the component import (hoisting is deliberate, as in `VersionsTab.test.tsx`),
and messages come from the real `messages/en/conventions.json` through
`NextIntlClientProvider`.

## Out of scope

Triage ergonomics — category grouping, "Accept all", confidence filtering,
keyboard navigation — are not built; the page ships with per-card
accept/reject plus a bulk deselect. There is no conventions entry in the
command palette beyond the automatic `NAV`-derived one, and no per-convention
link back to the skill it was merged into.
