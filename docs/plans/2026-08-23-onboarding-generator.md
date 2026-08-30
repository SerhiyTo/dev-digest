# Implementation Plan: Onboarding Generator — 2026-08-23

## Context

`SPEC-02` is approved and the feature is roughly 60% scaffolded and wired to
nothing: the `Onboarding` contract, the `onboarding` table, the system prompt,
the `onboarding` feature-model entry, the `en` message file and both renderers
(`Markdown`, `MermaidDiagram`) all exist, while
`rg -i onboarding server/src` finds no module, no route and no producer. This
plan builds the producer, the read surface, the screen, and the one navigation
entry the spec allows — plus the two things the spec assumes exist and this
repository does not have: a per-file view for the `Open` control, and a way to
test a path against the repository index.

## Source of truth

- spec: `specs/2026-08-23-onboarding-generator.md` (SPEC-02, Status: approved)
- roadmap lesson: L05 — "Onboarding generator" (root `README.md:95`)
- INSIGHTS consulted: `server/INSIGHTS.md`, `client/INSIGHTS.md`

## Acceptance-criteria coverage

One row per `AC-n` the spec declares, in spec order. Ids and wording taken from
the spec file, not from memory.

| AC | Criterion (shortened) | Tasks | Proven by |
|---|---|---|---|
| AC-1 | Tour is exactly five sections, closed `kind` set, in order | T1, T8 | `server/test/onboarding-domain.test.ts` |
| AC-2 | Reject and do not persist a missing / sixth / duplicated kind | T8, T12 | `server/test/onboarding-domain.test.ts`, `server/test/onboarding.it.test.ts` |
| AC-3 | Markdown `body` + optional structured payload on the same section | T1 | `server/test/contracts.test.ts` |
| AC-4 | Structured payload present → render it, not the same content from `body` | T16a, T16b | `CriticalPathsSection.test.tsx` |
| AC-5 | Structured payload absent → render `body` alone, no error state | T16a, T16b | `CriticalPathsSection.test.tsx`, `FirstTasksSection.test.tsx` |
| AC-6 | `architecture` diagram: four `classDef` kinds, kind never encoded in text | T4, T16a | `server/test/onboarding-prompt.test.ts`, `ArchitectureSection.test.tsx` |
| AC-7 | Invalid mermaid → prose without the diagram panel, no error graphic | T16a | `ArchitectureSection.test.tsx` |
| AC-8 | Every entry path is an indexed path or a directory prefix of one | T3, T8 | `server/test/onboarding-domain.test.ts` |
| AC-9 | Drop entries failing AC-8, persist the survivors, log the drops | T8, T12 | `server/test/onboarding-domain.test.ts` |
| AC-10 | Zero surviving entries → empty payload + `body`, client empty state | T8, T16a, T16b | `server/test/onboarding-domain.test.ts`, `CriticalPathsSection.test.tsx` |
| AC-11 | `critical_paths` candidates from `getCriticalPaths` flattened + rank order | T9 | `server/test/onboarding-facts.test.ts` |
| AC-12 | A numeric claim in a reason only where the facts block supplied it | T4, T8, T9 | `server/test/onboarding-domain.test.ts` |
| AC-13 | `first_tasks` grounded in the same facts block, no extra producer | T9 | `server/test/onboarding-facts.test.ts` |
| AC-14 | Task carries title, AC-8 hint path, complexity in `low`/`medium`/`high` | T1, T8 | `server/test/onboarding-domain.test.ts` |
| AC-15 | `running` row written before the 202 response | T12, T13 | `server/test/onboarding.it.test.ts` |
| AC-16 | Fire-and-forget background task, never `JobRunner` | T13 | `server/test/onboarding.it.test.ts` |
| AC-17 | Client polls at 1500 ms while `running`, stops when it leaves | T11 | `client/src/lib/hooks/onboarding.test.ts` |
| AC-18 | Generate and Regenerate disabled while `running` | T15 | `OnboardingView.test.tsx` |
| AC-19 | Second generation while one runs → 409, start timestamp unchanged | T12, T13 | `server/test/onboarding.it.test.ts` |
| AC-20 | Failure recorded on the state row; persisted tour untouched | T12 | `server/test/onboarding.it.test.ts` |
| AC-21 | `failed` → reason + retry, prior tour rendered beneath | T15 | `OnboardingView.test.tsx` |
| AC-22 | Boot closes every `running` row before requests are served | T12, T13 | `server/test/onboarding.it.test.ts` |
| AC-23 | Never toured and not running → generate CTA, no section cards | T15 | `OnboardingView.test.tsx` |
| AC-24 | On-this-page rail lists the five sections, marks the nearest active | T17 | `OnThisPageRail.test.tsx` |
| AC-25 | Activating a rail entry scrolls that section into view | T17 | `OnThisPageRail.test.tsx` |
| AC-26 | Each card independently collapsible, state not persisted across reload | T16a | `SectionCard.test.tsx` |
| AC-27 | Open navigates to the file view, path passed as data | T16a, T18 | `CriticalPathsSection.test.tsx` |
| AC-28 | Copy places the command verbatim on the clipboard, confirms visibly | T16b | `RunLocallySection.test.tsx` |
| AC-29 | No control executes, runs or evaluates a `run_locally` command | T16b | `RunLocallySection.test.tsx` |
| AC-30 | `reading_path` steps in persisted order, numbered in that order | T16a | `ReadingPathSection.test.tsx` |
| AC-31 | Persisted tour records generation time and the index state behind it | T2, T12 | `server/test/onboarding.it.test.ts` |
| AC-32 | Index row present → file count + elapsed time in the header | T15 | `OnboardingView.test.tsx` |
| AC-33 | No index row → elapsed alone, file-count clause omitted entirely | T15 | `OnboardingView.test.tsx` |
| AC-34 | Current sha differs from the generated sha → `stale` badge, no generation | T12, T15 | `OnboardingView.test.tsx` |
| AC-35 | Never start a generation without a user action | T13, T15 | `server/test/onboarding.it.test.ts`, `OnboardingView.test.tsx` |
| AC-36 | A successful regeneration replaces the stored tour, one row per repo | T7, T12 | `server/test/onboarding.it.test.ts` |
| AC-37 | Previous tour stays rendered and readable while regenerating | T15 | `OnboardingView.test.tsx` |
| AC-38 | Tour exposed at `/repos/:repoId/onboarding` | T15 | `OnboardingView.test.tsx` |
| AC-39 | `Onboarding Tour` item in the WORKSPACE group | T6 | `client/src/components/app-shell/helpers.test.ts` |
| AC-40 | Item active on `/repos/:repoId/onboarding`, not on `/onboarding` | T6 | `client/src/components/app-shell/helpers.test.ts` |
| AC-41 | Share link copies the page URL, no token, no public path | T17 | `ShareLinkButton.test.tsx` |
| AC-42 | Unknown or foreign repo id → identical 404, no disclosure | T13 | `server/test/onboarding.it.test.ts` |
| AC-43 | A 404 repo id renders repository-not-found, not the generate CTA | T15 | `OnboardingView.test.tsx` |
| AC-44 | No `repo_index_state` row → 409 naming the missing index, no model call | T12, T13 | `server/test/onboarding.it.test.ts` |
| AC-45 | Index `partial`/`degraded`/`failed` → persist `degraded: true` + reason | T8, T12 | `server/test/onboarding-domain.test.ts` |
| AC-46 | Degraded tour → full tour plus `partial` badge, no section suppressed | T15 | `OnboardingView.test.tsx` |
| AC-47 | Validate at write; tolerate an invalid stored tour at read as degraded | T8, T12 | `server/test/onboarding-domain.test.ts` |
| AC-48 | Schema failure after the allowed repairs → `failed`, no pipeline retry | T12 | `server/test/onboarding.it.test.ts` |
| AC-49 | Provider, model, both token counts and cost recorded on every attempt | T2, T12 | `server/test/onboarding.it.test.ts` |
| AC-50 | Model selected through the `onboarding` feature-model entry | T12, T13 | `server/test/onboarding.it.test.ts` |
| AC-51 | Clipboard failure → inline failure, text selectable, no fallback dialog | T16b, T17 | `RunLocallySection.test.tsx`, `ShareLinkButton.test.tsx` |
| AC-52 | No path-existence request when rendering the tour | T15, T16a | `OnboardingView.test.tsx` |
| AC-53 | Deleted Open target → destination's own not-found state, tour unchanged | T14, T18 | `client/src/app/repos/[repoId]/files/_components/FileView/FileView.test.tsx` |
| AC-54 | Staleness from the indexed sha alone; `indexer_version` ignored | T12 | `server/test/onboarding-domain.test.ts` |
| AC-55 | Generate from the shipped prompt, five kinds, security rules verbatim | T4 | `server/test/onboarding-prompt.test.ts` |
| AC-56 | Prompt instructs the four structured payloads within that amendment | T4 | `server/test/onboarding-prompt.test.ts` |
| AC-57 | No nav item added but `Onboarding Tour`, nothing moved or renamed | T6 | `client/src/components/app-shell/helpers.test.ts` |
| AC-58 | Header carries the resolved model and the displayed tour's cost | T12, T15 | `OnboardingView.test.tsx` |
| AC-59 | The generate CTA names the resolved model | T15 | `OnboardingView.test.tsx` |
| AC-60 | Never toured → model name, no cost figure | T15 | `OnboardingView.test.tsx` |
| AC-61 | Unknown displayed cost → omit the clause, never `$0.00` | T15 | `OnboardingView.test.tsx` |
| AC-62 | Regenerate confirms, names the model, starts only after confirmation | T17 | `RegenerateButton.test.tsx` |
| AC-63 | The displayed tour changes at exactly one moment — state → `done` | T12, T15 | `OnboardingView.test.tsx` |
| AC-64 | One module owns the three complexity colours; no literal in the card | T10, T16b | `client/src/lib/onboarding.test.ts` |
| AC-65 | `failed` → the failure notice carries that attempt's cost | T12, T15 | `OnboardingView.test.tsx` |
| AC-66 | Unknown failed cost → omit the clause, never `$0.00` | T15 | `OnboardingView.test.tsx` |
| AC-67 | No provider usage → record null tokens and cost, never zeros | T12 | `server/test/onboarding.it.test.ts` |

