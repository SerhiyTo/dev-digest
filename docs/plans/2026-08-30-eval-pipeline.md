# Implementation Plan: Eval pipeline — regression harness for reviewer agents — 2026-08-30

## Context

A reviewer agent's prompt can be edited today with no way to tell whether the
edit improved anything. SPEC-04 closes that loop: an accept/dismiss decision on
a finding becomes a durable eval case, an agent author runs the whole set on
demand, a deterministic scorer at ring 0 turns the result into recall,
precision and citation accuracy, and two runs sit side by side with the system
prompt that produced each.

The tables (`eval_cases`, `eval_runs`) and the contracts (`contracts/eval-ci.ts`)
already exist and are entirely unread — no `modules/eval/`, no `/evals` route,
no consumer of `EvalCaseInput` anywhere. This plan builds the slice that fills
them, expands the schema for suite runs, adds the scorer to `reviewer-core/`,
adds two client routes, one e2e flow and a `verify:l06` command.

## Source of truth

- spec: `specs/2026-08-30-eval-pipeline.md` (SPEC-04, Status: approved) — this
  plan is **not** the spec, and defines no behaviour of its own.
- roadmap lesson: **L06** (`README.md:96`). The rest of the L06 row — Secret/
  Phantom gates, Plan Verifier, Export to CI — is out of scope per the spec's
  Non-goals.
- INSIGHTS consulted: `server/INSIGHTS.md`, `client/INSIGHTS.md`,
  `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md`.
- Module specs checked: `server/specs/`, `client/specs/` — no dated spec covers
  eval. `reviewer-core/specs/` and `e2e/docs/` are empty.

## Acceptance-criteria coverage

One row per `AC-n` in SPEC-04's `## Acceptance criteria`, in spec order.

| AC | Criterion (shortened) | Tasks | Proven by |
|---|---|---|---|
| AC-1 | accepted finding → case with one `must_find` expectation | T9, T11 | `server/test/eval.it.test.ts` |
| AC-2 | dismissed finding → case with one `must_not_flag` expectation | T9, T11 | `server/test/eval.it.test.ts` |
| AC-3 | undecided finding → 400, no case; client control disabled | T11, T20, T27 | `server/test/eval.it.test.ts`; `.../EvalCaseButton/EvalCaseButton.test.tsx` |
| AC-4 | case stores a snapshot of the cited file's unified diff | T11 | `server/test/eval.it.test.ts` |
| AC-5 | case records the source finding id | T3, T11 | `server/test/eval.it.test.ts` |
| AC-6 | second create for the same finding returns the existing case | T9, T11 | `server/test/eval.it.test.ts` |
| AC-7 | client confirms creation, names the case, offers to open it | T20, T27 | `.../EvalCaseButton/EvalCaseButton.test.tsx` |
| AC-8 | case named after the finding, numeric suffix on collision | T9 | `server/test/eval-domain.test.ts` |
| AC-9 | one schema validates every expected output | T2, T7 | `server/test/contracts.test.ts` |
| AC-10 | invalid expected output → 400, nothing persisted, index + field named | T11 | `server/test/eval.it.test.ts` |
| AC-11 | invalid JSON marks the field invalid and disables Save | T19 | `.../EvalCaseEditor/EvalCaseEditor.test.tsx` |
| AC-12 | skeleton insertion requires a kind choice and inserts that kind | T19 | `.../EvalCaseEditor/EvalCaseEditor.test.tsx` |
| AC-13 | empty expectation list is legal and asserts silence | T2, T9 | `server/test/eval-domain.test.ts` |
| AC-14 | agent eval page lists every owned case with kinds + last outcome | T18, T26 | `.../EvalCaseList/EvalCaseList.test.tsx` |
| AC-15 | a never-run case is labelled "never run", no pass/fail state | T18 | `.../EvalCaseList/EvalCaseList.test.tsx` |
| AC-16 | zero cases → empty state, create affordance, no percentages | T18 | `.../EvalCaseList/EvalCaseList.test.tsx` |
| AC-17 | deleting an agent deletes its cases and their runs | T8, T23 | `server/test/eval-agent-delete.it.test.ts` |
| AC-18 | cross-workspace case or run read/write → 404 | T8, T11 | `server/test/eval.it.test.ts` |
| AC-19 | one suite run per start, carrying agent + current version + start time | T11 | `server/test/eval-runner.it.test.ts` |
| AC-20 | one per-case row per case, with output, metrics, duration, cost | T11 | `server/test/eval-runner.it.test.ts` |
| AC-21 | second start while one is in progress → 409, no second suite run | T11 | `server/test/eval-runner.it.test.ts` |
| AC-22 | a failing case does not stop the suite and stays in the denominators | T11 | `server/test/eval-runner.it.test.ts` |
| AC-23 | completion writes aggregates, passed/total, cost, duration, marks complete | T11 | `server/test/eval-runner.it.test.ts` |
| AC-24 | a run whose process died is incomplete, excluded from trend/delta/compare | T8, T11 | `server/test/eval-runner.it.test.ts` |
| AC-25 | eval-run starts limited to 10/minute/workspace | T11 | `server/test/eval-runner.it.test.ts` |
| AC-26 | a single-case run has a null suite id and feeds no aggregate | T11 | `server/test/eval-runner.it.test.ts` |
| AC-57 | the grounding gate applies before persisting or scoring eval findings | T11 | `server/test/eval-runner.it.test.ts` |
| AC-58 | a cancel control is shown while a suite run is in progress | T16 | `.../EvalRunList/EvalRunList.test.tsx` |
| AC-59 | cancel stops after the case in flight, marks cancelled, keeps written rows | T11 | `server/test/eval-runner.it.test.ts` |
| AC-60 | a cancelled run does not block the next start | T11 | `server/test/eval-runner.it.test.ts` |
| AC-61 | a cancelled run is excluded from trend, delta and comparison | T8, T16 | `server/test/eval-runner.it.test.ts`; `.../EvalRunList/EvalRunList.test.tsx` |
| AC-62 | a cancelled run is labelled, shows no aggregate %, keeps per-case rows readable | T16 | `.../EvalRunList/EvalRunList.test.tsx` |
| AC-27 | metrics come from a function taking only expectations + findings, no I/O | T1 | `reviewer-core/test/eval-score-purity.test.ts` |
| AC-28 | match rule: same file, overlapping widened range, same category | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-29 | severity and title agreement recorded but never decide the match | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-30 | recall = matched `must_find` / present `must_find` | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-31 | a case with no `must_find` leaves the recall denominator alone | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-32 | precision counts a `must_not_flag` violation as an unmatched finding | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-33 | citation accuracy = matched findings cited inside the widened range | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-34 | a case passes iff all `must_find` matched and no `must_not_flag` violated | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-35 | no `must_find` anywhere → recall not computed, rendered as such | T1, T14 | `reviewer-core/test/eval-score.test.ts`; `.../EvalMetricStrip/EvalMetricStrip.test.tsx` |
| AC-36 | zero findings for a case → precision not computed, excluded from denominator | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-37 | identical inputs give identical metrics regardless of ordering | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-56 | one ±3 tolerance, used by both the match rule and citation accuracy | T1 | `reviewer-core/test/eval-score.test.ts` |
| AC-38 | dashboard lists each agent with cases, its latest run's five values | T13, T25 | `.../EvalAgentCard/EvalAgentCard.test.tsx` |
| AC-39 | an agent with no completed run shows "never run", no % and no delta | T13 | `.../EvalAgentCard/EvalAgentCard.test.tsx` |
| AC-40 | exactly one completed run → no delta plus an explicit statement | T14 | `.../EvalMetricStrip/EvalMetricStrip.test.tsx` |
| AC-41 | agent page: three metrics with deltas, trend, run list | T14, T15, T16, T26 | `.../EvalMetricStrip/*.test.tsx`, `.../EvalTrendChart/*.test.tsx`, `.../EvalRunList/*.test.tsx` |
| AC-42 | a fallen metric is named in a banner with its magnitude | T14 | `.../EvalMetricStrip/EvalMetricStrip.test.tsx` |
| AC-43 | trend series oldest→newest, capped at 30 completed runs | T8, T15 | `server/test/eval-runner.it.test.ts`; `.../EvalTrendChart/EvalTrendChart.test.tsx` |
| AC-44 | compare enabled at exactly two selected runs, disabled otherwise | T16 | `.../EvalRunList/EvalRunList.test.tsx` |
| AC-45 | compare shows older/newer/difference, older always on the left | T17 | `.../EvalCompareModal/EvalCompareModal.test.tsx` |
| AC-46 | compare shows the system-prompt difference between the two snapshots | T17 | `.../EvalCompareModal/EvalCompareModal.test.tsx` |
| AC-47 | a missing snapshot → prompt diff unavailable, metric diffs still shown | T17 | `.../EvalCompareModal/EvalCompareModal.test.tsx` |
| AC-48 | two runs at the same version → stated that configuration did not change | T17 | `.../EvalCompareModal/EvalCompareModal.test.tsx` |
| AC-49 | a prompt change between two runs over one set moves recall or precision | T24 | `server/test/eval-prompt-sensitivity.it.test.ts` |
| AC-50 | ≥8 runnable cases for one reviewer agent in a prepared environment | T10 | `server/test/eval-seed.it.test.ts` |
| AC-51 | `pnpm verify:l06` runnable from both `server/` and `client/` | T22 | `scripts/verify-l06.sh`; both `package.json` manifests |
| AC-52 | the command fails on any of the eight named lanes | T22 | `scripts/verify-l06.sh` |
| AC-53 | a route-registration lane and a scorer-purity lane | T1, T11, T22 | `server/test/routes-smoke.test.ts`; `reviewer-core/test/eval-score-purity.test.ts` |
| AC-54 | a lane that cannot run is reported skipped, never as verified | T22 | `scripts/verify-l06.sh` |
| AC-55 | one e2e flow: create case → list → run → compare, no model call | T28 | `e2e/specs/11-evals.flow.json` |
| AC-63 | the seed plants ≥8 cases on `Security Reviewer`, each with diff + expectations | T10 | `server/test/eval-seed.it.test.ts` |
| AC-64 | a second seed does not multiply the seeded cases | T10 | `server/test/eval-seed.it.test.ts` |
| AC-65 | a seeded case pair whose outcomes one named prompt line decides | T10 | `server/test/eval-prompt-sensitivity.it.test.ts` |
| AC-66 | vocabulary note in `specs/README.md` and the eval module's own docs | T4, T5 | `rg` over both files |
| AC-67 | `contracts/eval-ci.ts` byte-identical between server and client | T7 | `diff -q` between the two copies |
| AC-68 | `verify:l06` gates `contracts/eval-ci.ts` and fails on a one-character diff | T22 | `scripts/verify-l06.sh` |

