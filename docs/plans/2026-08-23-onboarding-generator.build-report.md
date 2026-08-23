# Build Report — Onboarding Generator (SPEC-02)

Plan: `docs/plans/2026-08-23-onboarding-generator.md`
Step: `/sdd-build` (step 3 of 5). Execution mode: **multi-agent**, 5 waves, 21 tasks.
Next step: `/sdd-review docs/plans/2026-08-23-onboarding-generator.md`

## Gate verdicts

| Wave | Tasks | Gate | Rounds |
|---|---|---|---|
| 1 | T1–T6 | COMPLETE | 2 (1 remediation) |
| 2 | T7–T11 | COMPLETE | 2 (1 remediation) |
| 3 | T12, T14, T16a, T16b, T17 | COMPLETE | 1 |
| 4 | T13, T15, T18 | COMPLETE | 1 |
| 5 | T19, T20, T21 | COMPLETE | 1 |

Final state: server `pnpm typecheck` clean, 41 files / 518 tests passed (unit lane);
`server/test/onboarding.it.test.ts` 11/11 passed twice against fresh Postgres testcontainers.
Client `pnpm typecheck` clean, 53 files / 359 tests passed.

## Remediation rounds

**Wave 1** — item 1.7: T1's done-when required proof that a sixth `kind` fails to parse (AC-2).
The closed `z.enum` guaranteed it structurally but no test asserted it. Fixed by adding the
negative assertion at `server/test/contracts.test.ts:201-205`.

**Wave 2** — four items:
- 7.2a / 9.1 / T11: comments in new code (`ports.ts`, `repository.ts`,
  `onboarding-facts.test.ts`, `hooks/onboarding.ts`), violating root `CLAUDE.md`.
  Removed; the verifier confirmed no interface member changed alongside the prose.
- 8.12: `diagram` had no size governance at all — `overhead` in `truncateToDocumentBudget`
  counted the full uncapped diagram, so a large diagram could leave the document over
  `MAX_DOCUMENT_BYTES` regardless of body truncation. Fixed and tested.
- 8.13: the degraded read path returned `sections: []`, discarding sections that parsed
  fine, leaving nothing downstream to satisfy AC-46. Now salvages per-section.

## Scope drift

| File | Task | Adjudication |
|---|---|---|
| `server/src/modules/files/repository.ts` | T14 | **Justified plan gap.** `GET /repos/:id/file` must resolve `:id` against the caller's workspace; the onion ruleset's `drizzle-only-in-ring-3` (severity `error`) restricts Drizzle imports to `repository.ts`. `context`, `reviews` and `repo-intel` each roll their own `getRepo`. T14's `Files:` list was incomplete. |
| `server/INSIGHTS.md` | T14 (wave 3) | **Real cross-wave drift, benign.** Wave-3 task wrote a wave-5 deliverable. Append-only, well-formed, dated, no content collision with T20's candidates. |
| `client/INSIGHTS.md` | T16a (wave 3) | Same. Two bullets under Tool & Library Notes; no collision with T21's candidates. |
| `server/test/contracts.test.ts` | T1 | Not in T1's `Files:` list, but the plan's own AC-coverage table names it as T1's `Proven by` file for AC-3. |

T16b began the same INSIGHTS append and reverted it before finishing.
T20 and T21 were both warned to re-scan; neither re-captured the out-of-turn lessons.

## Carried-forward caveats for review

1. **T8 byte budget vs JSON escaping** — per-section budgets are computed on raw pre-escape
   byte length, not JSON-encoded length. A payload dominated by characters needing escaping
   could still exceed the ceiling. The original defect (`overhead` counting the uncapped
   diagram) is fixed; this is a separate residual.
2. **Truncated diagrams may be syntactically invalid mermaid.** Accepted: AC-7's existing
   `mermaid.parse` fallback omits the panel and renders prose, agnostic to why the string
   is invalid.
3. **`COMPLEXITY[complexity].label` is dead code** (`client/src/lib/onboarding.ts`). Rendering
   a hardcoded English label would violate the next-intl rule. Whether to delete the field
   is a quality call routed to `architecture-reviewer`.
4. **`RepoFile.truncated` has no message key** — the file view shows no truncation notice.
   The gate ruled this **not** a plan gap: no AC and no task's `Done when` requires it.
   New scope if wanted.
5. **T19's two timing-dependent tests** use a `DelayedLLM` sleeping 300ms. Architecturally
   the only way to observe `running` mid-flight, but a flake risk under CI scheduling load.
   Passed 11/11 twice locally.
6. **AC-48's "exactly one pipeline execution"** is proven only at the `llm.calls` call-count
   level; `MockLLMProvider` throws immediately on a schema-invalid fixture and never
   exercises a real schema-repair retry loop.