## Requirements review

- Requirement as understood: build the whole `SPEC-02` onboarding tour — a new
  `server/src/modules/onboarding/` producer and read surface, a new
  `/repos/:repoId/onboarding` screen with one nav entry, and the narrowed plus
  extended `@devdigest/shared` contracts — with the two missing prerequisites
  (an in-app file view and an index-path read) built alongside.
- Gaps found, and how they were answered in round one:
  - **The Open destination does not exist.** `client/src/app/repos/[repoId]/`
    holds only `context/`, `conventions/` and `pulls/`, and the nearest
    endpoint, `GET /repos/:id/context/file`, rejects any non-markdown path with
    `AppError('invalid_path', …, 400)`
    (`server/src/modules/context/service.ts:251-253`) — a 400, not a not-found
    state. Answered: build a minimal in-app file view (T14, T18).
  - **There is no generation-state table, and `onboarding` has no provenance
    columns.** The table is `repo_id` / `json` / `generated_at` only
    (`server/src/db/schema/context.ts:132-138`). Answered: add
    `onboarding_generations` in the shape of `convention_scans`, plus columns on
    `onboarding` (T2).
  - **`RepoIntel` cannot test a path against the index.** It exposes
    `getTopFilesByRank`, `getCriticalPaths`, `getRepoMap`, `getFileRank` and
    nothing that enumerates indexed paths
    (`server/src/modules/repo-intel/types.ts:145-176`). Answered: add an
    indexed-paths read to the facade (T3).
- Assumptions this plan rests on:
  - `StructuredResult<T>` already carries `model`, `tokensIn`, `tokensOut`,
    `costUsd: number | null` and `attempts`
    (`server/src/vendor/shared/adapters.ts:74-82`), so AC-49 and AC-67 need no
    adapter change — only honest propagation of the `null`.
  - `client/messages/` contains only `en`, so the AC-1 copy replacement is one
    file, not one per locale.
  - `repos.local_path` (or the equivalent the git adapter already uses for
    `GitClient.readFile`) is populated for any repository that has an index
    row, so the file view can read from the clone rather than re-fetching.
- Contradicts spec / INSIGHTS / roadmap: nothing. The plan follows
  `server/INSIGHTS.md` on all four points it touches — no `JobRunner` for a paid
  pipeline, the `running` row written before the 202, the boot reaper awaited at
  plugin load, and `</untrusted>` escaped before interpolation because
  `renderPrompt` does a raw `String.replace` (`server/src/platform/prompts.ts:34`).

## Recommendations

- **Do not copy `conventions/service.ts` as the slice template.** It imports
  `modules/settings/feature-models.ts` and takes `Container` in its constructor;
  both are grandfathered violations that the onion ruleset scores `error` for new
  code. `intent/` is the shape to copy — `ports.ts` plus constructor-injected
  ports wired in `routes.ts`, and `new SettingsFeatureModelResolver(container.db)`
  from `adapters/settings/` rather than the sibling module
  (`server/src/modules/intent/routes.ts:24`).
- **The per-repo rate limit needs a `keyGenerator`.** `config.rateLimit` is
  per-route; `conventions/routes.ts:78` uses a bare `max: 5`, which is a global
  limit. The spec's "3 per repository per 10 minutes" only holds if the key
  includes `req.params.id`.
- **Write the module specs after the build, not inside this plan.** The
  non-obvious "why" here — fire-and-forget over `JobRunner`, gate-at-write /
  degrade-at-read, and the two separate spend surfaces — belongs in
  `server/specs/` and `client/specs/` via `doc-writer` at close-out.
- **The file view is a new untrusted-input surface, not a convenience route.**
  It takes a path from a query string and reads the filesystem. Its guards
  (T14) are the same ones `SPEC-01` closed at its `AC-15`, and they deserve their
  own test file rather than a line inside another one.