T6, T12 and T21 carry no AC of their own and are still required: T6 owns the
three message files every wave-3 component reads, T21 owns the data layer every
wave-5 page reads, and T12 is the `verify-l04.sh` mirror-gate widening carried
as a recommendation rather than a criterion. Nothing else is untraced.

## Requirements review

- **Requirement as understood:** build SPEC-04's eval pipeline across `server/`,
  `reviewer-core/`, `client/` and `e2e/`, plus a `verify:l06` command and the
  `eval-ci.ts` mirror repair, exactly as its 68 acceptance criteria state.
- **Gaps found and how they were answered** (one clarification round, answered):
  - *verify-l06 lane set* — AC-named lanes only: AC-52's eight, AC-53's two,
    AC-68's mirror gate. `verify-l04.sh`'s `mcp typecheck`, `mcp tests` and
    depcruise onion lane are deliberately not carried over.
  - *AC-55 e2e shape* — no provider credential; the flow starts a real suite
    run, every case fails down AC-22's path, the run still completes and
    persists, and the flow asserts the terminal state. Zero model calls on the
    real run path.
  - *undeclared contract narrowings* — narrow `EvalRun`, `EvalTrendPoint` and
    `EvalCase.expected_output` on the spec's zero-consumer argument; all three
    are recorded under `## Contract & version impact` as an explicit extension
    of the spec's `## Contract impact`, whose list was incomplete.
  - *AC-49 / AC-65 witness* — a mock-LLM `*.it.test.ts` driving two real suite
    runs through `container.overrides.llm` with fixed structured fixtures and
    two prompts, asserting the metrics diverge.
- **Assumptions this plan rests on** — each one is visible so a wrong one is
  cheap to spot:
  - **A stale-run reaper for `eval_suite_runs` is planned although no AC
    requires it.** AC-24 says an interrupted run must be *observable as
    incomplete*; without a reaper the row stays `running` forever and AC-21's
    409 then locks that agent out permanently. It mirrors
    `reapStaleRunningRuns` (`server/src/modules/reviews/repository/run.repo.ts:105-113`)
    and is wired at the same boot point as `ReviewService.reapStaleRuns`
    (`server/src/app.ts:81`). If the reviewer disagrees, drop the reaper half of
    T8 and the T11 wiring line; nothing else moves.
  - The `/evals` and `/evals/[agentId]` routes are the two client routes the
    spec names; the eval-case editor is a component inside the agent page, not a
    third route.
  - `client/messages/en/eval.json` already carries most of the strings this
    feature needs (`dashboard`, `caseEditor`, `evalsTab`, `page`), and `en` is
    the only locale present. T6 extends it rather than starting over.
  - The mock-LLM witness for AC-49/AC-65 goes through `container.overrides.llm`,
    the DI seam `server/CLAUDE.md` names as the one way to swap an adapter.
- **Contradicts spec / INSIGHTS / roadmap:** nothing. Two corrections to
  material the spec quotes, neither changing a criterion:
  - The spec's `## Mirror gate` paragraph says `verify-l04.sh` excludes
    `eval-ci.ts`, `productionize.ts` **and `trace.ts`** as known-divergent.
    `diff -rq server/src/vendor/shared client/src/vendor/shared` today reports
    only `eval-ci.ts` and `productionize.ts`; `trace.ts` is already identical
    and the script's comment naming it divergent is stale. T12 corrects the
    comment and gates every already-identical file.
  - `client/INSIGHTS.md:179-190` records the same three-file drift and carries
    the same stale `trace.ts` entry. T12's change is the evidence a dated
    correction bullet can cite at wrap-up.

## Recommendations

Advice, not tasks — every one of these is already planned in, at the
coordinator's instruction; they are recorded here so the reasoning survives.

- Gate every already-identical mirror file, not only `eval-ci.ts`. `knowledge.ts`
  is edited by this feature and is currently ungated, which is exactly how the
  `ConformanceInput.provider` divergence got in. One task, five extra filenames.
- After the build, `doc-writer` should write `server/specs/` and `client/specs/`
  entries for the eval slice. This plan does not, and must not.
- The eval runner duplicates a great deal of `reviews/run-executor.ts`
  (provider resolution, cost accounting, cancellation, grounding). It is
  deliberately duplicated rather than shared, because extracting a common
  executor touches the shipping review path and SPEC-04's Non-goals forbid any
  change to how a real review runs. Worth a follow-up plan once eval is stable.
- `EvalDashboard.recent_runs` and the per-case rows are the only place a model's
  raw output is rendered. `security-auditor` should look specifically at the
  compare view and per-case detail, where `actual_output` and system-prompt text
  both reach the DOM.

## Execution mode

**multi-agent — six waves.** The breadth is real (six, four and ten tasks in the
first three waves) but the depth is forced by one chain that cannot be
parallelised: schema → repository → service/runner/routes → client hooks →
client pages → e2e flow. Each link consumes the previous link's contract
surface, so each is its own wave. This is six waves rather than the four
sketched in the review round for exactly that reason; collapsing any of waves
3–6 would put an HTTP or module contract in the same wave as its consumer.

- **Wave 1 — parallel: T1, T2, T3, T4, T5, T6** · four modules, six disjoint
  file sets, no task depends on another.
- **Wave 2 — parallel: T7, T8, T9, T10** · T7 is `client/`; T8, T9, T10 are three
  disjoint areas of `server/` (new slice data layer, new slice domain layer,
  `db/seed*`).
- **Wave 3 — parallel: T11, T12, T13, T14, T15, T16, T17, T18, T19, T20** · one
  `server/` slice task, one root script, eight `client/` component folders that
  share no file.
- **Wave 4 — parallel: T21, T22, T23, T24** · `client/` data layer, root script,
  the `agents/` cascade port, the mock-LLM witness. Disjoint.
- **Wave 4.5 — parallel: T29, T30, T31, T32** · the four integration-test files
  the `## Acceptance-criteria coverage` table cites as "Proven by" but which no
  task originally created. Added 2026-08-30 after the wave-3 gate found roughly
  twenty-five acceptance criteria with no task producing their proof. Four
  disjoint new files under `server/test/`; T31 additionally depends on T23.
- **Wave 5 — parallel: T25, T26, T27** · three `client/` route/page areas that
  consume the wave-4 hooks; no shared file.
- **Wave 6 — sequential: T28** · the e2e flow drives the pages built in wave 5.
- After each wave: `plan-verifier` against that wave's tasks.

## Constraints that must not break

- No route may declare a `response:` schema — response bodies are hand-written
  DTOs, and `fastify-type-provider-zod` would strip unknown keys — source:
  `server/CLAUDE.md` "Conventions (non-default)"; `server/INSIGHTS.md:750-756`.