7. **`routes-smoke.test.ts` has no `onboarding` registration case** (it covers `skills`,
   `conventions`, `smart-diff`, `blast`). Not a plan violation — T13's `Files:` list
   excluded it — but "both routes resolve" rests on registration-level evidence.
8. **UNKNOWN, non-blocking**: T2's `pnpm db:migrate` (the verifier refuses mutating commands;
   the implementer ran it and reported `✓ migrations applied`), and the INSIGHTS dedup
   re-scan, which has no committed pre-wave-5 baseline to diff against.

## Blockers reported by implementers

None. No implementer reported being blocked on any task.

---

# Handoffs (verbatim)

## T1 — Onboarding contracts

- Contract changed: `server/src/vendor/shared/contracts/knowledge.ts` (mirrored to `client/src/vendor/shared/contracts/knowledge.ts`). This is the wave-1 contract every wave-2+ consumer task (T7–T21) depends on for `OnboardingSection`, `Onboarding`, and the new `OnboardingView` read DTO.
- `OnboardingSection.kind` narrowed `z.string()` → 5-value enum is the plan's declared **MAJOR** surface; `Onboarding.degraded`/`degraded_reason` and the new `OnboardingView` object are additive **MINOR**. No `@deprecated` marker was needed per the plan's rollout analysis (gate-at-write, degrade-at-read via T8/T12 covers the narrowing).
- `OnboardingView` is a new exported object, not a modification of `Onboarding` — it carries `tour`, `status` (`running`/`done`/`failed`/null), `failure_reason`, `generated_at`, `files_indexed`, `generated_sha`, `current_sha`, `model`, `cost_usd`, and a separate `failed_cost_usd` (both nullable, never coerced to `0`). Downstream tasks (T12 service DTO, T15 screen) should read this shape directly.

Gate-fix pass:
- `server/test/contracts.test.ts:196-204` now carries both fixtures side by side: a valid `architecture` section (AC-5-adjacent, already existed) and a `routes_and_apis` (sixth) kind asserted via `safeParse(...).success === false` (AC-2).
- No contract shape changed in this fix — only test coverage.

## T2 — Generation-state table and provenance columns