- **`client/src/vendor/ui/nav.ts` is vendored code that AC-39 edits.** Worth an
  `engineering-insights` entry at wrap-up, or the next session will read the
  vendor rule and conclude the file is untouchable.

## Execution mode

multi-agent — 21 tasks over four modules-worth of surface, with genuinely
disjoint file sets once the contract and schema wave has landed.

- Wave 1 — parallel: T1, T2, T3, T4, T5, T6 · contracts, schema, facade, prompt,
  messages and nav; six disjoint file sets, no consumer of any of them in this wave
- Wave 2 — parallel: T7, T8, T9, T10, T11 · slice internals and client
  primitives; every one consumes wave 1 and none consumes another
- Wave 3 — parallel: T12, T14, T16a, T16b, T17 · the service, the file endpoint
  and the leaf components; disjoint folders, no shared file
- Wave 4 — parallel: T13, T15, T18 · the three composition points; T13 and T14
  both edit `modules/index.ts`, which is why they are two waves apart
- Wave 5 — parallel: T19, T20, T21 · integration test and the two INSIGHTS files
- After each wave: `plan-verifier` against that wave's tasks

## Constraints that must not break

- No comments in new code; intent goes in names and types — source: root
  `CLAUDE.md`, "Do not add comments to code"
- `server/src/vendor/shared/` is canonical and must be mirrored byte-identically
  into `client/src/vendor/shared/` in the same commit — source:
  `server/CLAUDE.md`, Gotchas
- Never hand-edit `server/src/db/migrations/*.sql`; schema goes
  `src/db/schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate` — source:
  `server/CLAUDE.md`, Gotchas
- No route declares a `response:` schema; response bodies are hand-written DTOs
  that no compiler checks against the contract — source: `server/CLAUDE.md`,
  Conventions
- A new slice must not import `modules/settings/feature-models.ts`; the onion
  ruleset scores `no-cross-slice-imports` as `error` — source:
  `server/INSIGHTS.md` (2026-08-09)
- A new `service.ts` takes its ports in the constructor, never `Container` —
  source: `server/INSIGHTS.md` (2026-08-09)
- `renderPrompt` / `renderTemplate` do a raw `String.replace` and do not escape
  the interpolated value — source: `server/src/platform/prompts.ts:34`
- Never put a paid LLM pipeline behind `JobRunner`; its 120s timeout is global
  and its retry re-runs the pipeline at full token cost — source:
  `server/INSIGHTS.md` (2026-08-05)
- A self-reported status table needs a boot reaper awaited at plugin load —
  source: `server/INSIGHTS.md` (2026-08-05);
  `server/src/modules/conventions/routes.ts:59-65`
- Never coerce a null cost with `?? 0`; the UI must show "—", not a fabricated
  `$0.00` — source: `server/INSIGHTS.md` (2026-07-29);
  `client/src/lib/cost.ts:8`
- Data access in `client/` goes only through `src/lib/hooks/*` → `src/lib/api.ts`
  — source: `client/CLAUDE.md`, Conventions
- Every user-facing string goes through next-intl messages — source:
  `client/CLAUDE.md`, Conventions
- Styling is inline style objects in `styles.ts`, not utility classes — source:
  `client/CLAUDE.md` / `client/INSIGHTS.md`
- `MermaidDiagram` keeps `securityLevel: "strict"` and its `mermaid.parse`
  pre-check — source:
  `client/src/components/mermaid-diagram/MermaidDiagram.tsx:17-21,37`
- `dangerouslySetInnerHTML` appears nowhere in this feature — source: SPEC-02,
  `## Untrusted inputs`, boundary 2
- There is no lint script in any module; do not invent one — source: root
  `CLAUDE.md`, Commands

## Tasks

### T1 — Narrow and extend the Onboarding contracts, and mirror them · module: server (+ client mirror) · wave: 1
- Files: `server/src/vendor/shared/contracts/knowledge.ts` (edit),
  `client/src/vendor/shared/contracts/knowledge.ts` (edit — byte-identical mirror)
- Skills: zod, semver-discipline, breaking-change, typescript-expert
- Do: narrow `OnboardingSection.kind` from `z.string()` to
  `z.enum(['architecture','critical_paths','run_locally','reading_path','first_tasks'])`
  (AC-1). Add the optional structured payloads of AC-3 to `OnboardingSection` —
  `critical_paths` entries `{ path, reason }`, `run_locally` steps
  `{ command, note? }`, `reading_path` steps `{ path, rationale }`, `first_tasks`
  tasks `{ title, hint_path, complexity: z.enum(['low','medium','high']) }`
  (AC-14) — each `.nullish()` so a pre-structured row still parses (AC-5). Add
  `degraded` and `degraded_reason` to `Onboarding`, matching the settled
  vocabulary at `contracts/review-api.ts:100` and `knowledge.ts:210` (AC-45).
  Add the read contract the screen consumes — tour, generation state
  (`running`/`done`/`failed` + reason), `generated_at`, `files_indexed`,
  `generated_sha`, `current_sha`, `model`, `cost_usd` (nullable), and the failed
  attempt's `cost_usd` (nullable) — as a new exported object beside `Onboarding`.
  Export everything from the existing barrel. Then copy the file verbatim into
  the client mirror; the two must be byte-identical.
- Done when: `diff server/src/vendor/shared/contracts/knowledge.ts
  client/src/vendor/shared/contracts/knowledge.ts` prints nothing; both
  typechecks pass; a fixture section with no structured fields still parses
  (AC-5) and a sixth `kind` fails to parse (AC-2).
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot` then `cd ../client && pnpm typecheck`
- Depends on: —

### T2 — Add the generation-state table and the tour's provenance columns · module: server · wave: 1
- Files: `server/src/db/schema/context.ts` (edit),
  `server/src/db/migrations/` (generated — never hand-edited)
- Skills: drizzle-orm-patterns, postgresql-table-design
- Do: add `onboardingGenerations`, PK `repo_id` referencing `repos` with
  `onDelete: 'cascade'`, in the shape of `convention_scans`
  (`server/src/db/schema/knowledge.ts:80-108`): `workspaceId` not null,
  `status` text enum `['running','done','failed']` not null, `provider`,
  `model`, `tokensIn`, `tokensOut`, `costUsd` (all nullable — AC-67 forbids
  zeros), `degradedReason`, `error`, `startedAt` defaulted not null,
  `finishedAt` nullable (AC-15, AC-19, AC-20, AC-22, AC-49). Add to the existing
  `onboarding` table, all nullable so the empty table and any future row survive:
  `filesIndexed` integer, `indexedSha` text, `model` text, `costUsd` double
  precision, `tokensIn`, `tokensOut` (AC-31, AC-58). Then run `pnpm db:generate`
  and `pnpm db:migrate`. Do not touch any existing table and do not delete an
  empty one.
- Done when: a new migration file exists and was generated, not written by hand;
  `pnpm db:migrate` applies cleanly; every added column is nullable or defaulted.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: —

### T3 — Add an indexed-paths read to the RepoIntel facade · module: server · wave: 1
- Files: `server/src/modules/repo-intel/types.ts` (edit),
  `server/src/modules/repo-intel/service.ts` (edit),
  `server/src/modules/repo-intel/repository.ts` (edit)
- Skills: onion-architecture, drizzle-orm-patterns, semver-discipline
- Do: add `getIndexedPaths(repoId: string): Promise<string[]>` to the `RepoIntel`
  interface, in the `T3` block beside `getTopFilesByRank` and `getCriticalPaths`,
  returning the distinct set of paths this repository has indexed, unioned from
  `file_rank` and `symbols`. Implement the query in `RepoIntelRepository` and the
  facade method in the service, following the degraded contract the file's header
  states: return `[]` when `repoIntelEnabled` is false, exactly as
  `getTopFilesByRank` does at `service.ts:759`. This is an additive method on a
  facade with existing consumers — add it, change no existing signature.
- Done when: the method is on the interface, the service and the repository; no
  existing facade signature changed; `[]` is returned when the flag is off.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest related --run src/modules/repo-intel/service.ts --reporter=dot`