- A DTO that must satisfy a contract uses `safeParse` + `AppError('internal_error', …, 500)`,
  never a bare `.parse()`, because `setErrorHandler` maps a ZodError to 422 —
  source: `server/INSIGHTS.md:750-756`; `server/src/app.ts:137-155`.
- A per-route rate limit needs an explicit `keyGenerator`, or it is one global
  bucket, not a per-workspace one — source: `server/INSIGHTS.md:131-143`;
  follow `server/src/modules/brief/routes.ts:11-17,54-60`, not
  `server/src/modules/intent/routes.ts:71-76`.
- A new slice must not import another module's files; ports go in the slice's
  `ports.ts`, concrete classes are constructed in `routes.ts` or
  `platform/container.ts`, and a service takes its ports — never `Container` —
  source: `onion-architecture`; `server/INSIGHTS.md` 2026-08-09 entry.
- `server/src/db/migrations/*.sql` is generated, never hand-edited; schema
  changes go `src/db/schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate` —
  source: `server/CLAUDE.md` "Gotchas / Do not touch".
- `pnpm db:generate` goes interactive when one table both drops and adds columns
  in the same diff. This feature is expand-only, so it must not — source:
  `server/INSIGHTS.md:185`.
- Relative imports in `server/src` carry the ESM `.js` specifier; `src/db/schema/*`
  is the exception and omits it — source: `onion-architecture` project profile.
- `reviewer-core/` imports no DB, fs, GitHub or server code, and never emits JS —
  source: `reviewer-core/CLAUDE.md`.
- `client/src/vendor/shared` is a mirror; the canonical copy is
  `server/src/vendor/shared` and both change in the same commit — source:
  `client/CLAUDE.md`; root `CLAUDE.md`.
- All client data access goes through `src/lib/hooks/*` → `src/lib/api.ts`; a
  `fetch` in a component is a defect — source: `client/CLAUDE.md`.
- Every user-facing client string goes through next-intl messages — source:
  `client/CLAUDE.md`. `en` is the only locale present.
- Client styling is inline style objects in a `styles.ts`, not utility classes —
  source: `frontend-ui-architecture` project profile.
- Severity colours come from `SEV` in `src/vendor/ui/primitives/tokens.ts`;
  do not hand-roll a third `SEV_COLOR` — source: `frontend-ui-architecture`.
- e2e uses agent-browser only — no Playwright, no LLM, no API key — source:
  `e2e/CLAUDE.md`.
- In an e2e flow, `find role button --name` for buttons, `find text … click` for
  div-with-onClick cards and nav; and an explicit
  `["eval", "…scrollIntoView({block:'center'})…"]` step before any click on a
  below-the-fold target, because `find … click` does not scroll into view on the
  CI runner and still exits 0 — source: `e2e/INSIGHTS.md` 2026-08-30 ROOT CAUSE
  entry; 2026-08-05 entry.
- A `find` whose target text arrives with API data needs a
  `wait --load networkidle` or a `wait --text` between it and the preceding
  `wait --url` — source: `e2e/INSIGHTS.md` 2026-08-23 entry.
- No comments in new code; the one exception is a `@deprecated` marker block —
  source: root `CLAUDE.md`.
- **There is no lint script in any module.** Never run `pnpm lint`.

## Tasks

### T1 — Add the deterministic eval scorer to reviewer-core · module: reviewer-core · wave: 1
- Files: `reviewer-core/src/eval/score.ts` (new), `reviewer-core/src/eval/constants.ts` (new), `reviewer-core/src/index.ts` (edit), `reviewer-core/test/eval-score.test.ts` (new), `reviewer-core/test/eval-score-purity.test.ts` (new)
- Skills: onion-architecture, zod, typescript-expert
- Do: implement `scoreEvalCase(expectations, findings)` and
  `aggregateEvalRun(caseResults)` as pure functions over the expectation type
  and `Finding`. Name the tolerance constant once in `constants.ts` at ±3 lines
  and use it in both the match rule and citation accuracy (AC-28, AC-33,
  AC-56). Record per-match severity and title agreement without letting either
  decide the match (AC-29). Return `null`, never `0`, for a not-computed recall
  or precision (AC-35, AC-36), and exclude `must_find`-free cases from the
  recall denominator (AC-31). Sort or otherwise normalise both input lists so
  ordering cannot change the result (AC-37). Export the new symbols from
  `index.ts`; remove nothing. The purity test constructs the scorer with every
  network client and provider adapter replaced by a fake that throws on use
  (AC-27) — it is also the lane AC-53 names.
- Done when: `scoreEvalCase` covers the four pass/fail combinations of AC-34,
  the 3-lines-out matches / 4-lines-out does not pair of AC-56, and the
  reordering equality of AC-37; the purity test passes with the throwing fakes
  installed.
- Verify: `cd reviewer-core && npm run typecheck && npm test -- --reporter=dot`
- Depends on: —

### T2 — Narrow and extend the eval contracts (canonical copy) · module: server · wave: 1
- Files: `server/src/vendor/shared/contracts/eval-ci.ts` (edit), `server/src/vendor/shared/contracts/knowledge.ts` (edit), `server/test/contracts.test.ts` (edit)
- Skills: zod, semver-discipline, breaking-change, deprecation-policy, typescript-expert
- Do: replace `EvalCaseInput.expected_output`'s `z.unknown()` with the
  discriminated array AC-9 describes — `kind` of `must_find` | `must_not_flag`,
  a file, a line, an optional end line, a category, and optional severity and
  `title_contains`. Make `EvalDashboard.current.{recall,precision,citation_accuracy,traces_passed}`
  and `EvalDashboard.delta.{recall,precision,citation_accuracy}` nullable
  (AC-35, AC-36, AC-39, AC-40). Narrow `EvalTrendPoint.{recall,precision,citation_accuracy}`
  and `knowledge.ts`'s `EvalRun.{recall,precision,citation_accuracy}` on the same
  zero-consumer terms, and narrow `EvalCase.expected_output` to the AC-9 shape —
  these three are the extension of the spec's declaration recorded in
  `## Contract & version impact`. Add `EvalRunRecord.suite_run_id` (nullable) and
  `.agent_version` (nullable), and the new `EvalSuiteRunRecord`, `EvalCaseRecord`
  and `EvalCompare` shapes. Add nothing required to an existing request shape.
  Do **not** narrow `EvalOwnerKind`. Do not touch the client copy — T7 owns it.
- Done when: `server/test/contracts.test.ts` parses a conforming and a
  non-conforming expectation list and pins the nullable fields; `pnpm typecheck`
  is clean in `server/`.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: —

### T3 — Expand the eval schema and generate the migration · module: server · wave: 1
- Files: `server/src/db/schema/eval.ts` (edit), `server/src/db/rows.ts` (edit), `server/src/db/migrations/` (new generated `.sql` + `meta/` update)
- Skills: drizzle-orm-patterns, postgresql-table-design, onion-architecture
- Do: add an `eval_suite_runs` table — id, workspace id (cascade from
  `workspaces`), agent id, agent version, status (`running` | `done` |
  `cancelled` | `failed`), started/finished timestamps, cases total, cases
  passed, aggregate recall / precision / citation accuracy (all nullable),
  total cost and total duration. Add `evalRuns.suiteRunId` (nullable, references
  `eval_suite_runs` on delete cascade) and `evalRuns.agentVersion` (nullable).
  Add `evalCases.sourceFindingId` (nullable — a hand-authored case has none, and
  AC-4 requires the case to outlive the finding, so it stays nullable
  permanently and carries **no** foreign key). Index `eval_suite_runs` by
  `(agent_id, started_at)` for the trend query and `eval_runs` by `suite_run_id`.
  Export the new row types from `db/rows.ts`. Then run `pnpm db:generate`. Every
  change is additive: no column is dropped, renamed, narrowed or made `NOT NULL`,
  so the generate stays non-interactive. Never hand-edit the emitted SQL.
- Done when: exactly one new migration file exists, it contains only `CREATE
  TABLE`, `ADD COLUMN` and `CREATE INDEX`, and `server/` typechecks.
  **Amended 2026-08-30 after the wave-2 gate:** a second, additive migration
  belongs to this task as well — `EvalCaseRecord.created_at` is required by the
  T2 contract but `eval_cases` had no such column, so a remediation pass added
  `createdAt` to the table and generated `0024_*.sql` (`ADD COLUMN` only). Two
  generated migrations is therefore the correct count for T3, not one.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: —