- Schema: `server/src/db/schema/context.ts` now exports `onboardingGenerations` (new table) and a widened `onboarding` table. `server/src/db/schema.ts` (the barrel) re-exports it automatically via its existing `export * from './schema/context'` — I did not touch that barrel file since it wasn't in T2's `Files:` list; T7 (ports/repository) will need to import `onboardingGenerations` directly from `./schema/context` or `./schema` when it wires the repository.
- Migration: `0020_square_black_widow.sql` is purely additive (new table + nullable columns), applied to the local dev DB. No backfill needed, no existing row touched — `onboarding` was empty before and after.
- A reviewer should check: the `onboardingGenerations` PK is `repo_id` (one row per repo, following `convention_scans`'s shape as instructed) — T7's `beginGeneration`/`finishGeneration` logic will rely on this being a true 1:1 upsert target, not an append-only log.

## T3 — RepoIntel indexed-paths read

- Surfaces touched: the `RepoIntel` facade interface (`server/src/modules/repo-intel/types.ts`), its Drizzle-backed repository (`server/src/modules/repo-intel/repository.ts`), and the service that wires the two (`server/src/modules/repo-intel/service.ts`). No route, contract, or DB schema changed.
- This is additive-only per the plan's `Contract & version impact` table (`+ RepoIntel.getIndexedPaths` — MINOR, no existing signature changed) — nothing here should surprise a consumer of the existing facade methods.
- `getIndexedPaths` currently materializes the full distinct path set per repo (two full-table scans over `file_rank`/`symbols` filtered by `repoId`, merged client-side). The plan's own `## Open questions` flags this as a place T8 (the onion consumer) should watch: if a very large repository makes this expensive, the cap belongs in `repo-intel`, not the onboarding slice — worth a reviewer's attention once T8/T12 land and exercise real repo sizes.
- No unit test file was added for this method specifically (T3's `Files:` list does not include a new test file, and the existing `repo-intel-facade-degraded.test.ts` / related suite already exercises the module and passed). If a reviewer wants explicit coverage of the union/degraded behavior, that would be a follow-up outside T3's scope.

## T4 — Onboarding prompt

`server/src/prompts/onboarding.system.md` is the only prompt file touched — the `{{sections}}` and `{{language}}` placeholders are untouched, and the three security-relevant blocks (`SECURITY:`, grounding rules, mermaid rules) were verified byte-identical by the new test, not just eyeballed. This prompt has no producer yet (T12/T13 wire it up in later waves) so nothing downstream consumes it in this run. A reviewer should check that the new "Structured payloads" instructions align with the exact contract shapes T1 lands (`critical_paths: {path, reason}`, `reading_path: {path, rationale}`, `first_tasks: {title, hint_path, complexity}`, and the AC-6 `classDef` mermaid rule) since T4 ran independently of T1 in this wave.

## T5 — Onboarding message copy

Full key set created in `client/messages/en/onboarding.json`, for wave-3/4 client implementers (T15, T16a, T16b, T17, T18) to consume via `useTranslations("onboarding")`:

- `title`, `onThisPage`, `regenerate`, `regenerating`, `unknownError`, `open`
- `generate.{title,body,cta,generating}` — `cta` takes `{model}` (AC-59)
- `loadError.title`
- `sections.{architecture,critical_paths,run_locally,reading_path,first_tasks}.{title,empty}` — keyed by the exact contract enum values so a dynamic `t(`sections.${kind}.title`)` lookup works (matches the existing dynamic-key pattern noted in `client/INSIGHTS.md` 2026-08-16)
- `badges.{stale,partial}`
- `freshness.{withFiles,withoutFiles}` — `withFiles` takes `{time, count}` with an ICU plural on `count` (AC-32/33)
- `header.{model,cost}` — two independent keys so `cost` can be omitted entirely rather than rendered as "—"/"$0.00" (AC-58, AC-60, AC-61)
- `failure.{title,cost}` — same omit-don't-zero pattern for AC-65/66
- `regenerateConfirm.{title,body,confirm,cancel}` — `body` takes `{model}` (AC-62)
- `copy.{action,copied,failed}` (AC-28, AC-51)
- `share.{label,copied,failed}` (AC-41, AC-51)
- `complexity.{low,medium,high}` (AC-14, AC-64)
- `fileView.notFound.{title,body}` (AC-53, for T18)

Note for T15: `common.actions.retry`/`common.actions.cancel` and `common.repoNotFound.*` already exist in `client/messages/en/common.json` — prefer those over inventing new onboarding-local equivalents for the retry control and the 404 state.

Design note: deliberately did **not** add a redundant `notFound` key for AC-43, because `client/src/components/repo-not-found/RepoNotFound.tsx` already exists and reads `common.repoNotFound.{title,body,cta}`. T15's implementer should reuse `<RepoNotFound />`.

## T6 — Nav item and active key

Files touched: `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts`, `client/src/components/app-shell/helpers.test.ts`.

`client/src/vendor/ui/nav.ts` is vendored code — this is the plan's deliberate, spec-mandated exception (AC-39/AC-57); worth confirming the `engineering-insights` entry the plan calls for (T21) actually lands so a future session doesn't treat the file as untouchable. No route, contract, DB schema or public export changed — this task is UI-nav-only and self-contained.

Deviation: chose `Workflow` as the `IconName`; the task left it as "an existing IconName" without naming one. Confirmed already exported from `client/src/vendor/ui/icons.tsx` (no icon-file edit needed).

## T7 — Onboarding ports and repository

**Port shapes T12's `service.ts` will consume** (from `server/src/modules/onboarding/ports.ts`):

- `RepoRefStore.getRepoRef(workspaceId, repoId): Promise<{ id; owner; name; fullName } | undefined>`
- `TourStore.readTour(repoId): Promise<OnboardingTourRow | undefined>` — `tourJson: unknown` (raw, unvalidated — T8's domain must validate/tolerate it per AC-47, not this repository)
- `TourStore.upsertTour(values: UpsertTour): Promise<void>` — `tour: Onboarding` (validated), one row per repo, full overwrite on conflict (AC-36)
- `GenerationStore.readState(repoId): Promise<GenerationStateRow | undefined>`
- `GenerationStore.beginGeneration({ repoId, workspaceId }): Promise<boolean>` — `false` means a `running` row already existed and was left untouched (AC-19)
- `GenerationStore.finishGeneration(repoId, patch): Promise<void>` — always writes `status: 'done'`
- `GenerationStore.failGeneration(repoId, patch): Promise<void>` — always writes `status: 'failed'`, requires `patch.error: string`
- `GenerationStore.reapRunning(error): Promise<number>` — closes every `running` row, returns count closed (AC-22)
- `RepoFacts` — structural mirror of `RepoIntel`'s `getIndexState`/`getRepoMap`/`getTopFilesByRank`/`getCriticalPaths`/`getIndexedPaths`; T13 wires `container.repoIntel` straight into a `RepoFacts`-typed variable with no cast (same pattern as `blast/ports.ts`'s `BlastEngine`)
- `GitReader.readFile(repo: RepoRef, path): Promise<string>` — `container.git` satisfies this structurally
- `FeatureModelResolver` re-exported unchanged from `@devdigest/shared`

No Drizzle or Fastify types appear in `ports.ts`; nothing outside `repository.ts` should import `t.onboarding` / `t.onboardingGenerations` directly. A reviewer should check that T12's `service.ts` takes these ports via a constructor-injected deps bag (never `Container`), matching `intent/service.ts`'s `IntentServiceDeps` shape, and that T13's `routes.ts` is the only place `OnboardingRepository`, `SettingsFeatureModelResolver`, and the `RepoFacts`/`GitReader` structural assignments get constructed.

Design decision flagged for review: `beginGeneration`'s AC-19 requirement is implemented as a single atomic `INSERT ... ON CONFLICT (repo_id) DO UPDATE ... WHERE status != 'running'` using Drizzle's `setWhere`. When the conflict branch's `WHERE` doesn't match, `RETURNING` yields zero rows, read as `false`. This avoids a read-then-write race.

`getRepoRef` is not one of the "two stores" the plan names, but T12/T13 need it and it belongs nowhere else — added as a third small port following `ConventionsRepository.getRepoRef`'s precedent.

## T8 — Onboarding domain rules

- `server/src/modules/onboarding/domain.ts` — pure functions only (`zod` + `@devdigest/shared` + own `constants.ts`), no repository/Fastify/Drizzle imports; T12 (service.ts) will call `groundEntries`, `applyCaps`, `readStoredTour`, `degradedFromIndexStatus`, `isStale`, `validateSectionKinds`, `reasonNumbersAreGrounded` and `isValidComplexity` to implement the write/read gates.
- `reasonNumbersAreGrounded` matches bare digit sequences (`\d+(\.\d+)?`) — T9's facts-block "allowed numbers" set needs to supply numbers in the same textual form (e.g. `"14"` not `"14.0"`) or legitimate reasons will be rejected as fabricated.
- No contract, schema, or route surface was touched by this task.

Interpretive call: "any single string 200 characters" was applied to the short structured-payload strings and not to `body`/`diagram`, which are governed instead by the whole-document 128 KB budget. Truncating prose bodies to 200 characters would contradict AC-4/AC-5's markdown-rendering requirement.

Gate-fix pass:
- Diagram/body split policy: when a section carries a diagram and the document is over budget, the diagram gets up to half that section's per-section byte allocation, truncated UTF-8-safely first, and the body gets whatever remains. If T15/T16a's `MermaidDiagram` needs the diagram string to stay syntactically parseable rather than merely byte-truncated, note that `applyCaps` truncation can produce an invalid mermaid string; AC-7 already requires the client to fall back to prose-without-diagram on a `mermaid.parse` failure, so a hard-truncated diagram degrades gracefully through that existing path.
- `readStoredTour`'s salvage only keeps sections that individually satisfy `OnboardingSection`'s full schema (including the closed `kind` enum) — a section with a *valid* kind but some other schema violation is also dropped, not partially repaired. That's consistent with "gate at write, degrade at read" but worth flagging to whoever reviews AC-46/AC-47 together.

## T9 — Facts assembler

- `server/src/modules/onboarding/facts.ts` exports `assembleOnboardingFacts(repoIntel, git, repo, repoId): Promise<OnboardingFacts>` — `block` (the fenced, escaped prompt text), `topFiles`, `criticalPathCandidates`, `packageScripts`, `repoMapDegraded`, and `citableNumbers: ReadonlySet<string>` built with the same `/\d+(\.\d+)?/g` literal T8's `domain.ts` already uses in `reasonNumbersAreGrounded` — T12 (service, wave 3) is the wiring point that should pass `facts.citableNumbers` into that function and interpolate `facts.block` into the user message alongside T4's system prompt.
- `OnboardingFactsRepoIntel` and `OnboardingFactsGit` are narrow structural ports declared in `facts.ts` itself (not `ports.ts`, since that belongs to T7). A reviewer should confirm T12 wires `container.repoIntel` / `container.git` in directly (they satisfy these structurally, no import needed) rather than re-declaring a third copy in `ports.ts`.
- No contract, schema, or route surface changed by this task.

Deviation: `RepoIntel` is a sibling slice, so per `no-cross-slice-imports` (scored `error`) narrow structural interfaces were declared locally in `facts.ts` instead of importing `modules/repo-intel/types.ts`. `escapeFence` is mirrored verbatim from `intent/classifier.ts` per the task's explicit instruction, not imported.

## T10 — Complexity colour module

New module `client/src/lib/onboarding.ts` exports:
- `ONBOARDING_SECTION_KINDS: readonly OnboardingSectionKind[]` — the five kinds in AC-1 order (`architecture`, `critical_paths`, `run_locally`, `reading_path`, `first_tasks`), for the rail/cards/container to share one list.
- `COMPLEXITY: Record<OnboardingTaskComplexity, { c: string; bg: string; label: string }>` and `complexityStyle(complexity)` — the single colour+accessible-word source for the three complexity values (`low`/`medium`/`high` → green/amber/red, `Low`/`Medium`/`High`).

T16b (`FirstTasksSection`) should import `complexityStyle`/`COMPLEXITY` rather than hand-rolling a colour map, and T17 (`OnThisPageRail`) should import `ONBOARDING_SECTION_KINDS` for its five entries in order.

Deviation: colours use existing theme CSS custom properties (`var(--ok)`, `var(--warn)`, `var(--crit)`) already defined for both light/dark in `client/src/vendor/ui/styles.css`, rather than new literals.

## T11 — Onboarding and file-view data hooks

Exact hook signatures for T15, T17, T18:

```ts
useOnboarding(repoId: string | null | undefined): UseQueryResult<OnboardingView, ApiError>
// polls at 1500ms while data.status === "running", stops otherwise (AC-17)

useGenerateOnboarding(repoId: string | null | undefined): UseMutationResult<{ status: string }, ApiError, void>
// POST /repos/:id/onboarding/generate, invalidates ["onboarding", repoId] on success

useRepoFile(repoId: string | null | undefined, path: string | null | undefined):
  UseQueryResult<RepoFile, ApiError> & { isNotFound: boolean }
// GET /repos/:id/file?path=<encodeURIComponent(path)>, retry: false
// RepoFile = { path: string; content: string; truncated?: boolean }
// isNotFound = true when the error is an ApiError with status 404 — T18 should
// branch on isNotFound rather than isError for its own not-found state (AC-53)
```

These endpoints don't exist yet at time of writing; they land in T13/T14. `OnboardingView` (from `@devdigest/shared`) is the exact contract these hooks type against.

Deviation: `RepoFile` is a locally-defined TypeScript interface in `onboarding.ts`, not a `@devdigest/shared` contract — no task adds a shared contract for `GET /repos/:id/file` (T14 hand-writes that DTO server-side, matching the repo convention that no route declares a `response:` schema). The shape mirrors the existing `ProjectDocBody` pattern used by the analogous `GET /repos/:id/context/file` endpoint.

## T12 — Onboarding service

**Constructor shape** T13 must build:
```ts
new OnboardingService({
  repoRefs: OnboardingRepository instance,   // RepoRefStore
  tours: OnboardingRepository instance,      // TourStore
  generations: OnboardingRepository instance,// GenerationStore
  facts: container.repoIntel,                // satisfies RepoFacts & OnboardingFactsRepoIntel structurally
  git: { readFile: container.git.readFile }, // GitReader
  featureModels: new SettingsFeatureModelResolver(container.db),
  llm: (provider) => container.llm(provider),
  logger: req.log / app.log,
})
```
(`OnboardingRepository` from T7 implements `TourStore`, `GenerationStore` and `RepoRefStore` simultaneously, so one instance can be passed for all three.)

**Methods T13's routes.ts must call:**
- `getView(workspaceId, repoId): Promise<OnboardingView>` — `GET /repos/:id/onboarding`. Throws `NotFoundError` for an unknown/foreign repo (maps to 404, AC-42).
- `beginGeneration(workspaceId, repoId): Promise<void>` — must be `await`ed before the 202 reply. Throws `ConflictError` (409) when the repo is unindexed (AC-44, no provider call made) or a generation is already `running` (AC-19).
- `runGeneration(workspaceId, repoId): Promise<void>` — start **unawaited** right after `beginGeneration` resolves, then reply 202 (AC-15/16). It never throws — all failures are caught internally and written to the generation-state row.
- `reapRunning(): Promise<number>` — `await` at plugin load, before the server accepts requests (AC-22), and log the returned count.

**Surfaces this reaches:** no contract or DB schema changes in this task. `OnboardingView`'s `model` field is always the *currently resolved* `onboarding` feature model (not the model used historically), per AC-58–60 — a reviewer should confirm T15's header rendering expects that. `cost_usd`/`failed_cost_usd` are always `number | null`, never coerced to `0`.

Design decision: T7's `RepoFacts` port omits `getFileRank`, which T9's `assembleOnboardingFacts` requires. `OnboardingServiceDeps.facts` is typed as the intersection `RepoFacts & OnboardingFactsRepoIntel` rather than a new bridging interface.

## T14 — Repo file-read endpoint

- New HTTP surface: `GET /repos/:id/file?path=<encoded>` → `{ path, content, truncated? }`, matching T11's client hook contract exactly and the `GET /repos/:id/context/file` precedent it was modeled on.
- `server/src/modules/index.ts` now has one added import + one added entry (`files`). T13 (wave 4) also edits this file to register `onboarding` — the two are two waves apart precisely to avoid collision, and my edit only touched the `files` line.
- Untrusted-input boundary worth a second look in review: `assertRepoRelativePath` in `server/src/modules/files/service.ts` (absolute-path, `..`-segment, percent-encoding-mismatch, null-byte, backslash and length guards, all rejected with 400 before any repo lookup or filesystem touch — verified path checked *before* `RepoLookup.findRepo` is even called, see the "rejects a malicious path before touching the repo lookup" test).
- Open question the plan flagged for T14 (repository without a usable local clone): `container.git.readFile` throws on a missing clone directory exactly like a missing file, and `FilesService.readFile` catches both into the same `NotFoundError('No such file: ...')` — so an un-cloned repo already degrades to the same 404 as a missing file, no special-casing needed. Worth a reviewer's confirmation that this is the desired behavior (vs. a distinct "not cloned" error the way `context/service.ts` does with `AppError('not_cloned', …, 404)`).
- `server/.dependency-cruiser.cjs` was copied in for verification and removed afterward — it is not part of the diff.

Deviation: T14's `Files:` list omitted `server/src/modules/files/repository.ts`. Resolving `:id` against the caller's workspace requires a DB query, and the onion ruleset's `drizzle-only-in-ring-3` rule (severity `error`) forbids a `drizzle-orm`/`db/schema` import from anything outside `repository.ts` for a brand-new module. Every sibling module needing this same resolution (`context`, `reviews`, `repo-intel`) rolls its own local `getRepo` query.

## T16a — Section shell, architecture, critical paths, reading path

Props for T15 (`OnboardingView`) to compose:
- `SectionCard`: `{ title: string; badge?: React.ReactNode; defaultExpanded?: boolean; children: React.ReactNode }` — generic shell; wrap each leaf content component in one, passing `t(`sections.${kind}.title`)` as `title`.
- `ArchitectureSection`: `{ section: OnboardingSection }`.
- `CriticalPathsSection`: `{ section: OnboardingSection; repoId: string }` — `repoId` is only needed here (builds the `Open` link to T18's file view at `/repos/${repoId}/files?path=<encoded>`).
- `ReadingPathSection`: `{ section: OnboardingSection }` — no `Open` control per the plan's AC mapping (only `CriticalPathsSection.test.tsx` proves AC-27).

Things a reviewer should check: the `null`/`[]`/non-empty tri-state convention applied uniformly across structured payloads (worth confirming against T16b's `RunLocallySection`/`FirstTasksSection`, which the plan describes with the same "structured over body, body alone when absent, empty at zero" language — T16a did not read or touch their files). `MermaidDiagram` itself was not modified — `securityLevel: "strict"` and the `mermaid.parse` pre-check are untouched, confirmed by inspection only. No `response:` schema or contract files were touched by T16a.

Deviation: dropped `@testing-library/user-event` from `SectionCard.test.tsx` — it is not a dependency of `client/`. Proved keyboard-operability via native `<button>` semantics (`tagName === "BUTTON"`, `focus()`/`toHaveFocus()`) plus `fireEvent.click`.

## T16b — Run-locally and first-tasks cards

**Component props** (for T15, which composes T16a/T16b/T17):
- `RunLocallySection({ section: OnboardingSection })` — reads `section.run_locally` (steps) and `section.body`.
- `FirstTasksSection({ section: OnboardingSection })` — reads `section.first_tasks` (tasks) and `section.body`.

Both expect the *entire* `OnboardingSection` object for the matching `kind`, not a pre-extracted array — this lets each component implement the three-way branch itself (structured non-empty → render rows; `null`/`undefined` → render `body` via the vendored `Markdown` primitive; empty array `[]` → render the section's own i18n empty state), matching the domain-rule wording in T8/AC-10. Neither component renders its own section title or wraps itself in a collapsible shell — that's `SectionCard`'s job (T16a), composed by T15.

**Two things for the reviewer to look at:**
1. Complexity pill accessible name/colour split: the visible/accessible text (`"Low"`/`"Medium"`/`"High"`) comes from `useTranslations("onboarding")` → `complexity.low/medium/high` (next-intl, satisfying `client/CLAUDE.md`'s i18n rule), while only the colour (`c`, `bg`) comes from `complexityStyle()` in `client/src/lib/onboarding.ts` (T10). T10's `COMPLEXITY[complexity].label` field exists but is unused by this component — it's a hardcoded English duplicate of the same word, so it was deliberately not rendered to avoid a second, untranslated copy.
2. Clipboard behavior: `RunLocallySection`'s copy control checks `navigator.clipboard` existence before calling `writeText`, treats both "clipboard unavailable" and "write rejected" as the same inline-failure state (`role="alert"`, text stays in place and selectable via `userSelect: "text"`), and never falls back to `window.prompt` or any modal.

**Contract/DB/public-export impact**: none from T16b itself.

## T17 — Rail, regenerate confirmation, share link

For T15 (wave 4), which composes these three:

- **`OnThisPageRail`** — no props; self-contained. It expects each rendered section wrapper to carry `id={onboardingSectionElementId(kind)}` (exported from `OnThisPageRail`'s `index.ts`) so its scroll-tracking and `scrollIntoView` activation can find them. It listens for `scroll` on `document.querySelector("main")` (falling back to `window`), so it must be rendered inside the app shell's `<main>`.
- **`RegenerateButton`** — `{ repoId: string; model: string; disabled?: boolean }`. Pass `disabled` while `status === "running"` for AC-18; `model` should be the resolved model name from `useOnboarding(repoId).data?.model` (no null fallback was added — T15 should only render this once a model name is known, or supply one).
- **`ShareLinkButton`** — no props; copies `window.location.href` as-is, so T15 just needs to mount it on the onboarding route.

None of the three fetches directly; `RegenerateButton` is the only one touching data, via `useGenerateOnboarding` from `@/lib/hooks/onboarding` (T11).

No INSIGHTS entry appended — nothing found here cleared the quality gate.

## T13 — Onboarding routes and module registration

- `container.repoIntel` satisfies `RepoFacts & OnboardingFactsRepoIntel` structurally with zero casts — confirmed by a clean `pnpm typecheck`, first time this intersection was compiler-checked.
- Reviewers should look at: the `keyGenerator` cast `(req.params as { id: string }).id` in `server/src/modules/onboarding/routes.ts` — `@fastify/rate-limit`'s `keyGenerator` receives an untyped `FastifyRequest` (not scoped to the route's Zod schema), so a cast was unavoidable; there was no existing `keyGenerator` example in the codebase to match against.
- Both routes rely on the global error handler (`server/src/app.ts:116`) mapping `AppError` subclasses (`NotFoundError` → 404, `ConflictError` → 409) — no route-level try/catch was added, matching `intent/routes.ts`'s style.
- No `response:` schema was added to either route, per the constraint.
- This task's scope did not include `server/test/onboarding.it.test.ts` (T19) or `server/INSIGHTS.md` (T20).
- Full server suite (including `.it.test.ts` integration lane) was intentionally not run, per the per-task verification rules.

Judgment call: `runGeneration` is documented by T12 as never throwing, but a `.catch` was still attached in the route as a last-resort safety net against an unhandled rejection. It only logs, starts nothing new, and does not change AC-16's fire-and-forget behavior.

## T15 — Onboarding screen and route

- `client/src/app/repos/[repoId]/onboarding/page.tsx` and the `OnboardingView` folder are new; no contract, DB schema, or public export changed by this task.
- Worth a reviewer's attention: `OnboardingView.tsx` computes `generating = running || generate.isPending` and passes it as `disabled` to `RegenerateButton`, and separately drives its own `EmptyState`/failure-retry `Button` — verify this satisfies AC-18's "Generate and Regenerate disabled while running" without over-coupling the two mutation call-sites (they're independent hook instances by design, matching the `mutation.error`-as-derived-state insight in `client/INSIGHTS.md`).
- The five section slots are driven off `ONBOARDING_SECTION_KINDS` (T10), and a kind absent from `tour.sections` renders `t(`sections.${kind}.empty`)` directly in the view rather than through a leaf component — this is the one place T15 does its own tri-state-adjacent branching (missing-section, not the leaf components' null/undefined/[] branching, which stays inside T16a/T16b as instructed).
- Did not touch `client/INSIGHTS.md` (T21's file).

Deviation: the "Generate" CTA (never-toured state) and the failure-state "Retry" both call the same `useGenerateOnboarding` mutation directly from `OnboardingView`, separate from `RegenerateButton`'s own confirmation-gated mutation instance — this follows from AC-18, AC-23 and AC-21 (retry on failure, no confirmation required there unlike AC-62's regenerate confirmation).

## T18 — In-app file view

- No contract, DB schema, or public export changed — this task only adds a new client route (`/repos/:repoId/files`) and its component tree, consuming existing T11 hooks and T5 messages.
- Files to look at: `client/src/app/repos/[repoId]/files/page.tsx`, `client/src/app/repos/[repoId]/files/_components/FileView/FileView.tsx`, `.../styles.ts`, `.../index.ts`, `.../FileView.test.tsx`.
- Verify AC-27/AC-53 end-to-end once T16a (Open control) and T15 (OnboardingView) have landed in the same tree — T18 was built and tested in isolation with `next/navigation` and `@/lib/hooks` mocked, since T15/T16a ran in parallel waves.
- Confirmed no `dangerouslySetInnerHTML`, no direct `fetch` in the component (data goes through `useRepoFile` only), and content renders as plain React text (`<pre>{data.content}</pre>`) — never interpreted as HTML or executed.
- Did not touch `client/INSIGHTS.md` (T21's file) or `client/messages/en/onboarding.json` (T5's file).

**Surfaced gap:** `RepoFile.truncated` has no message key. `client/messages/en/onboarding.json` carries only `fileView.notFound.title`/`body`. `FileView` therefore renders possibly-truncated content without any visible truncation notice, rather than inventing a hardcoded string. (The wave-4 gate subsequently ruled this out of the plan's scope, not a dropped requirement.)

## T19 — Onboarding integration test

- `server/test/onboarding.it.test.ts` is new; nothing else was touched by this task.
- Mocking approach worth a second look: `MockLLMProvider.completeStructured` always returns fixed `tokensIn: 100, tokensOut: 50, costUsd: 0.001` on success and *throws* on a schema mismatch rather than partially failing — a schema-invalid fixture (`INVALID_SCHEMA_TOUR`, an out-of-enum `kind`) exercises the AC-48/AC-67 "provider returned no usage" path via the service's outer `catch`, and a schema-valid-but-domain-invalid fixture (`MISSING_KIND_TOUR`, 4 of 5 kinds) exercises the AC-49 "real usage on a failed row" path through `validateSectionKinds`. Both are real code paths in `service.ts`, not synthetic shortcuts, but a reviewer should confirm that distinction reads as intentional.
- The two timing-sensitive tests (AC-15/16 and AC-19) rely on a `DelayedLLM` subclass of `MockLLMProvider` sleeping 300ms before resolving `completeStructured`, so the fire-and-forget background task is still `running` when the immediate follow-up request fires. This passed cleanly twice in a row locally; if it ever flakes under load, the fix is to raise the delay, not to restructure the test.
- No contract, schema, or public-export changes — this task only added a test file.

## T20 — Server INSIGHTS

Appended 4 new bullets to `server/INSIGHTS.md`, all dated 2026-08-23, all with verified `path:line` evidence gathered by reading the actual code:

**Codebase Patterns** (newest-first, inserted after the section header, before the existing T14 entry):
1. `OnboardingView.cost_usd` vs `.failed_cost_usd` read from two different tables (`onboarding` vs `onboarding_generations`) gated by `isFailed` — `server/src/modules/onboarding/helpers.ts:134-150`, `server/src/vendor/shared/contracts/knowledge.ts:99-114`.
2. `RepoIntel.getIndexedPaths` unions `file_rank` + `symbols`, and inherits the facade-wide `repoIntelEnabled` gate, meaning a disabled repo-intel silently drives AC-8/AC-10's empty-payload path — `server/src/modules/repo-intel/repository.ts:450-463`, `service.ts:818-822`, `server/src/modules/onboarding/domain.ts:57-71`.
3. `container.repoIntel` structurally satisfies two independently-declared narrow ports (`RepoFacts` + `OnboardingFactsRepoIntel`) with zero casts, a second live instance of the `BlastEngine` pattern already documented — `server/src/modules/onboarding/service.ts:36`, `ports.ts:102-108`, `facts.ts:27-32`, `routes.ts:25`.

**Tool & Library Notes**:
4. `@fastify/rate-limit`'s `keyGenerator` type forces an inline `as { id: string }` cast because a narrowed `FastifyRequest<{Params:...}>` parameter fails `tsc` TS2322 under contravariant function-type checking — reproduced independently with a throwaway `tsc` check against this repo's real `@fastify/rate-limit` types (`node_modules/@fastify/rate-limit/types/index.d.ts:125`); `server/src/modules/onboarding/routes.ts:9-14,49-52`.

No existing entry was modified, reordered, or deleted. One plan-suggested candidate — "cost/token columns must be written as `null`, never `0`" — was evaluated and deliberately **not** appended: it restates the already-documented 2026-07-29 "NEVER coerce with `?? 0`" rule almost verbatim and did not clear the dedup gate.

Reviewers should sanity-check the two `getIndexedPaths`/`repoIntelEnabled` and rate-limit claims — both were verified by reading the live code and, for the rate-limit claim, by an independent `tsc` reproduction.

## T21 — Client INSIGHTS

Appended three bullets to `client/INSIGHTS.md` under `## Codebase Patterns`, all dated 2026-08-23, newest-first, each with a real `path:line`:

1. `client/src/vendor/ui/nav.ts:26,65` is a deliberate, spec-mandated edit (AC-39, AC-57) — flags that the file is not universally untouchable.
2. `client/src/components/app-shell/helpers.ts:29` — documents why `activeKeyFor` needed an anchored regex instead of `.includes("/onboarding")`, which matched both `/repos/:id/onboarding` and the unrelated top-level `/onboarding` route.
3. `client/src/lib/onboarding.ts:11-18` plus `FirstTasksSection.tsx:24,35` — records that the module exists to prevent a third hand-rolled colour map, and that `COMPLEXITY[complexity].label` is genuinely unused dead code (the accessible word comes from next-intl instead), flagged so a future session doesn't misread or delete it.

Nothing was rewritten, reordered or deleted; no existing line was touched. Re-scanned first and confirmed the two out-of-turn T16a entries were already present under **Tool & Library Notes** — did not re-capture either.