- Depends on: —

### T4 — Amend the shipped onboarding prompt to the five kinds · module: server · wave: 1
- Files: `server/src/prompts/onboarding.system.md` (edit),
  `server/test/onboarding-prompt.test.ts` (new)
- Skills: security
- Do: a minimal amendment, not a rewrite (AC-55). Remove every rule naming a kind
  outside the five — the `routes_and_apis` formatting bullet and its mention in
  the diagram-allowance sentence. Keep the `SECURITY:` block, the
  "Grounding rules (strict)" block and the "Mermaid rules" block **byte-identical**.
  Add, inside that same diff, instructions for the four structured payloads of
  AC-56: a `reason` per `critical_paths` entry whose numbers may only come from
  the facts block (AC-12), a `rationale` per `reading_path` step, a `complexity`
  from `low`/`medium`/`high` per `first_tasks` task, and the AC-6 mermaid
  requirement that the `architecture` diagram declare four `classDef` kinds —
  entrypoint or module, cross-cutting middleware, datastore, external client —
  and assign a class to every node rather than encoding kind in the node text.
  Leave `{{sections}}` and `{{language}}` as placeholders. Add a test asserting
  the three preserved blocks are present verbatim and that `routes_and_apis`
  appears nowhere in the file.
- Done when: `rg -n 'routes_and_apis' server/src/prompts/onboarding.system.md`
  returns nothing; the new test asserts the `SECURITY:`, grounding and mermaid
  blocks character for character.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/onboarding-prompt.test.ts --reporter=dot`
- Depends on: —

### T5 — Replace the onboarding message copy · module: client · wave: 1
- Files: `client/messages/en/onboarding.json` (edit)
- Skills: none — plain edit
- Do: the current `generate.body` describes "overview, architecture, key modules,
  getting started, and conventions & gotchas", which is not the five sections of
  AC-1. Replace it with copy naming architecture, critical paths, how to run
  locally, reading order and first tasks. Add every string this feature's screens
  need: the five section titles, the on-this-page rail label, the per-section
  empty states (AC-10), the freshness subtitle with and without the file-count
  clause (AC-32, AC-33), the `stale` and `partial` badges (AC-34, AC-46), the
  model and cost clauses for the header, the CTA and the failure notice (AC-58 –
  AC-61, AC-65, AC-66), the Regenerate confirmation body naming the model
  (AC-62), the copy / copied / copy-failed states (AC-28, AC-51), the Open and
  Share link labels (AC-27, AC-41), the three complexity pill words `Low`,
  `Medium`, `High`, and the file-view not-found copy (AC-53). `en` is the only
  locale in `client/messages/`.
- Done when: `client/messages/en/onboarding.json` is valid JSON, contains no
  reference to the old five sections, and carries a key for every string T15 –
  T18 render.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: —

### T6 — Add the one nav item and fix the active key · module: client · wave: 1
- Files: `client/src/vendor/ui/nav.ts` (edit),
  `client/src/components/app-shell/helpers.ts` (edit),
  `client/src/components/app-shell/helpers.test.ts` (new or edit)
- Skills: frontend-ui-architecture
- Do: add exactly one item to the WORKSPACE group of `NAV` —
  `{ key: "onboarding-tour", label: "Onboarding Tour", icon: <an existing IconName>,
  href: "/repos/:repoId/onboarding", gKey: "o" }` — and add the matching
  `g o` entry to `SHORTCUTS` (AC-39). Move, rename and remove nothing else;
  `Project Context` stays in SKILLS LAB (AC-57). In `activeKeyFor`, replace
  `pathname.includes("/onboarding")` (`helpers.ts:29`), which today returns
  `onboarding-tour` for the Add Repository screen, with a test that matches only
  the per-repo route, so `/repos/<id>/onboarding` returns `onboarding-tour` and
  `/onboarding` returns no key (AC-40). Cover both halves in the test.
  `client/src/vendor/ui/` is vendored — this is a deliberate, spec-mandated
  edit to it and the only one in scope.
- Done when: the `NAV` diff is one added item and nothing else; the test asserts
  both paths of AC-40.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run src/components/app-shell/helpers.ts --reporter=dot`
- Depends on: —

### T7 — Onboarding persistence: ports and repository · module: server · wave: 2
- Files: `server/src/modules/onboarding/ports.ts` (new),
  `server/src/modules/onboarding/repository.ts` (new)
- Skills: onion-architecture, drizzle-orm-patterns
- Do: declare in `ports.ts` only the methods the service calls — a tour store
  (`readTour`, `upsertTour`), a generation-state store (`beginGeneration`,
  `finishGeneration`, `failGeneration`, `readState`, `reapRunning`), the facts
  sources the service needs, a model resolver and a logger — following
  `server/src/modules/intent/ports.ts` as the template. Implement the two stores
  in `repository.ts` over Drizzle. `upsertTour` writes one row per repository, so
  a successful regeneration replaces the stored tour and keeps no history
  (AC-36). `beginGeneration` must be the single place the `running` row is
  written and must be awaitable before a response is sent (AC-15), and must
  refuse to start when a `running` row already exists, leaving its `startedAt`
  untouched (AC-19). `reapRunning` closes every `running` row and returns the
  count (AC-22). Every token and cost write accepts `null` and never substitutes
  `0` (AC-67). No Drizzle type escapes into `ports.ts`.
- Done when: `ports.ts` imports nothing from `src/db` or `drizzle-orm`;
  `repository.ts` implements every port method; nothing else imports the schema
  tables directly.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T1, T2

### T8 — Onboarding domain rules · module: server · wave: 2
- Files: `server/src/modules/onboarding/domain.ts` (new),
  `server/src/modules/onboarding/constants.ts` (new),
  `server/test/onboarding-domain.test.ts` (new)