### T4 — Write the eval module's own documentation with the vocabulary note · module: server · wave: 1
- Files: `server/docs/eval-pipeline.md` (new)
- Skills: mermaid-diagram
- Do: following the shape of `server/docs/project-context.md`, document the eval
  slice: the tables, the suite-run lifecycle, where the scorer lives and why it
  is at ring 0, and the run path from case to per-case row to aggregate. Carry
  AC-66's vocabulary note verbatim in substance: "eval case", "eval run" and
  "eval dashboard" are product terms owned by a reviewer agent inside a
  workspace, and the root `@devdigest/evals` package evaluates the Claude Code
  harness that builds this product and is a different thing. This is a topic
  doc, not a module spec — do not write it into `server/specs/`.
- Done when: the file exists, names all three product terms and the
  `@devdigest/evals` distinction, and links to `specs/2026-08-30-eval-pipeline.md`.
- Verify: `rg -n 'eval case|eval run|eval dashboard|@devdigest/evals' server/docs/eval-pipeline.md`
- Depends on: —

### T5 — Add the vocabulary note to the specs README · module: root · wave: 1
- Files: `specs/README.md` (edit)
- Skills: none — plain edit
- Do: add a short section fixing the same three product terms and stating that
  the root `@devdigest/evals` package is unrelated, pointing at
  `server/docs/eval-pipeline.md` for the detail. Do not restate SPEC-04, and do
  not change the Spec ID / Status conventions the file already documents.
- Done when: the note is present and names `@devdigest/evals` explicitly.
- Verify: `rg -n '@devdigest/evals' specs/README.md`
- Depends on: —

### T6 — Extend the client message catalogue for the eval screens · module: client · wave: 1
- Files: `client/messages/en/eval.json` (edit), `client/messages/en/prReview.json` (edit)
- Skills: none — plain edit
- Do: `eval.json` already carries `dashboard`, `caseEditor`, `evalsTab` and
  `page` blocks — extend them rather than replacing. Add every string the wave-3
  components need and nothing they do not: never-run and no-previous-run
  statements (AC-15, AC-39, AC-40), the metric-regression banner (AC-42), the
  empty-set state with its create affordance (AC-16), cancel and cancelled
  labels (AC-58, AC-62), compare labels including the unavailable-prompt-diff
  and same-version statements (AC-47, AC-48), the two skeleton-kind choices
  (AC-12), and the invalid-JSON badge (AC-11). In `prReview.json` add the
  "Turn into eval case" label, its disabled explanation naming accept/dismiss
  (AC-3) and the creation confirmation (AC-7). `en` is the only locale — do not
  create others. This task is the single owner of these files for the
  whole plan, so that eight wave-3 component tasks can run in parallel without
  colliding on them. `client/messages/en/agents.json` is deliberately **not** in
  this task's file list: no wave-3 or wave-5 task references a key in it, and its
  existing `editor.agentFallback` / `editor.loadErrorTitle` / `editor.loadErrorBody`
  already cover T26's agent-load-failure state.
- Done when: every key the wave-3 tasks reference exists, and both files are
  valid JSON.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: —

### T7 — Mirror the eval contracts into the client and repair the drift · module: client · wave: 2
- Files: `client/src/vendor/shared/contracts/eval-ci.ts` (edit), `client/src/vendor/shared/contracts/knowledge.ts` (edit)
- Skills: zod, breaking-change, semver-discipline
- Do: make both files byte-identical to their `server/src/vendor/shared/contracts/`
  counterparts. For `eval-ci.ts` this repairs two pre-existing divergences as
  well as carrying T2's edits: the client copy declares no `AgentManifest` block
  and no `Provider`/`CiFailOn`/`ProjectContextPayload` imports, and its
  `ConformanceInput.provider` enum is `['openai','anthropic']` against the
  server's `['openai','anthropic','openrouter']` (AC-67). A straight copy of the
  canonical file is the correct move here precisely because the drift is being
  repaired, not preserved — `client/src/vendor/shared/contracts/context.ts`
  already exists, so the new import resolves. Change nothing else under
  `client/src/vendor/shared`; `productionize.ts` stays divergent and stays out
  of the gate.
- Done when: `diff -q` between each pair exits 0, and `client/` typechecks.
- Verify: `diff -q server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts && diff -q server/src/vendor/shared/contracts/knowledge.ts client/src/vendor/shared/contracts/knowledge.ts && cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T2

### T8 — Build the eval slice's ports and repository · module: server · wave: 2
- Files: `server/src/modules/eval/ports.ts` (new), `server/src/modules/eval/repository.ts` (new)
- Skills: onion-architecture, drizzle-orm-patterns, postgresql-table-design
- Do: `ports.ts` declares only the interfaces the use case calls — an
  `EvalCaseStore`, an `EvalRunStore`, an `EvalSuiteRunStore`, an
  `AgentConfigSource` (agent row plus the `agent_versions` snapshot), a
  `SourceDiffSource` for AC-4's snapshot, and a `SuiteExecutor` the service
  starts without importing the runner. `repository.ts` is the only file in this
  slice that touches Drizzle. Every read and write is scoped by workspace id so
  AC-18's 404 has a single enforcement point. Trend and comparison queries
  select **only** suite runs in a completed state — an incomplete or cancelled
  run is excluded by the query, not by a filter in the caller (AC-24, AC-61) —
  and the trend query orders oldest→newest and caps at 30 (AC-43). Add
  `deleteCasesForOwner(workspaceId, ownerKind, ownerId)` deleting cases and,
  through the cascade, their runs, for T23 to call (AC-17). Add
  `reapStaleSuiteRuns(db)` mirroring `reapStaleRunningRuns`
  (`server/src/modules/reviews/repository/run.repo.ts:105-113`) — this is the
  stated assumption in `## Requirements review`, not an AC. Map rows to domain
  shapes at this boundary; do not let `$inferSelect` types escape into the
  service. Relative imports carry the `.js` specifier.
- Done when: the repository compiles against the T3 schema, exposes no Drizzle
  type in its public signatures, and every method takes a workspace id.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T3

### T9 — Build the eval slice's domain rules and DTO helpers · module: server · wave: 2
- Files: `server/src/modules/eval/domain.ts` (new), `server/src/modules/eval/helpers.ts` (new), `server/src/modules/eval/constants.ts` (new), `server/test/eval-domain.test.ts` (new)
- Skills: onion-architecture, zod, typescript-expert
- Do: `domain.ts` holds the decisions that need their own test and no database:
  deriving the expectation from a finding's recorded action — `accepted` →
  `must_find`, `dismissed` → `must_not_flag`, neither → refuse (AC-1, AC-2,
  AC-3); disambiguating a case name within an owner by numeric suffix (AC-8);
  treating an empty expectation list as an assertion of silence (AC-13); and
  composing the per-case pass rule over `reviewer-core`'s scorer. `constants.ts`
  names the spec's limits — 200 cases per agent, 100 expectations per case,
  256 KiB of diff, 64 KiB of expectation JSON, 120-character name, 120-second
  per-case timeout, 50-row run page. `helpers.ts` maps rows to the contract DTOs
  and `safeParse`s them, throwing `AppError('internal_error', …, 500)` on
  mismatch — never a bare `.parse()`. Import nothing from another module and
  nothing from `src/db` or `fastify`.
- Done when: `eval-domain.test.ts` covers both derivations, the refusal, the
  suffix collision and the empty-list case.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest related --run src/modules/eval/domain.ts src/modules/eval/helpers.ts --reporter=dot`
- Depends on: T1, T2

### T10 — Seed the regression set, the finding action states and the prompt-line pair · module: server · wave: 2
- Files: `server/src/db/seed-evals.ts` (new), `server/src/db/seed.ts` (edit), `server/src/db/seed-prompts.ts` (edit)
- Skills: drizzle-orm-patterns, zod
- Do: plant at least eight eval cases on the seeded `Security Reviewer`
  (`server/src/db/seed.ts:1004`), each with a non-empty snapshotted
  `input_diff` and an `expected_output` valid under AC-9 (AC-50, AC-63). Follow
  the file's existing idempotency shape — select-then-insert keyed on
  `(workspace, owner, name)`, the pattern already used for agents and skills —
  so a second seed does not multiply them (AC-64). Two of the eight are the
  AC-65 pair: one case whose expectation *requires* the finding a single named
  line of `SECURITY_REVIEWER_PROMPT` produces, and one whose expectation
  *forbids* it, so removing that line moves recall down and precision up. Name
  that line in `seed-evals.ts` by its exact text so T24 can remove it
  mechanically. Separately, set the action state on three seeded findings — one
  `accepted_at`, one `dismissed_at`, one left undecided — so AC-55's flow has a
  deterministic starting point and AC-3's disabled control has something to
  point at. Do not renumber or move the seeded PR `#482` fixtures: `e2e/`
  asserts against them.
- Done when: a fresh `pnpm db:seed` yields ≥8 cases for `Security Reviewer`, a
  second run yields the same count, and exactly one seeded finding of each
  action state exists.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T2, T3

### T11 — Build the eval service, suite runner, routes and wiring · module: server · wave: 3
- Files: `server/src/modules/eval/service.ts` (new), `server/src/modules/eval/runner.ts` (new), `server/src/modules/eval/routes.ts` (new), `server/src/modules/index.ts` (edit), `server/src/platform/container.ts` (edit), `server/src/app.ts` (edit), `server/test/routes-smoke.test.ts` (edit)
- Skills: onion-architecture, fastify-best-practices, zod, security
- Do: `service.ts` takes its ports in the constructor — never `Container` — and
  orchestrates: create-from-finding (snapshot the cited file's diff, record the
  source finding id, return the existing case unchanged on a repeat: AC-4, AC-5,
  AC-6), case CRUD with the AC-10 error naming the failing index and field, the
  list and dashboard reads, comparison, cancel, and the start that refuses a
  second concurrent suite for one agent with 409 (AC-21) and accepts one again
  after a cancel (AC-60). `runner.ts` implements the `SuiteExecutor` port and is
  the eval analogue of `reviews/run-executor.ts`: one suite-run row carrying
  agent and current version (AC-19); each case executed against the
  `agent_versions` snapshot; **the grounding gate applied on exactly the terms a
  review applies it** before anything is persisted or scored (AC-57,
  `reviewer-core/src/grounding.ts`); one per-case row per case with raw output,
  metrics, duration and cost from the same accounting as
  `reviews/run-executor.ts:272,307,329` (AC-20); a failed case persisted with its
  error, counted as zero matches and left in the denominators while the suite
  continues (AC-22); a 120-second per-case timeout; aggregates and a complete
  marker at the end (AC-23); cancellation that stops after the case in flight and
  keeps every row already written (AC-59); and a standalone single-case run with
  a null suite id that feeds no aggregate (AC-26). `routes.ts` is thin — parse via
  schema, one service call, a status code — declares **no** `response:` schema,
  and puts a 10-per-minute limit on the start route with an explicit
  `keyGenerator` resolving the workspace, following
  `server/src/modules/brief/routes.ts:11-17,54-60` (AC-25). Register the module in
  `modules/index.ts`, construct the repository and runner in `container.ts`, and
  call the suite-run reaper next to `ReviewService.reapStaleRuns` at
  `server/src/app.ts:81`. Never log or echo `input_diff` contents, including in an
  error message. Add one `it('registers the eval module in the route table')`
  block to `routes-smoke.test.ts` listing every eval route — that block is the
  lane AC-53 names.
- Done when: `pnpm typecheck` is clean, the routes-smoke block asserts every eval
  route with `app.hasRoute`, and no eval route declares `response:`.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T1, T8, T9

### T12 — Widen the verify-l04 mirror gate and correct its stale comment · module: root · wave: 3
- Files: `scripts/verify-l04.sh` (edit)
- Skills: none — plain edit
- Do: move `contracts/eval-ci.ts`, `contracts/trace.ts`, `contracts/findings.ts`,
  `contracts/knowledge.ts`, `contracts/observability.ts` and `contracts/why.ts`
  into the `diff -q` list, leaving `contracts/productionize.ts` as the only
  excluded file. Rewrite the comment block above the gate: it currently names
  `trace.ts` as known-divergent, which `diff -rq server/src/vendor/shared
  client/src/vendor/shared` disproves — only `eval-ci.ts` and `productionize.ts`
  differ today, and after T7 only `productionize.ts` does. This matters directly
  to this feature: `knowledge.ts` is edited by T2 and is ungated today, which is
  the same hole that let the `ConformanceInput.provider` divergence in. Change no
  other lane in this script.
- Done when: the gated loop names ten files, the excluded loop names one, and
  the comment no longer claims `trace.ts` diverges.
- Verify: `bash -n scripts/verify-l04.sh && for f in contracts/review-api.ts contracts/brief.ts contracts/context.ts contracts/platform.ts contracts/eval-ci.ts contracts/trace.ts contracts/findings.ts contracts/knowledge.ts contracts/observability.ts contracts/why.ts adapters.ts index.ts; do diff -q server/src/vendor/shared/$f client/src/vendor/shared/$f; done`
- Depends on: T7

### T13 — EvalAgentCard: one agent's headline metrics on the dashboard · module: client · wave: 3
- Files: `client/src/app/evals/_components/EvalAgentCard/EvalAgentCard.tsx` (new), `.../EvalAgentCard.test.tsx` (new), `.../styles.ts` (new), `.../index.ts` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: a presentational card taking one agent's dashboard entry as props —
  recall, precision, citation accuracy, the run's agent version and time, and
  passed-of-total (AC-38). When the agent has never had a completed run, render
  "never run" and **no** percentage-formatted value and no delta at all (AC-39);
  the contract fields are nullable after T2, so branch on `null`, never coerce
  with `?? 0`. Strings come from `eval.json` via next-intl; styles live in
  `styles.ts` as inline style objects. No `fetch`, no hook — the page passes
  props.
- Done when: the test renders both states and asserts the never-run card
  contains no `%`-formatted value.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run src/app/evals/_components/EvalAgentCard/EvalAgentCard.tsx --reporter=dot`
- Depends on: T6, T7

### T14 — EvalMetricStrip: the three metrics, their deltas and the regression banner · module: client · wave: 3
- Files: `client/src/app/evals/[agentId]/_components/EvalMetricStrip/EvalMetricStrip.tsx` (new), `.../EvalMetricStrip.test.tsx` (new), `.../helpers.ts` (new), `.../helpers.test.ts` (new), `.../styles.ts` (new), `.../index.ts` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: render recall, precision and citation accuracy each with its change
  against the previous completed run (AC-41). With exactly one completed run,
  render no delta indicator and carry an explicit "no previous run to compare
  against" statement (AC-40). When a metric is `null`, render it as not computed
  — never as 0% (AC-35). When any of the three fell against the previous run,
  render a banner naming each fallen metric and by how much, in text, not by
  colour alone (AC-42). Put the fell-by-how-much computation in `helpers.ts` as
  pure functions with their own test.
- Done when: the test covers the one-run, the null-metric and the
  two-metrics-fell cases, and asserts the banner names both metrics in text.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run src/app/evals/\[agentId\]/_components/EvalMetricStrip/EvalMetricStrip.tsx --reporter=dot`
- Depends on: T6, T7

### T15 — EvalTrendChart: the completed-run trend series · module: client · wave: 3
- Files: `client/src/app/evals/[agentId]/_components/EvalTrendChart/EvalTrendChart.tsx` (new), `.../EvalTrendChart.test.tsx` (new), `.../styles.ts` (new), `.../index.ts` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: render the agent's trend over its completed runs in chronological order
  (AC-41), consuming the series the server already caps at 30 and orders
  oldest→newest (AC-43) — do not re-sort or re-cap in the component. Render
  nothing metric-shaped when the series is empty. The trend must be readable
  without relying on colour alone, so carry an accessible textual summary
  alongside the visual.
- Done when: the test asserts the rendered point count equals the series length
  and that the first rendered point is the oldest.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run src/app/evals/\[agentId\]/_components/EvalTrendChart/EvalTrendChart.tsx --reporter=dot`
- Depends on: T6, T7

### T16 — EvalRunList: run history, selection, cancel and the cancelled state · module: client · wave: 3
- Files: `client/src/app/evals/[agentId]/_components/EvalRunList/EvalRunList.tsx` (new), `.../EvalRunList.test.tsx` (new), `.../helpers.ts` (new), `.../styles.ts` (new), `.../index.ts` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: render one row per run with time, agent version, the three metrics,
  passed-of-total and cost (AC-41). Selection checkboxes carry accessible names
  identifying the run they select; the compare control is enabled at exactly two
  selected and disabled at zero, one or more than two (AC-44). While a run is in
  progress, render a cancel control for it, and remove that control once the run
  reaches a terminal state (AC-58). A cancelled run is labelled cancelled,
  renders no percentage-formatted aggregate, is not selectable for comparison
  (AC-61) and still exposes its per-case rows (AC-62). Call
  `onCancel` / `onSelectionChange` props; no mutation hook lives here.
- Done when: the test walks the selection count through 0, 1, 2 and 3 asserting
  the compare control's `disabled` at each, and asserts a cancelled row contains
  no `%` value while its per-case detail lists the cases that ran.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run src/app/evals/\[agentId\]/_components/EvalRunList/EvalRunList.tsx --reporter=dot`
- Depends on: T6, T7