- Skills: onion-architecture, zod, typescript-expert, security
- Do: pure functions, no repository, no Fastify, no Drizzle. (a) validate a
  generated tour against the closed five-kind set and reject a missing, extra or
  duplicated kind with a reason naming the invalid set (AC-1, AC-2). (b) ground a
  path: allowed only when it equals an indexed path or is a directory prefix of
  one; absolute paths, `..` segments, URL-encoded separators and null bytes are
  rejected outright and never stored (AC-8, and boundary 4 of the spec's
  `## Untrusted inputs`). (c) drop the entries that fail (b), keep the survivors,
  and return the dropped list for a bounded log sample (AC-9); a section left
  with zero entries persists with an empty payload and its `body` (AC-10).
  (d) reject a `critical_paths` reason containing a number the facts block did
  not supply (AC-12). (e) validate `first_tasks` complexity against the closed
  three-value set (AC-14). (f) apply the caps as constants —
  `critical_paths` 6, `run_locally` 8, `reading_path` 5, `first_tasks` 6, links
  4, any single string 200 characters, the document 128 KB — truncating at write.
  (g) decide `degraded` + `degraded_reason` from an index status of `partial`,
  `degraded` or `failed` (AC-45). (h) tolerate a stored tour that fails the
  closed-kind validation by returning it as `degraded: true` with a reason rather
  than throwing (AC-47). (i) compute staleness from the indexed commit sha alone,
  ignoring `indexer_version` (AC-54). Cover each of these in the test file.
- Done when: `domain.ts` imports only `zod` and the shared contracts; every rule
  above has a named test; a path of `../etc/passwd` and one of `/etc/passwd` are
  both rejected.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/onboarding-domain.test.ts --reporter=dot`
- Depends on: T1

### T9 — The facts assembler and its untrusted fencing · module: server · wave: 2
- Files: `server/src/modules/onboarding/facts.ts` (new),
  `server/test/onboarding-facts.test.ts` (new)
- Skills: onion-architecture, security, typescript-expert
- Do: assemble exactly one facts block, used by all five sections and by no
  section exclusively (AC-13). Compose what already exists rather than adding a
  producer: `RepoIntel.getRepoMap` for the file tree and key-file excerpts,
  `getTopFilesByRank` for the rank order, and `getCriticalPaths` **flattened to
  distinct files in rank order server-side** so the model never sees nested
  arrays (AC-11), plus the detected package scripts read through the injected
  git port. Every excerpt, path listing, script body and detected-service string
  is enclosed in an `<untrusted>` block, and every such value has a literal
  `</untrusted>` escaped before interpolation — `renderPrompt` does a raw
  `String.replace` and escapes nothing (`server/src/platform/prompts.ts:34`).
  `escapeFence` in `server/src/modules/intent/classifier.ts` is the existing
  implementation of this rule; do not import it across the slice boundary, mirror
  it. Record, per file, the numbers the model is allowed to cite, so T8's (d) has
  something to check against (AC-12).
- Done when: a regression test in the shape of `server/test/intent-prompt.test.ts`
  "escapes a forged closer" proves that a file whose content contains a literal
  `</untrusted>` cannot close the fence; another test asserts the flattened,
  deduped, rank-ordered file list is flat (AC-11); a third asserts the
  `first_tasks` input names no source absent from the other sections' input.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/onboarding-facts.test.ts --reporter=dot`
- Depends on: T1, T3

### T10 — The complexity colour module · module: client · wave: 2
- Files: `client/src/lib/onboarding.ts` (new),
  `client/src/lib/onboarding.test.ts` (new)
- Skills: frontend-ui-architecture, typescript-expert
- Do: one named domain module beside `severity.ts`, `cost.ts` and
  `github-urls.ts`, owning the three complexity colours of AC-14 and the
  accessible words `Low`, `Medium`, `High` that go with them, keyed off the
  three-value contract enum from `@devdigest/shared` (AC-64). It must not live in
  `client/src/vendor/ui/primitives/tokens.ts`: that file is vendored, its `SEV`
  set is the severity vocabulary, and two hand-rolled `SEV_COLOR` copies have
  already drifted from it. Also export the five section kinds in their AC-1
  order, so the rail, the cards and the container all read one list.
- Done when: the module exports one colour resolver and one ordered kind list;
  the test asserts all three complexity values resolve and that the order matches
  AC-1 exactly.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/lib/onboarding.test.ts --reporter=dot`
- Depends on: T1

### T11 — Onboarding and file-view data hooks · module: client · wave: 2
- Files: `client/src/lib/hooks/onboarding.ts` (new),
  `client/src/lib/hooks/onboarding.test.ts` (new),
  `client/src/lib/hooks/index.ts` (edit)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: React Query hooks over `src/lib/api.ts`, following
  `client/src/lib/hooks/conventions.ts` — one query key holding the whole page,
  the mutation invalidating it. `useOnboarding(repoId)` polls at 1500 ms while
  the reported state is `running` and stops the moment it is not, exactly as
  `conventions.ts:19,30-31` does (AC-17). `useGenerateOnboarding(repoId)` POSTs
  and invalidates. `useRepoFile(repoId, path)` GETs the file view's endpoint with
  the path as an encoded query parameter, never as a route segment (AC-27), and
  surfaces a 404 as a not-found state rather than an error (AC-53). Export from
  the barrel. No component may fetch directly.
- Done when: the test asserts the poll interval is 1500 ms while `running` and
  `false` otherwise, and that the file hook encodes the path parameter.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/lib/hooks/onboarding.test.ts --reporter=dot`
- Depends on: T1

### T12 — The onboarding service · module: server · wave: 3
- Files: `server/src/modules/onboarding/service.ts` (new),
  `server/src/modules/onboarding/helpers.ts` (new)
- Skills: onion-architecture, security, typescript-expert
- Do: orchestration only — no SQL, no Fastify, and the ports of T7 taken in the
  constructor, never `Container`. `beginGeneration` writes the `running` row and
  returns before any model call, so a 202 caller never polls a stale state
  (AC-15); refuse with a conflict when a row is already `running` (AC-19); refuse
  with a conflict, naming the missing index and making zero provider calls, when
  the repository has no `repo_index_state` row (AC-44). `runGeneration` resolves
  the model through the `onboarding` feature-model entry — never a model name in
  feature code (AC-50) — assembles the facts block (T9), calls
  `completeStructured` once with the amended prompt, and on a schema failure
  after the allowed repairs marks the state `failed` with the validation error
  and does not re-run the pipeline (AC-48). Validate at write through T8: reject
  an invalid section set without persisting (AC-2), drop ungrounded entries and
  log a bounded sample (AC-9), reject fabricated numeric claims (AC-12), apply
  the caps, and set `degraded` from the index status (AC-45). Persist the tour
  together with `generated_at`, `files_indexed` and the indexed sha it was built
  against (AC-31), and only on success — a failure leaves the stored tour
  untouched (AC-20) and the displayed tour therefore changes at exactly one
  moment (AC-63). Record provider, model, both token counts and cost on every
  attempt including a failed one (AC-49), writing `null` and never `0` when the
  provider returned no usage (AC-67). `reapRunning` at boot, returning the count
  it closed (AC-22). The read path assembles the view DTO by hand — no route in
  this repository declares a `response:` schema — including the current indexed
  sha beside the generated one so the client can compute staleness from the sha
  alone (AC-34, AC-54), the resolved model name, the displayed tour's cost and
  the failed attempt's cost as separate fields that must not be merged (AC-58,
  AC-65). A stored tour failing validation is returned degraded, never as a 5xx
  (AC-47). Budget the whole generation at 240 seconds.