### T17 — EvalCompareModal: two runs side by side with the prompt diff · module: client · wave: 3
- Files: `client/src/app/evals/[agentId]/_components/EvalCompareModal/EvalCompareModal.tsx` (new), `.../EvalCompareModal.test.tsx` (new), `.../helpers.ts` (new), `.../helpers.test.ts` (new), `.../styles.ts` (new), `.../index.ts` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library, security
- Do: present recall, precision, citation accuracy and cost as older value,
  newer value and difference, with the older run always on the left irrespective
  of selection order — put that ordering in `helpers.ts` as a pure function with
  its own test (AC-45). Present the difference between the system prompts
  recorded in the two agent-version snapshots (AC-46). When either snapshot is
  unreadable, state that the prompt difference is unavailable and still render
  the metric differences (AC-47). When the two runs share an agent version,
  state that the configuration did not change between them (AC-48). System-prompt
  text is workspace-authored but is still rendered as text, never as markup. The
  modal traps focus and is dismissible from the keyboard.
- Done when: the test asserts identical output for the same pair selected in
  each order, and covers the missing-snapshot and same-version statements.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run src/app/evals/\[agentId\]/_components/EvalCompareModal/EvalCompareModal.tsx --reporter=dot`
- Depends on: T6, T7

### T18 — EvalCaseList: the agent's regression set · module: client · wave: 3
- Files: `client/src/app/evals/[agentId]/_components/EvalCaseList/EvalCaseList.tsx` (new), `.../EvalCaseList.test.tsx` (new), `.../styles.ts` (new), `.../index.ts` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: one row per case the agent owns, carrying the case name, the kinds of
  expectation it holds and the outcome of its most recent run (AC-14). A case
  with no run rows is labelled "never run" and shows neither a pass nor a fail
  state (AC-15). With zero cases, render an empty state that says so and offers
  case creation, and render no percentage-formatted metric value anywhere in the
  component (AC-16).
- Done when: the test asserts one row per case, the never-run row's absence of a
  pass/fail state, and that the empty state contains no `%` value.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run src/app/evals/\[agentId\]/_components/EvalCaseList/EvalCaseList.tsx --reporter=dot`
- Depends on: T6, T7

### T19 — EvalCaseEditor: expected-output authoring · module: client · wave: 3
- Files: `client/src/app/evals/[agentId]/_components/EvalCaseEditor/EvalCaseEditor.tsx` (new), `.../EvalCaseEditor.test.tsx` (new), `.../helpers.ts` (new), `.../helpers.test.ts` (new), `.../constants.ts` (new), `.../styles.ts` (new), `.../index.ts` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library, zod, security
- Do: while the expected-output field holds text that is not valid JSON, mark
  the field invalid and set `disabled` on Save (AC-11). Inserting a finding
  skeleton requires the user to choose between `must_find` and `must_not_flag`
  and inserts a skeleton valid for the chosen kind — keep both skeletons in
  `constants.ts` and the insertion in `helpers.ts` (AC-12). An empty expectation
  list saves without error (AC-13). Validate against the mirrored AC-9 schema
  before enabling Save, so a shape the server would reject is caught here too;
  the server remains the authority (AC-10). Render every string field of a case
  as text, never as markup.
- Done when: the test covers invalid JSON disabling Save, each of the two
  skeleton insertions producing its own kind, and an empty list saving.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run src/app/evals/\[agentId\]/_components/EvalCaseEditor/EvalCaseEditor.tsx --reporter=dot`
- Depends on: T6, T7

### T20 — EvalCaseButton: the "Turn into eval case" control on a finding · module: client · wave: 3
- Files: `client/src/app/repos/[repoId]/pulls/[number]/_components/EvalCaseButton/EvalCaseButton.tsx` (new), `.../EvalCaseButton.test.tsx` (new), `.../styles.ts` (new), `.../index.ts` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: a presentational control taking the finding's `accepted_at` /
  `dismissed_at` and an `onCreate` callback. When the finding is neither
  accepted nor dismissed, render the control with the `disabled` attribute set
  and a message stating the finding must be accepted or dismissed first (AC-3's
  client half). After creation resolves, render a confirmation naming the created
  case and offering a way to open it (AC-7). No hook, no fetch — wave 5 wires
  the mutation.
- Done when: the test asserts `disabled` on the undecided finding, absence of
  `disabled` on an accepted and on a dismissed one, and the confirmation
  containing the case name after `onCreate` resolves.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run src/app/repos/\[repoId\]/pulls/\[number\]/_components/EvalCaseButton/EvalCaseButton.tsx --reporter=dot`
- Depends on: T6, T7

### T21 — Add the eval data hooks · module: client · wave: 4
- Files: `client/src/lib/hooks/evals.ts` (new), `client/src/lib/hooks/index.ts` (edit)
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices
- Do: every eval fetch and mutation goes here, through `src/lib/api.ts` — the
  dashboard, an agent's cases, an agent's runs and trend, a comparison, the
  create-from-finding mutation, the case save, the suite start, the single-case
  run and the cancel. Branch failure handling on `err.code`, not on
  `err.status`, with `err.message` as the fallback for an unrecognised code —
  `client/INSIGHTS.md` records three distinct server errors that all answer 404.
  Invalidate the run and case queries after a start, a cancel and a create.
  Export from the barrel alongside the existing domain files.
- Done when: no component anywhere calls `fetch` for an eval endpoint, and the
  barrel re-exports the new file.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T7, T11

### T22 — Write verify-l06 and declare it in both manifests · module: root · wave: 4
- Files: `scripts/verify-l06.sh` (new), `server/package.json` (edit), `client/package.json` (edit)
- Skills: none — plain edit
- Do: model the script on `scripts/verify-l04.sh`'s `step` / `skip` structure.
  Carry **only** the AC-named lanes — do not copy `verify-l04.sh`'s `mcp
  typecheck`, `mcp tests` or depcruise onion lane. The eight AC-52 lanes: server
  typecheck, server unit tests (`pnpm exec vitest run --exclude '**/*.it.test.ts'`),
  server integration tests (`pnpm exec vitest run .it.test --no-file-parallelism`
  — **amended 2026-08-30**: the unserialized form exhausts the Testcontainers
  Ryuk reaper and fails every `.it.test.ts` file spuriously, which is why
  `## Verification (end to end)` already specifies the serialized form),
  `reviewer-core`
  typecheck, `reviewer-core` tests, client typecheck, client tests, client
  build; plus `e2e` typecheck. Two AC-53 lanes: the eval-route registration test
  (`pnpm exec vitest run test/routes-smoke.test.ts`) and the scorer-purity test
  (`npm test -- eval-score-purity` in `reviewer-core/`). One AC-68 lane: the
  byte-identical mirror gate, with `contracts/eval-ci.ts` in the gated list, not
  the excluded one, so a single changed character fails the command. Failure of
  any lane fails the whole command (AC-52). A lane that cannot run in this
  environment — Docker unavailable for the integration lane, a dev server
  holding :3000 for the build — is reported skipped and the command never prints
  a verified line on the strength of a lane that did not run (AC-54). Add
  `"verify:l06": "../scripts/verify-l06.sh"` to both `server/package.json` and
  `client/package.json`, matching how `verify:l03` is declared in both today
  (`server/package.json:15`, `client/package.json:11`) (AC-51).
- Done when: `bash -n` is clean, the script names eleven lanes, and both
  manifests carry the script. The command's own green run belongs to
  `## Verification (end to end)`.
- Verify: `bash -n scripts/verify-l06.sh && rg -n 'verify:l06' server/package.json client/package.json && rg -c '^step |^  step ' scripts/verify-l06.sh`
- Depends on: T11, T12

### T23 — Delete an agent's eval cases when the agent is deleted · module: server · wave: 4
- Files: `server/src/modules/agents/ports.ts` (new), `server/src/modules/agents/service.ts` (edit), `server/src/modules/agents/routes.ts` (edit)
- Skills: onion-architecture, drizzle-orm-patterns
- Do: `eval_cases.owner_id` carries no foreign key and cannot — `owner_kind` is
  polymorphic — so the deletion is an application-level responsibility, not a
  database cascade (AC-17). Declare an `EvalCaseCleanup` port in the agents
  slice's own `ports.ts` with the single method the service calls, have the
  agents service call it inside the delete path, and wire the eval repository's
  `deleteCasesForOwner` to it at the composition root in `routes.ts`. Do **not**
  import `modules/eval/` from `modules/agents/` — the depcruise onion ruleset
  scores `no-cross-slice-imports` as an error. Per-case run rows go with the
  cases through the T3 cascade.
- Done when: the agents service names only the port, `rg 'modules/eval'
  server/src/modules/agents` returns nothing, and `pnpm typecheck` is clean.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T11

### T24 — Prove a prompt change moves the metrics, with a mock LLM · module: server · wave: 4
- Files: `server/test/eval-prompt-sensitivity.it.test.ts` (new)
- Skills: onion-architecture
- Do: this is AC-49's guaranteed witness and the only test that exercises
  AC-65's seeded pair end to end. Build the app twice with
  `container.overrides.llm` supplying a fixed structured fixture — no network,
  no key — and drive two real suite runs over the same unchanged set: the first
  with the seeded `Security Reviewer` prompt intact, the second with the one
  named line from T10 removed (which bumps the agent's version through the
  normal `agents.update` path and snapshots it, per
  `server/src/modules/agents/repository.ts:103-104`). Assert the two suite-run
  rows report different recall **or** different precision, and that the two runs
  carry different agent versions so the compare view has something to diff. Pin
  each run to a completed state before reading its metrics, and use
  `toMatchObject` rather than `toEqual` on DTOs — a later additive field must not
  turn this red. Name the file with the `.it.test.ts` suffix so the CI lanes
  select it correctly.
- Done when: the file exists, typechecks, and asserts the divergence. Its green
  run is in `## Verification (end to end)` — the per-task lane deliberately does
  not execute integration tests.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T10, T11

### T25 — The /evals dashboard route and the nav entry · module: client · wave: 5
- Files: `client/src/app/evals/page.tsx` (new), `client/src/app/evals/styles.ts` (new), `client/src/vendor/ui/nav.ts` (edit)
- Skills: frontend-ui-architecture, next-best-practices, react-best-practices
- Do: list every agent that owns at least one eval case, one `EvalAgentCard` per
  agent, fed by the T21 hooks (AC-38, AC-39). Add one nav entry for the eval
  dashboard to the `SKILLS LAB` group in `nav.ts` — this file is vendored but is
  this app's own nav registry, and the group already carries Skills, Agents,
  Conventions and Project Context. Pick a `gKey` not already taken by
  `p/o/s/a/c/d/,`. Data comes only through hooks; no `fetch` in the page.
- Done when: the route renders, the nav entry appears in the sidebar, and no
  agent card renders a percentage for an agent with no completed run.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T13, T21

### T26 — The /evals/[agentId] agent eval page · module: client · wave: 5
- Files: `client/src/app/evals/[agentId]/page.tsx` (new), `client/src/app/evals/[agentId]/styles.ts` (new), `client/src/app/evals/[agentId]/helpers.ts` (new)
- Skills: frontend-ui-architecture, next-best-practices, react-best-practices
- Do: compose the wave-3 components into the page and wire the T21 hooks: the
  case list (AC-14, AC-15, AC-16), the metric strip and its banner (AC-40,
  AC-41, AC-42), the trend (AC-41, AC-43), the run list with its selection,
  cancel and cancelled states (AC-41, AC-44, AC-58, AC-62), the compare modal
  opened from a two-run selection (AC-45–AC-48) and the case editor. The page
  owns selection state and the start/cancel mutations; the components stay
  presentational. Do not re-implement any rule the components already own.
- Done when: the route renders every section, the compare control opens the
  modal only at exactly two selections, and starting a run disables the start
  control until the run reaches a terminal state.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T14, T15, T16, T17, T18, T19, T21

### T27 — Wire the eval-case control into the finding action row · module: client · wave: 5
- Files: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` (edit), `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx` (edit)
  **Amended 2026-08-30 after the wave-5 run:** the two test files the `Done when:`
  clause depends on belong to this task too — `FindingsPanel` gains a
  `useCreateEvalCaseFromFinding()` call, whose `useQueryClient()` throws on mount
  in any test that does not provide a QueryClient or mock `lib/hooks/evals`. Add
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx`
  (edit) and
  `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.test.tsx`
  (edit) — the latter renders `FindingsPanel` internally and fails for the same reason.
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: place `EvalCaseButton` in `FindingCard`'s existing actions row alongside
  Accept and Dismiss, deriving its disabled state from the same `accepted_at` /
  `dismissed_at` the card already reads (`FindingCard.tsx:50-51`) so the client
  refusal and the server's 400 agree (AC-3). `FindingsPanel` owns the create
  mutation from T21 and passes `onCreate` down; the confirmation naming the
  created case and offering to open it renders from the resolved mutation
  (AC-7). Do not add `Learn` or `Reply to author` — they are L07 and are
  explicitly out of scope.
- Done when: the existing `FindingCard.test.tsx` and `FindingsPanel.test.tsx`
  still pass, and a new case is created on an accepted finding without leaving
  the finding.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T20, T21

### T28 — The deterministic e2e flow · module: e2e · wave: 6
- Files: `e2e/specs/11-evals.flow.json` (new), `e2e/README.md` (edit)
- Skills: none — plain edit
- Do: one flow, next `NN-` prefix, covering create a case from a finding → list
  the agent's set → run the set → compare two runs (AC-55). **No provider
  credential is configured**, so every case fails down AC-22's path, the suite
  run still completes and persists, and the flow asserts that terminal state —
  zero model calls on the real run path. Start from the seeded PR `#482` and the
  accepted finding T10 plants. Respect the module's recorded traps: a `find`
  whose target text arrives with API data needs a `wait --load networkidle` or a
  `wait --text` between it and the preceding `wait --url`; use `find role button
  --name` for buttons and `find text … click` only for div-with-onClick cards and
  nav; and put an explicit `["eval", "…scrollIntoView({block:'center'})…"]` step
  before any click on a below-the-fold target, because `find … click` does not
  scroll into view on the CI runner and exits 0 anyway. Assert only the
  invariant head of any interpolated next-intl string. Add the flow's coverage
  row to `e2e/README.md`. No Playwright, no LLM.
- Done when: `npm run typecheck` is clean and the flow's steps reference only
  selectors that exist in the wave-5 pages.
- Verify: `cd e2e && npm run typecheck`
- Depends on: T10, T25, T26, T27

### T29 — The eval case-lifecycle integration test · module: server · wave: 4.5
- Files: `server/test/eval.it.test.ts` (new)
- Skills: onion-architecture
- Do: the file the coverage table already names as the proof of AC-1, AC-2,
  AC-3, AC-4, AC-5, AC-6, AC-10 and AC-18. Drive the real routes T11 built
  through the DI container, against a real database: an accepted finding becomes
  a case carrying one `must_find` expectation; a dismissed finding becomes one
  carrying `must_not_flag`; an undecided finding is refused with 400 and
  persists nothing; the created case stores a snapshot of the cited file's
  unified diff and records its source finding id; a second create for the same
  finding returns the existing case unchanged rather than a duplicate; an
  invalid expected output is refused with 400 naming the failing index and
  field, persisting nothing; and a case or run belonging to another workspace
  answers 404 on both read and write. Use `toMatchObject`, never `toEqual`, on
  DTOs. Do not weaken an assertion to get green — a red result here is a real
  finding about T11, and is reported, not patched.
- Done when: every one of the eight criteria above has its own assertion, and
  the file runs green serialized.
- Verify: `cd server && pnpm exec vitest run test/eval.it.test.ts --no-file-parallelism`
- Depends on: T10, T11

### T30 — The suite-runner integration test · module: server · wave: 4.5
- Files: `server/test/eval-runner.it.test.ts` (new)
- Skills: onion-architecture
- Do: the file the coverage table names as the proof of AC-19 through AC-26,
  plus AC-43, AC-57, AC-59, AC-60 and AC-61. With `container.overrides.llm`
  supplying a fixed structured fixture — no network, no key — assert: a start
  writes one suite-run row carrying agent, current version and start time; one
  per-case row per case with output, metrics, duration and cost; a second start
  while one is in progress answers 409 and writes no second suite run; a failing
  case neither stops the suite nor leaves the denominators; completion writes
  aggregates, passed-of-total, cost and duration and marks the run complete; a
  run whose process died is incomplete and excluded from trend, delta and
  compare; starts are limited to 10 per minute per workspace; a single-case run
  carries a null suite id and feeds no aggregate; the trend series is
  oldest→newest and capped at 30 completed runs; the grounding gate applies
  before anything is persisted or scored; a cancel stops after the case in
  flight, marks the run cancelled and keeps every row already written; a
  cancelled run does not block the next start and is excluded from trend, delta
  and comparison. Use `toMatchObject`, never `toEqual`.
- Done when: each criterion above has its own assertion and the file runs green
  serialized.
- Verify: `cd server && pnpm exec vitest run test/eval-runner.it.test.ts --no-file-parallelism`
- Depends on: T10, T11

### T31 — The agent-delete cascade integration test · module: server · wave: 4.5
- Files: `server/test/eval-agent-delete.it.test.ts` (new)
- Skills: onion-architecture
- Do: the file the coverage table names as the proof of AC-17. Create an agent,
  give it eval cases and at least one suite run with per-case rows, delete the
  agent through its real route, and assert both the cases and their run rows are
  gone — the cases by T23's application-level `EvalCaseCleanup` port, the run
  rows through the T3 database cascade. Assert too that another workspace's
  cases survive the delete, so the cleanup is proven scoped rather than global.
- Done when: the deletion is proven for cases and runs, and the cross-workspace
  survivor is asserted.