- Done when: `service.ts` imports neither `fastify` nor `drizzle-orm`; its
  constructor lists ports; the failed path writes cost and leaves the tour row's
  `generated_at` unchanged; the view carries the two cost fields separately.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T7, T8, T9

### T14 — The repo file-read endpoint · module: server · wave: 3
- Files: `server/src/modules/files/routes.ts` (new),
  `server/src/modules/files/service.ts` (new),
  `server/src/modules/files/ports.ts` (new),
  `server/src/modules/index.ts` (edit),
  `server/test/repo-file-paths.test.ts` (new)
- Skills: onion-architecture, fastify-best-practices, zod, security
- Do: `GET /repos/:id/file?path=<repo-relative path>`, resolving `:id` against
  the caller's workspace and returning the same 404 for a foreign id as for a
  non-existent one. The path arrives from a query string and reaches the
  filesystem, so it is an untrusted-input boundary: reject absolute paths, any
  `..` segment, URL-encoded separators and null bytes before anything touches
  disk — the guards `SPEC-01` closed at its `AC-15` — cap the path length and the
  returned byte count, and read through the injected git port
  (`GitClient.readFile`) rather than composing a filesystem path in the route. A
  file that is not in the clone returns 404 with the same body shape as an
  unknown repository (AC-53's server half). Register `files` in
  `modules/index.ts`. The rejection table gets its own test file.
- Done when: the test rejects `/etc/passwd`, `../../etc/passwd`,
  `foo%2f..%2fbar` and a null-byte path, and accepts an ordinary repo-relative
  path; no route handler builds a filesystem path by concatenation.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/repo-file-paths.test.ts --reporter=dot`
- Depends on: —

### T13 — Onboarding routes and module registration · module: server · wave: 4
- Files: `server/src/modules/onboarding/routes.ts` (new),
  `server/src/modules/index.ts` (edit)
- Skills: onion-architecture, fastify-best-practices, zod, security
- Do: a Fastify plugin in the shape of `intent/routes.ts` — construct the
  repository, the ports and the service here, wiring the model resolver as
  `new SettingsFeatureModelResolver(container.db)` from `adapters/settings/`,
  never by importing the settings module (the onion ruleset scores that `error`).
  `GET /repos/:id/onboarding` returns the view; `POST /repos/:id/onboarding/generate`
  awaits `beginGeneration`, then starts the work unawaited and replies 202
  (AC-15, AC-16) — no `JobRunner`, whose global 120s timeout is shorter than the
  240s budget and whose retry would re-run a paid pipeline. Map the service's
  conflicts to 409 (AC-19, AC-44) and resolve `:id` against the caller's
  workspace on both routes, returning an identical 404 for a non-existent id and
  for another workspace's id (AC-42). Nothing on the read path may start a
  generation (AC-35). Rate-limit the generate route at 3 per 10 minutes with a
  `keyGenerator` keyed on `req.params.id` — a bare `max` is a global limit, not a
  per-repository one. Await `reapRunning` at plugin load, before the server
  accepts requests, logging the count (AC-22), exactly as
  `conventions/routes.ts:59-65` does. Register `onboarding` in `modules/index.ts`
  with one import and one entry. Request schemas only; no `response:` schema.
- Done when: both routes resolve; a second generate against a `running` row
  returns 409 with the start timestamp unchanged; an unindexed repository returns
  409 with zero provider calls; the reaper is awaited, not fired and forgotten.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T12, T14

### T16a — Section shell, architecture, critical paths and reading path cards · module: client · wave: 3
- Files: `client/src/app/repos/[repoId]/onboarding/_components/SectionCard/` (new),
  `client/src/app/repos/[repoId]/onboarding/_components/ArchitectureSection/` (new),
  `client/src/app/repos/[repoId]/onboarding/_components/CriticalPathsSection/` (new),
  `client/src/app/repos/[repoId]/onboarding/_components/ReadingPathSection/` (new)
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library, security
- Do: each is a PascalCase folder with its component, a colocated test, `styles.ts`
  and `index.ts` — the shape of
  `client/src/app/agents/_components/AgentCard/`. `SectionCard` is the
  collapsible shell: independently collapsible, exposing expanded/collapsed state
  to assistive technology, keyboard-operable, and **not** persisting the
  collapsed state across a reload (AC-26). `ArchitectureSection` renders the
  prose through the existing `Markdown` primitive and the diagram through
  `MermaidDiagram`; when the diagram reaches its `invalid` state
  (`MermaidDiagram.tsx:12,29-31`) the panel is omitted and the prose still
  renders, with no error graphic (AC-7). `securityLevel: "strict"` and the
  `mermaid.parse` pre-check stay as they are. `CriticalPathsSection` renders one
  row per structured entry and does not additionally render the same content from
  `body` (AC-4); with no structured payload it renders `body` alone without an
  error state (AC-5); with zero entries it renders its empty state (AC-10); its
  `Open` control navigates to the file view with the path as an encoded query
  parameter, never as a route segment built by concatenation (AC-27), and it
  issues no per-entry existence request (AC-52). `ReadingPathSection` presents
  its steps in the persisted order and numbers them in that order (AC-30).
  Strings come from next-intl, styles from `styles.ts` inline objects, and
  `dangerouslySetInnerHTML` appears nowhere.
- Done when: each folder has a colocated test covering its ACs; the critical-paths
  test asserts no duplicate markdown list beside the structured rows and that the
  Open href carries an encoded parameter; `rg dangerouslySetInnerHTML` over the
  four folders returns nothing.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/repos/\[repoId\]/onboarding --reporter=dot`
- Depends on: T5, T10

### T16b — Run-locally and first-tasks cards · module: client · wave: 3
- Files: `client/src/app/repos/[repoId]/onboarding/_components/RunLocallySection/` (new),
  `client/src/app/repos/[repoId]/onboarding/_components/FirstTasksSection/` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library, security
- Do: `RunLocallySection` is the sharpest boundary on the screen — the commands
  are model output derived from attacker-influenceable repository content, one
  paste from a developer's shell. It renders each command as inert monospace text,
  never as a link and never with a scheme-bearing href, escaped for display so a
  command containing markup cannot break out of its row. Its only control copies
  the command text verbatim, including any trailing inline comment, and confirms
  the copy visibly (AC-28). There is no Run control, no terminal, no `exec`
  (AC-29). A clipboard write that fails or is denied reports the failure inline on
  that control, leaves the text selectable, and opens no fallback dialog (AC-51).
  `FirstTasksSection` renders a card per task with its title, its hint path and a
  complexity pill whose colour comes from `client/src/lib/onboarding.ts` and whose
  accessible name includes the word `Low`, `Medium` or `High` so the pill does not
  rely on colour alone (AC-14, AC-64); the card contains no colour literal. Both
  render structured payload over `body` when present (AC-4), `body` alone when
  absent (AC-5), and an empty state at zero entries (AC-10).
- Done when: `rg -n '#[0-9a-fA-F]{3,8}|\b(red|amber|green|orange)\b'` inside the
  `FirstTasksSection` folder returns nothing (AC-64); the run-locally test asserts
  the clipboard receives the command byte for byte, that a rejected clipboard
  write renders an inline failure with the text still selectable, and that the
  rendered section contains no control other than copy.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/repos/\[repoId\]/onboarding --reporter=dot`
- Depends on: T5, T10

### T17 — Rail, regenerate confirmation and share link · module: client · wave: 3
- Files: `client/src/app/repos/[repoId]/onboarding/_components/OnThisPageRail/` (new),
  `client/src/app/repos/[repoId]/onboarding/_components/RegenerateButton/` (new),
  `client/src/app/repos/[repoId]/onboarding/_components/ShareLinkButton/` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: `OnThisPageRail` lists exactly the five sections in the AC-1 order taken
  from `client/src/lib/onboarding.ts`, marks as active the section nearest the top
  of the viewport, and moves that marker as the main column scrolls (AC-24);
  activating an entry scrolls the corresponding section into view (AC-25). It is a
  navigation landmark, its entries are links, and the active entry is announced as
  current. `RegenerateButton` presents a confirmation that names the resolved
  model and states that the current tour will be replaced, and starts the
  generation only after the user confirms — dismissing it starts nothing (AC-62).
  `ShareLinkButton` places the current page URL on the clipboard and confirms
  visibly, creating no token and no public URL (AC-41); a denied clipboard write
  reports inline and leaves the URL selectable, with no fallback dialog (AC-51).
- Done when: the rail test asserts five entries, the active marker changing, and
  the scroll on activation; the regenerate test asserts that dismissing fires no
  mutation and that the confirmation text contains the model name.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/repos/\[repoId\]/onboarding --reporter=dot`
- Depends on: T5, T10, T11

### T15 — The onboarding screen and its route · module: client · wave: 4
- Files: `client/src/app/repos/[repoId]/onboarding/page.tsx` (new),
  `client/src/app/repos/[repoId]/onboarding/_components/OnboardingView/` (new)
- Skills: frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library
- Do: the route at `/repos/:repoId/onboarding` (AC-38), a thin `page.tsx` reading
  `useParams` and delegating to `OnboardingView`, following
  `client/src/app/repos/[repoId]/context/page.tsx`. The view composes T16a, T16b
  and T17 and owns the states: never toured and not running → the generate CTA
  naming the resolved model, and no section cards (AC-23, AC-59); a 404 repo id →
  the repository-not-found state rather than the CTA (AC-43); `running` → both
  controls disabled (AC-18) with the previously generated tour still rendered and
  readable beneath a running indicator (AC-37); `failed` → the failure reason and
  a retry control with the prior tour beneath (AC-21), carrying that attempt's
  cost (AC-65) and omitting the clause entirely when it is unknown, never `$0.00`
  (AC-66). The header subtitle reads the file count and the elapsed time when the
  index row exists (AC-32) and the elapsed time alone, with the file-count clause
  omitted rather than zeroed, when it does not (AC-33). It presents a `stale`
  badge when the current indexed sha differs from the generated one and starts no
  generation on its own (AC-34, AC-35), and a `partial` badge with all five cards
  present when the tour is degraded (AC-46). Beside the freshness line it presents
  the resolved model and the displayed tour's cost (AC-58); with no tour ever
  generated, the model name and no cost figure (AC-60); with an unknown cost, no
  currency string at all (AC-61) — `formatCost` already returns "—" for null
  (`client/src/lib/cost.ts:8`), so never coerce with `?? 0`. The rendered tour
  changes only when the generation state transitions to `done` (AC-63). Page load
  issues one request for the tour and one for the index state and no per-entry
  existence request (AC-52).
- Done when: the colocated test covers every state above, including the two
  cost-omission cases and the two badge cases; no `fetch` appears in the folder.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/repos/\[repoId\]/onboarding --reporter=dot`
- Depends on: T5, T10, T11, T16a, T16b, T17

### T18 — The in-app file view · module: client · wave: 4
- Files: `client/src/app/repos/[repoId]/files/page.tsx` (new),
  `client/src/app/repos/[repoId]/files/_components/FileView/` (new)
- Skills: frontend-ui-architecture, next-best-practices, react-best-practices, react-testing-library
- Do: a read-only screen at `/repos/:repoId/files`, taking the path from
  `useSearchParams` — the encoded parameter T16a's Open control passes, never a
  route segment (AC-27) — and reading through `useRepoFile` from T11. It renders
  the file's contents as inert text and presents **its own not-found state** when
  the file no longer exists in the repository, leaving the tour unchanged by the
  visit (AC-53). Strings come from next-intl. No editing, no execution, no
  fetching from the component.
- Done when: the colocated test asserts the not-found state for a 404 and a
  rendered file for a 200, and that the path is read from the query string.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run src/app/repos/\[repoId\]/files --reporter=dot`
- Depends on: T11, T14

### T19 — Onboarding integration test · module: server · wave: 5
- Files: `server/test/onboarding.it.test.ts` (new)
- Skills: onion-architecture
- Do: a DB-backed test over the real routes with the LLM adapter mocked through
  the DI container — mock the container, not the modules. Cover: the 202 with a
  `running` row already readable by the immediately following poll (AC-15) and no
  `jobs` row for the generation (AC-16); a second generate returning 409 with the
  start timestamp unchanged (AC-19); an unindexed repository returning 409 with
  zero provider calls (AC-44); a failure leaving the state row `failed` with a
  reason and the tour row's `generated_at` unchanged (AC-20); a schema failure
  after the allowed repairs producing exactly one pipeline execution in the cost
  record (AC-48); provider, model, both token counts and cost recorded on a
  **failed** row (AC-49) and recorded as nulls, not zeros, when the provider
  returned no usage (AC-67); the model matching the workspace's configured
  `onboarding` entry when set and the registry default when not (AC-50); a
  successful regeneration replacing the single row (AC-36) and persisting
  `files_indexed` and the indexed sha (AC-31); a `running` row surviving a
  simulated restart being closed by the reaper before requests are served
  (AC-22); an unknown id and a foreign-workspace id returning an identical 404
  body (AC-42); and a read of the tour never creating a generation row (AC-35).
  The filename must end `.it.test.ts` — the CI lanes select on it.
- Done when: every case above is a named test; the file mocks the LLM through the
  container; no case asserts on a `jobs` row existing.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T13

### T20 — Append server INSIGHTS · module: server · wave: 5
- Files: `server/INSIGHTS.md` (edit — append only)
- Skills: engineering-insights
- Do: run the skill's capture procedure and append only what survives its quality
  gate — candidates include the `RepoIntel` facade gaining an indexed-paths read
  and why AC-8 needs it, the two-surfaces spend rule (the header reports the
  displayed tour's generation, the failure notice reports the attempt that just
  failed, and merging them breaks one of the two), and anything the build
  discovered that the next session would plausibly get wrong. Newest first, under
  the matching section, with a real `path:line`. Never rewrite the file, never
  reorder or delete an existing entry; a wrong entry is corrected by appending a
  dated correction bullet. If nothing clears the gate, append nothing and say so.
- Done when: only appended lines appear in the diff, each dated and carrying
  evidence; no existing line is modified.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T13, T19

### T21 — Append client INSIGHTS · module: client · wave: 5
- Files: `client/INSIGHTS.md` (edit — append only)
- Skills: engineering-insights
- Do: the same procedure for the client's own learnings — candidates include the
  deliberate, spec-mandated edit to the vendored `client/src/vendor/ui/nav.ts`
  (AC-39, AC-57) so the next session does not treat the file as untouchable, the
  `activeKeyFor` fix and why `pathname.includes("/onboarding")` was wrong for two
  screens at once, and the complexity-colour module existing precisely so a third
  hand-rolled colour map is not created. Append only; if nothing clears the gate,
  append nothing and say so.
- Done when: only appended lines appear in the diff, each dated and carrying
  evidence; no existing line is modified.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T15, T18

## Contract & version impact

Yes — this touches `vendor/shared`, adds HTTP routes, extends the `RepoIntel`
facade and adds database columns.

**Verdict: MAJOR**, driven by exactly one change.

| Change | Surface | Who it breaks | Level |
|---|---|---|---|
| `OnboardingSection.kind`: `z.string()` → five-value enum | Zod contract + mirror | Any stored `onboarding.json` row, any bundle on the old `z.infer` | MAJOR |
| `+ OnboardingSection` structured payloads (all `.nullish()`) | Zod contract + mirror | Nobody — absent on old rows, tolerated by AC-5 | MINOR |
| `+ Onboarding.degraded` / `degraded_reason` | Zod contract + mirror | Nobody | MINOR |
| `+ RepoIntel.getIndexedPaths` | Facade interface | Nobody — additive method, no signature changed | MINOR |
| `+ onboarding_generations` table | Database | Nobody — new table | MINOR |
| `+` nullable columns on `onboarding` | Database | Nobody — nullable, no backfill | MINOR |
| `+ GET/POST /repos/:id/onboarding*`, `+ GET /repos/:id/file` | HTTP API | Nobody — new routes | MINOR |
| `client/messages/en/onboarding.json` copy replaced | User-facing strings | Nobody | PATCH |

**Who the MAJOR lands on, and how.** `rg -n 'OnboardingSection|Onboarding\b'
server/src client/src` finds no consumer outside the contract file and its
mirror, and the `onboarding` table is empty — so no row and no compiled call site
breaks today. The cost is bounded, but it is not zero: the shipped prompt's
`{{sections}}` placeholder and its `routes_and_apis` rules explicitly contemplate
a kind outside the five, so a row written by any process using the un-amended
prompt would stop parsing.

**No `@deprecated` marker is required.** There is no old field to keep alive —
this is a narrowing of one field's domain, not a rename or a removal, and there
is nothing for a consumer to migrate off. What makes the narrowing survivable is
AC-47: gate at write, degrade at read. A stored tour that fails the closed-kind
validation comes back as `degraded: true` with a reason instead of a 5xx. That
criterion is load-bearing, not decorative, and T8 plus T12 must both implement it
or the MAJOR becomes an error page.

**Rollout.** One expand step is sufficient and it is T1: the narrowed contract
and its byte-identical mirror land together, before any consumer task in wave 2
or later. No contract change shares a wave with a consumer of it. `pnpm typecheck`
in `server/` proves nothing about `client/`, so T1's `Done when` requires `diff`
over the two copies plus both typechecks.

**CHANGELOG entry:**

```
### Breaking
- `OnboardingSection.kind` is now the closed enum `architecture` |
  `critical_paths` | `run_locally` | `reading_path` | `first_tasks`. A tour
  containing any other kind is rejected at write; one already stored is returned
  as `degraded: true` with a reason rather than an error.

### Added
- `OnboardingSection` carries optional per-kind structured payloads; absent
  payloads render from the markdown `body` as before.
- `Onboarding` carries `degraded` and `degraded_reason`.
- `RepoIntel.getIndexedPaths(repoId)`.
- `GET /repos/:id/onboarding`, `POST /repos/:id/onboarding/generate`,
  `GET /repos/:id/file`.
```

## Verification (end to end)

In this order, from the repository root. This is the only place the integration
lane appears.

```sh
cd server && pnpm typecheck
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot
cd server && pnpm exec vitest run .it.test --no-file-parallelism
cd client && pnpm typecheck
cd client && pnpm exec vitest run --reporter=dot
cd server && cp ../.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs .dependency-cruiser.cjs && npx depcruise --config .dependency-cruiser.cjs src
diff server/src/vendor/shared/contracts/knowledge.ts client/src/vendor/shared/contracts/knowledge.ts
rg -n 'dangerouslySetInnerHTML' 'client/src/app/repos/[repoId]/onboarding' 'client/src/app/repos/[repoId]/files'
rg -n 'routes_and_apis' server/src/prompts/onboarding.system.md
```

Expected: both typechecks clean; the integration lane green — `--no-file-parallelism`
is not optional, `server/INSIGHTS.md` records container contention flaking a lane
that is green when serialized; depcruise reporting **0 errors** (warnings are the
documented pre-existing violations, and any error is something this feature just
introduced); the `diff` printing nothing; and the last two `rg` calls returning no
matches. There is no lint script in any module — do not run one. `e2e/` is not in
scope and its suite is not part of this feature's gate.

## Out of scope

- `reviewer-core/` — untouched. Nothing in this feature may add an import to it
  or from it.
- Any `e2e/` flow for the tour, by agreement with the caller.
- Execution of anything the tour contains — no Run button, no terminal, no
  `exec`, no devcontainer launch, now or later (AC-29).
- Editing a tour, per-user progress, GitHub issues from `first_tasks`, public or
  cross-workspace sharing, and automatic regeneration on push, re-index, schedule
  or page load.
- The sidebar regroup and the mock's five non-existent items — `Eval Dashboard`,
  `Memory`, `Multi-Agent Review`, `Agent Performance`, `CI Runs`. One item is
  added and nothing is moved (AC-57); the regroup gets its own spec.
- Any locale beyond `en`.
- The module specs for `server/specs/` and `client/specs/` — written by
  `doc-writer` after the build, not by this plan and not by the implementer.
- A cumulative spend view across generations. The generation state is one row per
  repository, so no history exists to sum.

## Open questions

None blocking. Two things the implementer should surface rather than decide
silently:

- The file-view endpoint reads through `GitClient.readFile`, which assumes the
  repository has a local clone. If a repository can hold an index row without a
  usable clone, T14's 404 path needs to cover that case too — say so rather than
  widening the guards.
- `RepoIntel.getIndexedPaths` returns every indexed path. On a very large
  repository that set is large enough to be worth a bounded query rather than a
  full materialisation; if T3 finds that to be the case, the cap belongs in
  `repo-intel`, not in the onboarding slice.