- Verify: `cd server && pnpm exec vitest run test/eval-agent-delete.it.test.ts --no-file-parallelism`
- Depends on: T11, T23

### T32 — The seed integration test · module: server · wave: 4.5
- Files: `server/test/eval-seed.it.test.ts` (new)
- Skills: onion-architecture, drizzle-orm-patterns
- Do: the file the coverage table names as the proof of AC-50, AC-63 and AC-64.
  Assert the seed plants at least eight cases on `Security Reviewer`, each with
  a non-empty `input_diff` and an `expected_output` that parses under the AC-9
  `EvalExpectation` schema; that those cases are runnable in a prepared
  environment; and that running the seed a second time does not multiply them.
  Scope the count to the seeded agent, not to `eval_cases` globally — the
  development database is long-lived and carries unrelated rows.
- Done when: the ≥8 count, the per-case validity and the second-seed stability
  each have their own assertion.
- Verify: `cd server && pnpm exec vitest run test/eval-seed.it.test.ts --no-file-parallelism`
- Depends on: T10


## Contract & version impact

**Verdict: MAJOR** (`→ 0.1.0` while pre-1.0 — every package sits at `0.0.0`,
so there is no number to bump; the verdict's job here is to surface the cost).

| Change | Surface | Who it breaks | Level |
|---|---|---|---|
| `EvalCaseInput.expected_output`: `z.unknown()` → typed discriminated array | `vendor/shared` contract | nobody — no route consumes `EvalCaseInput`, `eval_cases` has never held a row | MAJOR in principle |
| `EvalCase.expected_output` (`knowledge.ts`): same narrowing | `vendor/shared` contract | nobody — same argument | MAJOR in principle |
| `EvalDashboard.current.{recall,precision,citation_accuracy,traces_passed}` → nullable | `vendor/shared` contract | nobody | MAJOR in principle |
| `EvalDashboard.delta.{recall,precision,citation_accuracy}` → nullable | `vendor/shared` contract | nobody | MAJOR in principle |
| `EvalTrendPoint.{recall,precision,citation_accuracy}` → nullable | `vendor/shared` contract | nobody | MAJOR in principle |
| `EvalRun.{recall,precision,citation_accuracy}` (`knowledge.ts`) → nullable | `vendor/shared` contract | nobody | MAJOR in principle |
| `+ EvalRunRecord.suite_run_id`, `.agent_version` (nullable) | `vendor/shared` contract | nobody — `z.object` strips unknown keys | MINOR |
| `+ EvalSuiteRunRecord`, `EvalCaseRecord`, `EvalCompare` | `vendor/shared` contract | nobody | MINOR |
| `+ scoreEvalCase`, `aggregateEvalRun` from `reviewer-core/src/index.ts` | package export | nobody — nothing removed | MINOR |
| `+ eval_suite_runs` table; `+ eval_runs.suite_run_id`, `.agent_version`; `+ eval_cases.source_finding_id` — all nullable | database | nobody; no backfill, no read change | MINOR |
| `+ /evals*` routes | HTTP API | nobody — new surface | MINOR |
| `contracts/eval-ci.ts` client mirror repaired: `+ AgentManifest`, `ConformanceInput.provider` widened to include `openrouter` | contract mirror | nobody — the client copy gains what it was missing | MINOR |

**Extension of the spec's `## Contract impact`.** SPEC-04 declares the
narrowings on `EvalCaseInput.expected_output`, `EvalDashboard.current.*` and
`EvalDashboard.delta.*`. Three more narrowings are required by the same
criteria and the spec's list does not name them: `EvalTrendPoint.recall`,
`.precision` and `.citation_accuracy` (AC-35, AC-36 reach every trend point),
`EvalRun.recall`, `.precision` and `.citation_accuracy` in `knowledge.ts` (the
per-run shape `EvalRunResult` embeds, and the source of `EvalDashboard.current`'s
numbers), and `EvalCase.expected_output` in `knowledge.ts` (the read-side twin
of `EvalCaseInput`). They ship on the spec's own zero-consumer argument —
verified: `rg -n 'EvalTrendPoint|EvalRunResult|EvalCase\b' server/src client/src
reviewer-core/src e2e` finds only the contract files themselves — and this
paragraph is their declaration.

**No expand/migrate/contract sequence is required.** Nothing is renamed,
removed or dropped; the narrowings are on shapes with zero readers, and the
database changes are additive and nullable. `eval_runs.suite_run_id` stays
nullable permanently rather than being tightened later, because AC-26 depends on
the null case being meaningful. No `@deprecated` marker is required, because
nothing is being retired.

**Both mirror copies change in the same commit** (T2 and T7 land in adjacent
waves of one PR), and T12 plus T22 put `eval-ci.ts` and `knowledge.ts` behind a
`diff -q` gate so the next one-sided edit fails a command instead of reaching a
browser.

**CHANGELOG entry:**
```
### Added
- Eval pipeline (SPEC-04, L06): eval cases from accept/dismiss decisions, suite
  runs with cancellation, a deterministic ring-0 scorer, an eval dashboard and
  per-agent eval page, one e2e flow, and `pnpm verify:l06`.

### Breaking
- `EvalCaseInput.expected_output` and `EvalCase.expected_output` are now a typed
  discriminated array of expectations, not `unknown`.
- `EvalDashboard.current.*`, `EvalDashboard.delta.*`, `EvalTrendPoint.*` and
  `EvalRun.*` metric fields are now nullable, so "not computed" is
  representable and is never rendered as 0%.
- All four had zero consumers at the time of the change.
```

## Verification (end to end)

Run in this order. **This is the only place the integration lane appears.**

```sh
docker compose up -d
cd server && pnpm db:migrate && pnpm db:seed && pnpm db:seed
```
The second `db:seed` is deliberate — it proves AC-64.

```sh
cd reviewer-core && npm run typecheck && npm test
cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'
cd client && pnpm typecheck && pnpm test
cd e2e && npm run typecheck
```

The integration lane, serialized. `server/INSIGHTS.md` records that the parallel
form produces false Docker skips and Ryuk reaper failures that move between
files; re-run a single suite before believing a red one.

```sh
cd server && pnpm exec vitest run .it.test --no-file-parallelism
```
This is where `eval.it.test.ts`, `eval-runner.it.test.ts`,
`eval-agent-delete.it.test.ts`, `eval-seed.it.test.ts` and the AC-49/AC-65
witness `eval-prompt-sensitivity.it.test.ts` actually execute.

The mirror gates:

```sh
diff -q server/src/vendor/shared/contracts/eval-ci.ts   client/src/vendor/shared/contracts/eval-ci.ts
diff -q server/src/vendor/shared/contracts/knowledge.ts client/src/vendor/shared/contracts/knowledge.ts
```

The browser flows, against a running stack:

```sh
cd e2e && npm run e2e:hermetic
```

And finally the command the feature is accepted on:

```sh
cd server && pnpm verify:l06
cd client && pnpm verify:l06
```

`VERIFY_SKIP_IT=1` and `VERIFY_SKIP_BUILD=1` exist for a machine without Docker
or with a dev server on :3000; a skipped lane must print as skipped and must not
produce a verified line (AC-54). Per `server/INSIGHTS.md`, re-run the whole
script once before treating a single red lane as a code failure — a three-digit
transform time in the vitest summary means the machine, not the diff.

## Out of scope

- The rest of the L06 row — Secret/Phantom gates, Plan Verifier, Export to CI.
- `Learn` and `Reply to author` on the finding action row; the `Stats` and `CI`
  tabs in the agent editor. All L07.
- Skill-owned eval cases. `EvalOwnerKind` keeps its `skill` member and is not
  narrowed; this feature only ever writes `agent`.
- Any scheduled, on-save or CI-triggered eval run. Every run is started by a
  person.
- Any change to how a real pull-request review runs, is scored or is displayed —
  which is also why the eval runner duplicates rather than refactors
  `reviews/run-executor.ts`.
- The `Promote v7` control and a cross-agent `Run all agents` control. Both cut
  by the spec, not deferred.
- A per-run spend ceiling. Rejected in the spec's edge cases: partial metrics
  are not comparable to full ones under AC-22.
- Renaming the root `@devdigest/evals` package.
- Repairing `contracts/productionize.ts`'s mirror drift. It is the one file left
  out of the widened gate, and it is not this feature's drift.
- `server/specs/` and `client/specs/` entries for the eval slice — `doc-writer`
  owns those, after the build.

## Open questions

- None blocking. The five questions this plan opened were answered before
  writing it, and every answer is recorded under `## Requirements review`.
- One item for the reviewer rather than the implementer: the `eval_suite_runs`
  stale-run reaper in T8/T11 is an assumption, not a criterion. It is called out
  in `## Requirements review` and is removable in two lines if rejected.
