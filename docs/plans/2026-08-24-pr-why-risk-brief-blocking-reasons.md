# Implementation Plan: PR Brief — blocking reasons and design fidelity — 2026-08-24

## Context

`SPEC-03`'s original `AC-6`/`AC-7` made the PR Brief's verdict strip an
either/or, and
`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/BriefVerdictStrip.tsx:27`
implements it literally — `if (review) return <VerdictBanner …/>`, with the
`mergeRisk` prop accepted and never read on that branch. On 2026-08-24 a defect
was reported against a real pull request: an approving review with score 100
stood over a brief that had derived `high` and asked for the merge to be held,
and the brief's judgement had left the screen entirely.

The 2026-08-24 amendment replaces `AC-6`/`AC-7`, adds `AC-83`–`AC-93` to build
the fix (both judgements on one strip, plus the blocking-reason set behind an
`ⓘ`), and adds `AC-94`–`AC-98` — five design-fidelity corrections found when the
design frames were produced for the first time, after the work shipped.

The outcome: a reviewer opening `?tab=overview` sees the review's verdict **and**
the brief's merge-risk band together, a live blocker count that matches what they
can count on screen, and — behind one hover control — the union of blocker
findings and high-severity risks as titles and file references, no prose.

**Scope of this plan is `AC-83` – `AC-98` and nothing else.** `AC-1` – `AC-82`
are implemented and merged; the spec's `Verified:` line records that, and
`docs/plans/2026-08-24-pr-why-risk-brief.md` is the plan they were built from.
**Do not modify that file.**

## Source of truth

- spec: `specs/2026-08-24-pr-why-risk-brief.md` (SPEC-03, `Status: approved`,
  `Amended: 2026-08-24`) — this plan covers `AC-83` – `AC-98` only
- roadmap lesson: **L05** — *Project Context Folder · Onboarding generator ·
  **PR Brief card*** (`README.md:95`); this is the third and last L05 item, and
  the amendment is a defect fix plus design fidelity on already-shipped L05 work
- INSIGHTS consulted: `server/INSIGHTS.md`, `client/INSIGHTS.md`, `e2e/INSIGHTS.md`

**One paragraph of the spec is known-stale and must not be planned from.** The
i18n note under `## Non-functional requirements` opens by listing what the
`brief` namespace "today carries … and nothing else". That sentence describes
the namespace as it stood *before* `AC-1` – `AC-82` shipped. The working tree's
`client/messages/en/brief.json` is authoritative and already carries `mergeRisk`,
`cost`, `badges`, `reviewFocus`, `confirm`, `footer`, `degraded`, `fileSummary`,
`failure`, `error`, `intent` and `why`. **Add only the keys T3 names.** The rest
of that note is accurate and binding.

## Acceptance-criteria coverage

| AC | Criterion (shortened) | Tasks | Proven by |
|---|---|---|---|
| AC-83 | The strip renders the merge-risk band whether or not a review exists; band and verdict are never alternatives | T9 | `BriefVerdictStrip.test.tsx`, `e2e/specs/10-pr-brief.flow.json` |
| AC-84 | Blocking reasons = non-dismissed findings at/above the run's gate ∪ `high` risks | T8 | `BriefVerdictStrip/helpers.test.ts` |
| AC-85 | Badge count and the opened list come from the same live set | T8, T9 | `helpers.test.ts`, `BriefVerdictStrip.test.tsx`, `e2e/specs/10-pr-brief.flow.json` |
| AC-86 | Info control adjacent to the counts badge when ≥1 blocking reason, absent otherwise | T9 | `BriefVerdictStrip.test.tsx` |
| AC-87 | Hover/focus shows one list: findings by severity desc, then `high` risks in stored order | T8 | `helpers.test.ts`, `BlockingReasonsCard.test.tsx` |
| AC-88 | Each row: severity indicator, title, exactly one `file:line`, and no rationale/explanation | T8 | `BlockingReasonsCard.test.tsx` |
| AC-89 | Row reference links to GitHub when `repoFullName` and `headSha` are known, else plain mono text | T8 | `BlockingReasonsCard.test.tsx` |
| AC-90 | `role="tooltip"`, opens on hover and focus, closes on `Escape`, renders through a portal | T8 | `BlockingReasonsCard.test.tsx` |
| AC-91 | At most 8 rows; states how many are not shown when more exist | T8 | `helpers.test.ts`, `BlockingReasonsCard.test.tsx` |
| AC-92 | Verdict `approve` or live blockers 0, while `merge_risk` is `high` → strip states the disagreement | T8, T9 | `helpers.test.ts`, `BriefVerdictStrip.test.tsx` |
| AC-93 | A run with no recorded gate is treated as `critical` | T6, T8 | `server/test/contracts.test.ts`, `helpers.test.ts` |
| AC-94 | Section label naming the brief, above the verdict strip | T9 | `BriefPanel.test.tsx` |
| AC-95 | Regeneration control renders inside the verdict strip (AC-81's visible label unchanged) | T9 | `BriefPanel.test.tsx`, `BriefVerdictStrip.test.tsx` |
| AC-96 | Cost/token line inside the strip: under the donut when it renders, else last in the main column | T9 | `BriefVerdictStrip.test.tsx` |
| AC-97 | Intent card and blast-radius card at equal width | T5 | `BriefPanel.test.tsx` |
| AC-98 | Risk row renders title and file reference on separate lines within a bordered row | T4 | `RiskList.test.tsx` |

All sixteen are planned. Nothing in `AC-83` – `AC-98` is excluded.

## Requirements review

- **Requirement as understood**: build the amendment — put both judgements on one
  strip with a live, countable blocking-reason set behind a hover control, and
  apply the five frame corrections — without re-opening any of `AC-1` – `AC-82`.
- **Gaps found and how they were answered** (asked and answered in the discovery
  round; all four took the recommended option):
  - `AC-90` says reuse **or** copy `FindingsHoverCard`, and literal reuse is
    impossible: it lives under the PR *list* route, fetches its own data via
    `usePrReviews`, and renders `f.rationale`, which `AC-88` forbids. **Decided:
    copy the mechanics into a new `BlockingReasonsCard` under the brief's own
    folder.** No shipped component and no shipped test is re-touched.
  - The strip's composition was unstated, and `VerdictBanner` has a second
    consumer at `ReviewRunAccordion.tsx:157` (Agent runs tab). **Decided:
    `BriefVerdictStrip` owns its own layout**; `VerdictBanner` and
    `ReviewRunAccordion` are untouched.
  - e2e scope. **Decided: the band word plus the live blocker count.** The `ⓘ`
    card is not asserted — `agent-browser` has no hover command
    (`e2e/README.md`, `e2e/run.ts`).
  - Execution mode. **Decided: multi-agent.**
- **Assumptions this plan rests on** — each is visible so a wrong one is cheap to
  spot:
  - `AC-84`/`AC-85`'s composition happens **on the client**, as a pure function.
    The spec's contract-impact note adds exactly one field (`RunSummary.ci_fail_on`)
    and no blocking-reasons response field, and after that field lands the client
    already holds findings with `dismissed_at` (`usePrReviews`), the run rows
    (`usePrRuns`) and the brief's risks (`usePrBrief`).
  - The `BriefBadges` row (Partial / Truncated / Stale) stays where it is, now
    beside the new section label, once the regenerate button leaves it for the
    strip. `AC-94` places the label; no criterion moves the badges.
  - `AC-96` moves the cost line out of `BriefFooter` and into the strip. The
    footer keeps `AC-80`'s generated-from line and `AC-56`'s cross-model note.
    The e2e flow's existing cost assertion still passes — the text is unchanged,
    only its position moves.
- **Contradicts spec / INSIGHTS / roadmap**: nothing. The one stale spec
  paragraph is named above and neutralised.

## Recommendations

- **`RunSummary.ci_fail_on` must be `.nullish()`, never `.nullable()`.** This is
  the one place the spec's "additive, MINOR" verdict can go wrong mechanically:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:16`
  builds a `RunSummary` from a full object literal, so a required-but-nullable
  key makes `pnpm typecheck` fail in `client/`. T2 states the reason inline so a
  later reader cannot "tidy" it back.
- **`mcp/` is a fourth consumer that root `CLAUDE.md`'s module table does not
  list.** `mcp/src/http/schemas.ts:12,113` imports `RunSummary` through
  `mcp/tsconfig.json:22`, which maps `@devdigest/shared` straight at
  `server/src/vendor/shared/index.ts`. Nothing else in the repo catches a drift
  there, which is why `cd mcp && npm run typecheck` appears in
  `## Verification (end to end)` for a module the docs do not mention.
- **`server/src/db/seed.ts` is not changed, and that has a consequence.**
  `AC-91`'s >8 overflow and `AC-92`'s disagreement do not exist in the seed and
  will therefore be **undemoable in the running app** — they are proven by RTL
  fixtures only. `e2e/CLAUDE.md` states plainly that changing the seed breaks
  specs, so surfacing either state in the demo is worth a separate, later plan
  rather than a rider on this one.
- **Do not spend a task on the `contracts/trace.ts` mirror drift.** It is
  comment-only (server says `T1.3`/`T3` at lines 44–47, client says `repo-intel`),
  predates every current branch, and `preflight.sh`'s `drifted_at_base` already
  classifies it as not-introduced-here. T7's whole-file copy resolves it as a
  side effect; that is fine and is not this change's business.
- **The gate→severity-rank mapping goes in `client/src/lib/severity.ts`**, beside
  the existing `severityRank`. `reviewer-core`'s `SEV_RANK`/`FAIL_ON_MIN_RANK`
  (`reviewer-core/src/output/to-review.ts:48`) cannot be imported into `client/`,
  so a second definition is unavoidable — but `client/CLAUDE.md` records that
  hand-rolled `SEV_COLOR` copies have *already* drifted, and that is the
  precedent: two copies, never three.
- **`AC-93` gets real coverage almost by accident — give it a deliberate test
  anyway.** The seeded review at `server/src/db/seed.ts:505` has `run_id` **null**
  (the fixture run at `:1094` is deliberately unlinked and says so), so the seeded
  app exercises the `critical` fallback on every render. That is luck, not
  coverage: T8 must unit-test the null-gate branch directly.

## Execution mode

**multi-agent** — five waves. The server contract/schema pair and the two
design-fidelity corrections are genuinely independent and parallelise; the
blocking-reasons chain (contract → mirror → pure domain → card → strip → e2e) is
a single dependency line and is planned as one, without inventing parallelism it
does not have.

- **Wave 1 — parallel: T1, T2, T3, T4, T5** · two modules, five disjoint `Files:`
  lists. T2 is a contract change and nothing in this wave consumes it.
- **Wave 2 — parallel: T6, T7** · different modules, disjoint files; T6 consumes
  T1+T2, T7 mirrors T2.
- **Wave 3 — sequential: T8** · consumes the mirrored contract from T7 and the
  i18n keys from T3.
- **Wave 4 — sequential: T9** · consumes T8's composer and card, and re-touches
  `BriefPanel/styles.ts` that T5 changed in wave 1.
- **Wave 5 — sequential: T10** · asserts the rendered result of T9.
- After each wave: `plan-verifier` against that wave's tasks.

**T2 and T7 must land in the same commit.** Root `CLAUDE.md` requires the
canonical contract and its client mirror to move together; they are two tasks
because a task spans one module, not because they are two commits.

## Constraints that must not break

- No comments in new code — source: root `CLAUDE.md`, *Non-default conventions*.
  The one exception is a `@deprecated` marker block, which nothing here needs.
- `client/src/vendor/shared/` is a mirror; the canonical copy is
  `server/src/vendor/shared/` — source: `client/CLAUDE.md`, *Gotchas*.
- Never hand-edit `server/src/db/migrations/*.sql` — source: `server/CLAUDE.md`,
  *Gotchas*. Schema changes go `src/db/schema/*.ts` → `pnpm db:generate` →
  `pnpm db:migrate`.
- Every import from `@devdigest/shared` in new client code must be `import type`
  — a value import drags the vendored barrel into webpack and can break
  `pnpm build` while `typecheck` and `test` stay green — source:
  `client/INSIGHTS.md:27`.
- Severity colours and icons come from `SEV` in
  `client/src/vendor/ui/primitives/tokens.ts` only; no third `SEV_COLOR` copy —
  source: `client/CLAUDE.md`, *Gotchas*; `client/src/lib/brief.ts:8` is the
  existing correct usage.
- Data access only through `src/lib/hooks/*` → `src/lib/api.ts`; never `fetch`
  in a component — source: `client/CLAUDE.md`, *Conventions*.
- The new server work may not import from `intent/`, `blast/`, `smart-diff/` or
  `repo-intel/`; cross-slice imports are a dependency-cruiser `error` and the
  config resolves type-only edges the same as runtime ones — source: spec
  `## Non-functional requirements`, *Layering*.
- Nesting stops at `_components/<Parent>/_components/<Child>/` — source:
  `client/CLAUDE.md` via `frontend-ui-architecture`. `BlockingReasonsCard` sits
  at exactly that depth and may not grow another level.
- `e2e/` must stay Playwright-free and LLM-free; `wait --text` / `wait --url`
  **are** the assertions — source: `e2e/CLAUDE.md`.
- `wait --text` times out against text rendered through `textTransform: uppercase`
  — source: `e2e/INSIGHTS.md`, recorded in `10-pr-brief.flow.json`'s own
  `description`. Assert content, not `SectionLabel` titles.
- There is **no lint script in any module.** Do not run one.

## Tasks

### T1 — Add a nullable `ci_fail_on` column to `agent_runs` · module: server · wave: 1

- Files: `server/src/db/schema/runs.ts` (edit),
  `server/src/db/migrations/0022_*.sql` (new, generated),
  `server/src/db/migrations/meta/_journal.json` (edit, generated),
  `server/src/db/migrations/meta/0022_snapshot.json` (new, generated)
- Skills: drizzle-orm-patterns, postgresql-table-design
- Do: in `server/src/db/schema/runs.ts`, add to `agentRuns` (after `blockers` at
  line 30) a nullable column
  `ciFailOn: text('ci_fail_on', { enum: ['never', 'critical', 'warning', 'any'] })`
  — **no** `.notNull()`, **no** `.default()`. Nullable with no backfill is
  deliberate: existing rows keep a null and AC-93 reads that as `critical`; a
  column default would silently claim a policy those runs may not have used.
  Then run `pnpm db:generate` and `pnpm db:migrate` from `server/`. The generated
  file will be `0022_*` — the journal ends at `0021_moaning_monster_badoon`.
  Match the file you are in: `src/db/schema/*` omits the `.js` import suffix.
- Done when: `server/src/db/schema/runs.ts` declares `ciFailOn`; a single new
  `0022_*.sql` exists containing exactly one
  `ALTER TABLE "agent_runs" ADD COLUMN "ci_fail_on" text;` and nothing else; the
  journal has an `idx: 22` entry; `pnpm db:migrate` completed.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: —
- Note: `pnpm db:generate` becomes **interactive** only when one table both drops
  and adds columns in the same diff (`server/INSIGHTS.md:185`). This diff only
  adds, so it will not prompt. If it does prompt, something else is uncommitted
  in the schema — stop and report rather than answering the prompt.

### T2 — Add `RunSummary.ci_fail_on` to the canonical contract · module: server · wave: 1

- Files: `server/src/vendor/shared/contracts/trace.ts` (edit),
  `server/test/contracts.test.ts` (edit)
- Skills: zod, semver-discipline, breaking-change
- Do: in `RunSummary` (`contracts/trace.ts:97-117`), after `blockers`, add
  `ci_fail_on: CiFailOn.nullish(),` and import `CiFailOn` from
  `./knowledge.js` (it is defined at `contracts/knowledge.ts:327` as
  `z.enum(['never','critical','warning','any'])`). Confirm the import specifier
  style against the file's existing relative imports.
  **It must be `.nullish()`, not `.nullable()`.** `.nullable()` leaves the key
  required in the inferred type, and
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:16`
  builds a `RunSummary` from a complete object literal — a required key there
  turns this "additive, MINOR" change into a `pnpm typecheck` failure in
  `client/`. Do not narrow it later.
  Add a case to `server/test/contracts.test.ts` asserting that `RunSummary`
  parses a payload with `ci_fail_on` absent, with it `null`, and with
  `'critical'`, and rejects an out-of-enum value.
- Done when: `RunSummary` carries `ci_fail_on` as `CiFailOn.nullish()`, and the
  three-way parse case passes.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run test/contracts.test.ts --reporter=dot`
- Depends on: —

### T3 — Add the amendment's i18n keys to the `brief` namespace · module: client · wave: 1

- Files: `client/messages/en/brief.json` (edit)
- Skills: none — plain edit
- Do: add **only** the keys below. Every other key the amendment's text needs
  already exists in this file — read it before adding anything, and do not
  re-add `mergeRisk`, `cost`, `badges`, `reviewFocus`, `confirm` or `footer`.
  `en` is the only locale (`client/messages/` contains `en` and nothing else).
  - `block.brief` — the AC-94 section label, e.g. `"PR Brief"`
  - `blocking.control` — the AC-86 control's accessible name, e.g.
    `"Why this may not be safe to merge"`
  - `blocking.title` — the AC-87 card heading, e.g. `"Blocking reasons"`
  - `blocking.count` — the reason count, ICU-pluralised the way
    `client/messages/en/prReview.json`'s `list.hoverCard.count` is
  - `blocking.overflow` — the AC-91 line, e.g. `"{count} more not shown"`
  - `blocking.empty` — used when the card opens with nothing in it
  - `disagreement` — the AC-92 sentence, composed from this namespace with the
    two judgements as parameters and containing **no** model-generated text
    (the same rule AC-59 sets for the cross-model note), e.g.
    `"The review says {verdict}, the brief rates merge risk {band}."`
- Done when: the seven keys exist, the file is valid JSON, and no existing key
  was reworded or removed.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: —

### T4 — AC-98: risk row renders title over its file reference in a bordered row · module: client · wave: 1

- Files:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/RiskList/RiskList.tsx` (edit),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/RiskList/styles.ts` (edit),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/RiskList/RiskList.test.tsx` (edit)
- Skills: frontend-ui-architecture, react-best-practices
- Do: the shipped row puts the title and the first `file_ref` on one line with
  the reference right-aligned at `maxWidth: "45%"` (`styles.ts`, `headerRef`),
  which truncates a path like `src/middleware/ratelimit.ts:12-18` on a narrow
  column. Give the reference its own full-width line beneath the title, inside a
  bordered box: change `s.row` from a `borderTop` divider to a bordered,
  rounded box with a gap between rows, restructure `s.header` so the title line
  and the reference line stack, and drop `maxWidth`/`textAlign: "right"` from
  `headerRef`. Keep the expand/collapse affordance, `aria-expanded`, the
  `Enter`/`Space` handling and the chevron exactly as they are — AC-19, AC-75 and
  AC-76 are shipped criteria this task must not disturb. Read
  `client/INSIGHTS.md`'s CSS-shorthand note before editing a stateful style
  function.
- Done when: a `RiskList.test.tsx` case renders a risk carrying a long
  `file_refs[0]` and asserts the title and the reference are not siblings on one
  flex line (assert on the rendered structure, not on a pixel width), and the
  existing expand/collapse and keyboard cases still pass unchanged.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/RiskList/RiskList.tsx" --reporter=dot`
- Depends on: —

### T5 — AC-97: intent and blast-radius cards at equal width · module: client · wave: 1

- Files:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/styles.ts` (edit),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/BriefPanel.test.tsx` (edit)
- Skills: frontend-ui-architecture
- Do: in `s.cardGrid`, change
  `gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 1fr)"` to
  `"minmax(0, 1fr) minmax(0, 1fr)"`. The frame gives each column 697 px of a
  1400 px content area. Change nothing else in this file — T9 edits it again in
  wave 4 and the two edits must not collide in review.
- Done when: a `BriefPanel.test.tsx` case asserts the grid's two columns are
  declared equal.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/BriefPanel.tsx" --reporter=dot`
- Depends on: —

### T6 — Denormalize the run's gate policy onto `agent_runs` at completion · module: server · wave: 2

- Files: `server/src/modules/reviews/run-executor.ts` (edit),
  `server/src/modules/reviews/repository.ts` (edit),
  `server/src/modules/reviews/repository/run.repo.ts` (edit)
- Skills: onion-architecture, drizzle-orm-patterns
- Do: three edits, all on the completion path.
  1. `run.repo.ts` — add `ciFailOn?: CiFailOn | null;` to the `values` parameter
     of `completeAgentRun` (line 142) so the column can be written, and add
     `ci_fail_on: run.ciFailOn,` to the DTO that `listRunsForPull` builds
     (after `blockers` at line 67). The mapping is what makes the field reach
     `GET /pulls/:id/runs`; without it the contract lies, because **no route in
     this repo declares a `response:` schema** and the body is this hand-written
     DTO (`server/CLAUDE.md`, *Conventions*).
  2. `repository.ts` — widen the `completeAgentRun` wrapper's `values` type at
     line 147 the same way. It is a pass-through; do not add logic here.
  3. `run-executor.ts` — at the **done** path only (line 302, beside
     `score: outcome.review.score, blockers,`), pass
     `ciFailOn: agent.ciFailOn`. Leave the two failure/cancel call sites (lines
     97 and 359) alone: a failed run produces no review, so AC-84 never reads its
     gate, and writing it there would be noise.
  Keep the ESM `.js` import specifiers these files already use.
- Done when: a completed run row carries the gate its agent held at completion,
  and `RunSummary` rows returned by `listRunsForPull` carry `ci_fail_on`.
  Historical rows return `null`, which AC-93 defines as `critical`.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T1, T2

### T7 — Mirror `contracts/trace.ts` into the client · module: client · wave: 2

- Files: `client/src/vendor/shared/contracts/trace.ts` (edit)
- Skills: zod
- Do: copy `server/src/vendor/shared/contracts/trace.ts` over
  `client/src/vendor/shared/contracts/trace.ts` so the two are byte-identical.
  The two files already differ at lines 44–47 by a **comment only** — the server
  says `T1.3`/`T3`, the client says `repo-intel`. That drift predates every
  current branch, `preflight.sh`'s `drifted_at_base` already classifies it as
  not-introduced-here, and the whole-file copy resolves it as a side effect.
  Do not treat it as a break this change introduced, and do not spend effort
  reconciling it by hand.
  **This must land in the same commit as T2** — root `CLAUDE.md` binds the
  canonical contract and its mirror together.
- Done when: `diff server/src/vendor/shared/contracts/trace.ts client/src/vendor/shared/contracts/trace.ts` is empty.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T2

### T8 — The blocking-reason domain and the `BlockingReasonsCard` · module: client · wave: 3

- Files: `client/src/lib/severity.ts` (edit),
  `client/src/lib/severity.test.ts` (edit — the file exists),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/helpers.ts` (new),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/helpers.test.ts` (new),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/constants.ts` (new),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/_components/BlockingReasonsCard/BlockingReasonsCard.tsx` (new),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/_components/BlockingReasonsCard/BlockingReasonsCard.test.tsx` (new),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/_components/BlockingReasonsCard/constants.ts` (new),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/_components/BlockingReasonsCard/helpers.ts` (new),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/_components/BlockingReasonsCard/styles.ts` (new),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/_components/BlockingReasonsCard/index.ts` (new)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library, typescript-expert, security
- Do: two halves, one deliverable.

  **(a) The pure domain.** In `client/src/lib/severity.ts`, beside the existing
  `severityRank`, add the gate→rank mapping and a
  `meetsGate(severity: string, gate: CiFailOn | null | undefined): boolean`.
  `reviewer-core`'s `SEV_RANK`/`FAIL_ON_MIN_RANK`
  (`reviewer-core/src/output/to-review.ts:48`) cannot be imported into `client/`,
  so this is a second definition by necessity — `client/CLAUDE.md` records that
  hand-rolled `SEV_COLOR` copies have already drifted, so keep it to **two**
  copies and put it here, not in a component folder. A `null` gate resolves to
  `'critical'` (AC-93). Note `severityRank` today ranks `CRITICAL` as **0** and
  a lower number as more severe — read it before writing the comparison.

  In `BriefVerdictStrip/helpers.ts`, add pure functions with no React and no
  hooks:
  - `composeBlockingReasons({ review, run, risks })` → `BlockingReason[]`
    (AC-84): non-dismissed findings of the latest completed review whose severity
    meets the gate recorded on the run that produced it, **unioned** with risks
    whose `severity === 'high'`. Findings first, ordered by severity descending;
    then high risks in stored order (AC-87). Each `BlockingReason` carries a
    severity, a title and exactly one `file:line` reference — and **no**
    `rationale` and no `explanation` (AC-88); do not carry fields the card is
    forbidden to render. Derive a finding's reference from `file`,
    `start_line`, `end_line`; a risk's from `file_refs[0]` via
    `formatFileRef` in `client/src/lib/brief.ts`.
  - `visibleBlockingReasons(reasons)` → `{ rows, hiddenCount }` capping at
    `MAX_BLOCKING_ROWS = 8` in `constants.ts` (AC-91). Never truncate silently.
  - `judgementsDisagree({ verdict, blockerCount, mergeRisk })` → `boolean`
    (AC-92): true when `merge_risk` is `high` **and** (verdict is `approve`
    **or** the live blocker count is 0).
  The strip's blocker badge count is `composeBlockingReasons(...).length` —
  **not** `run.blockers` (AC-85). `agent_runs.blockers` is frozen at completion
  (`server/src/modules/reviews/run-executor.ts:299`) and stays the CI and
  timeline signal; it stops being the strip's source because a dismissal makes
  the frozen number disagree with what the reader can count.

  **(b) The card.** Copy the hover mechanics from
  `client/src/app/repos/[repoId]/pulls/_components/FindingsHoverCard/` — the
  open/close timers, `placeCard`, the `createPortal`, the `Escape` `keydown`
  listener and the capture-phase scroll dismiss — into
  `BlockingReasonsCard`. **Copy, do not import**: `FindingsHoverCard` belongs to
  the PR-list route and a route-feature→route-feature import is the one direction
  `frontend-ui-architecture` rules out. Do not modify `FindingsHoverCard` or its
  tests.
  Differences from the thing you are copying, all mandatory:
  - It takes its rows as a prop. It fetches **nothing** — no `usePrReviews`, no
    hook of any kind. The data is already in the strip.
  - It renders severity via the `SeverityBadge` primitive
    (`client/src/vendor/ui/primitives/index.ts:5`), which carries the word and
    not only a colour, plus the title, plus exactly one reference. **No
    rationale, no explanation, no summary** (AC-88).
  - `AC-89`: the reference is a `githubBlobUrl` anchor built by
    `client/src/lib/github-urls.ts` when `repoFullName` **and** `headSha` are
    both known, and plain monospace text otherwise. A title is never used to
    build a URL, and nothing is rendered through `dangerouslySetInnerHTML`.
  - `role="tooltip"`, opens on pointer hover **and** on keyboard focus, closes on
    `Escape`, renders through a portal (AC-90).
  - The overflow line renders `blocking.overflow` when `hiddenCount > 0`.
  Every string comes from the `brief` namespace via `useTranslations("brief")`
  (AC-77). Every `@devdigest/shared` import is `import type`
  (`client/INSIGHTS.md:27`).

- Done when: `helpers.test.ts` covers, against fixtures with no network — the
  union and its ordering; a dismissed blocker excluded; each gate value
  (`never`/`critical`/`warning`/`any`) selecting the right findings; **a null
  gate behaving exactly as `critical`** (AC-93, tested deliberately rather than
  relied on); `medium`/`low` risks excluded; the 8-row cap with its
  `hiddenCount`; and all three disagreement branches. `BlockingReasonsCard.test.tsx`
  covers `role="tooltip"`, a focus-driven open, an `Escape`-driven close, the
  portal parent being outside the anchor's subtree, a row containing no substring
  of a finding's `rationale` or a risk's `explanation`, the anchor present with
  `repoFullName`+`headSha` and absent without them, and the overflow line at 9+
  reasons.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run "src/lib/severity.ts" "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/helpers.ts" --reporter=dot`
- Depends on: T3, T7

### T9 — Rebuild `BriefVerdictStrip` to carry both judgements, and rehome the panel's controls · module: client · wave: 4

- Files:
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/BriefVerdictStrip.tsx` (edit),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/styles.ts` (edit),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/BriefVerdictStrip.test.tsx` (edit — **rewrite, do not delete**),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/BriefPanel.tsx` (edit),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/styles.ts` (edit),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/helpers.ts` (edit),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/BriefPanel.test.tsx` (edit)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do:

  **The strip stops delegating.** Delete the
  `if (review) return <VerdictBanner …/>` branch at `BriefVerdictStrip.tsx:27`
  and render one strip that always shows the merge-risk band (AC-83). Do **not**
  touch `VerdictBanner` or its `styles.ts` — it has a second consumer at
  `ReviewRunAccordion.tsx:157` (Agent runs tab) and none of the strip's new
  elements belong there. Copy what you need from `VerdictBanner/styles.ts` —
  notably `scoreCol` at line 38 and `scoreLabel` — into the strip's own
  `styles.ts`, and `VERDICT_META` is exported from
  `../../../VerdictBanner/constants` and may be imported as-is — it is a
  constants module, not the component, so importing it is not a dependency on
  the banner's layout.

  The strip's contents:
  - **Always**: the merge-risk band as a labelled element whose word is rendered
    as text (`mergeRiskToken` from `client/src/lib/brief.ts`; colour is never the
    only carrier), and the brief summary.
  - **When a review exists** (AC-6): the verdict label, the review summary, the
    finding count, the **live** blocker count from
    `composeBlockingReasons(...).length` — never `run.blockers` — and the 0-100
    `CircularScore` donut.
  - **When no review exists** (AC-7): omit the verdict label, both counts and the
    donut. The band is not conditional.
  - **AC-86**: an information control immediately after the counts badge, and
    only when the blocking-reason list is non-empty. It wraps/anchors
    `BlockingReasonsCard`, carries `blocking.control` as its accessible name, and
    is focusable so AC-90's keyboard path works.
  - **AC-92**: when `judgementsDisagree(...)` is true, render the `disagreement`
    sentence composed from the `brief` namespace with the verdict and the band as
    parameters. It contains no model-generated text.
  - **AC-95**: the regeneration control renders inside the strip. Take it as a
    `regenerate?: React.ReactNode` slot prop so the strip never owns the confirm
    modal or the mutation. AC-81 is unchanged and still binding — the control
    keeps its **visible text label** naming the brief; the frame draws it
    icon-only and loses here, because two differently-priced paid actions on one
    tab must not be told apart by position.
  - **AC-96**: the cost and token line renders inside the strip — beneath the
    donut when the donut renders, otherwise as the last element of the main
    column beneath the brief summary. There is no trailing column without the
    donut, so do not invent an empty one.

  **The panel gives up two things and gains a heading.**
  - `BriefPanel.tsx`: add `<SectionLabel icon="FileText">{t("block.brief")}</SectionLabel>`
    above the strip (AC-94; both `FileText` and `Info` exist in
    `client/src/vendor/ui/icons.tsx`). Move the `<Button …>Regenerate brief</Button>`
    out of the header row and pass it to the strip's `regenerate` slot, keeping
    `loading`/`disabled`/`onClick={openConfirm}` exactly as they are. Delete the
    cost/token `<span>` from `BriefFooter` — the footer keeps AC-80's
    generated-from line and AC-56's cross-model note and nothing else. Keep
    `BriefBadges` in the header row, now beside the section label.
  - `BriefPanel/helpers.ts`: `stripReviewFrom` currently sets
    `blockers: run?.blockers ?? 0`. Stop passing a frozen blocker count; pass
    what the strip needs to compute the live one — the review's findings, the
    matching run's `ci_fail_on`, and the brief's risks — or drop `blockers` from
    `BriefVerdictStripReview` and let the strip call
    `composeBlockingReasons`. Either shape is fine; what is not fine is two
    numbers on screen that can disagree (AC-85).
  - `BriefPanel.tsx` already holds `usePrReviews` and `usePrRuns`; it needs no
    new hook and must not `fetch`.

  Every `@devdigest/shared` import stays `import type`.

  **Rewrite, do not delete, `BriefVerdictStrip.test.tsx`.** Line 38 currently
  pins `expect(screen.queryByText(/merge risk/i)).not.toBeInTheDocument()` under
  a review — AC-83 inverts exactly that assertion, so it becomes a positive one.
  The other cases in that file (band word per band, donut absent without a
  review) stay and still pass.

- Done when: `BriefVerdictStrip.test.tsx` asserts — the band's word present in
  **both** the reviewed and the unreviewed rendering of one pull request (AC-83);
  verdict label, review summary, finding count, live blocker count and the donut
  all present in the reviewed strip alongside the band (AC-6); label, counts and
  `CircularScore` absent with the band still rendered when unreviewed (AC-7); the
  info control present with ≥1 blocking reason and absent with none (AC-86); the
  disagreement line present for `approve` + `merge_risk: 'high'` and absent
  otherwise (AC-92); the blocker badge count equal to the opened list's row count
  when a blocker finding has been dismissed (AC-85); and the cost line inside the
  strip in **both** layouts (AC-96). `BriefPanel.test.tsx` asserts the section
  label (AC-94), the regenerate control rendering inside the strip while keeping
  its visible label (AC-95, AC-81), and no cost line left in the footer.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest related --run "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefVerdictStrip/BriefVerdictStrip.tsx" "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BriefPanel/BriefPanel.tsx" --reporter=dot`
- Depends on: T5, T8

### T10 — Restore the merge-risk assertion the e2e flow had to give up · module: e2e · wave: 5

- Files: `e2e/specs/10-pr-brief.flow.json` (edit — **rewrite, do not delete**)
- Skills: none — plain edit
- Do: the flow's own `description` records that it cannot assert the merge-risk
  band *because* seeded PR #482 carries a completed review and the shipped strip
  renders `VerdictBanner` instead. AC-83 removes that limitation, so the flow
  gains the assertion back.
  What the seed actually yields on #482, verified: `merge_risk` is `'medium'`
  (`server/src/db/seed.ts:338`); the seeded review is `request_changes` with two
  findings, one `CRITICAL` and one `WARNING` (`:505`, `:519-543`); the seeded
  review's `run_id` is **null** — the fixture run at `:1094` is deliberately
  unlinked and says so in its own comment — so AC-93's `critical` fallback
  applies and the blocking-reason set is exactly **one**. All three seeded risks
  are `medium`/`medium`/`low`, so there is no high risk and no AC-92
  disagreement on this PR.
  Therefore: add a `wait --text` for the band word as the strip renders it
  (the existing key composes to `Merge risk: Medium`), and add a `wait --text`
  for the strip's counts badge now reading **1** blocker rather than 0 — the
  visible proof of AC-85. Match the exact rendered string, including separators,
  by reading the component T9 produced.
  Do **not** add a hover step: `agent-browser` has no hover command
  (`e2e/README.md`, `e2e/run.ts`), so the `ⓘ` card is out of scope here and is
  covered by RTL in T8.
  Rewrite the `description`: delete the sentence claiming the band is
  unassertable, and keep the two other recorded NOTEs verbatim — the
  `textTransform: uppercase` trap and the `FileCard` auto-expand note are both
  still true and both cost a hermetic run to learn.
  Do not press Generate or Regenerate — `e2e/README.md`'s no-LLM, no-API-key rule
  makes the cached read path the only path here. **Do not change
  `server/src/db/seed.ts`**: `e2e/CLAUDE.md` states that changing the seed breaks
  specs, and no criterion in this plan needs new seed data.
- Done when: the flow asserts the band word and the live blocker count on #482,
  the stale `description` sentence is gone, and the existing cost-line assertion
  (`8,210 in · 960 out · $0.0042`) still passes — AC-96 moves that text into the
  strip but does not change it.
- Verify: `cd e2e && npm run typecheck`
- Depends on: T9

## Contract & version impact

**Verdict: MINOR.** One additive, optional field on one shared contract, plus one
nullable database column. Nothing is renamed, removed, narrowed or made newly
required, and no `@deprecated` marker is needed.

| Change | Surface | Who it breaks | Level |
|---|---|---|---|
| `+ RunSummary.ci_fail_on` (`CiFailOn.nullish()`) | `server/src/vendor/shared/contracts/trace.ts` + client mirror | nobody | MINOR |
| `+ agent_runs.ci_fail_on` (nullable, no backfill, no default) | Drizzle schema / migration `0022` | nobody | MINOR |
| Strip stops reading `run.blockers`, computes the count live | client-internal render path | nobody — `agent_runs.blockers` is unchanged and still drives CI and the timeline | PATCH |

**Evidence, not assumption.** The consumers of `RunSummary` are: `client/`
(`lib/hooks/reviews.ts:43`, `RunHistory.tsx`, `FindingsTab.tsx`,
`BriefPanel/helpers.ts`), `server/` itself, and `mcp/`
(`mcp/src/http/schemas.ts:12,113`). None breaks:
- `mcp/`'s `RunRowSchema` is `.passthrough()` and `Pick`s eight named fields,
  `ci_fail_on` not among them — an added optional field cannot fail it.
- `RunSummary` is a plain `z.object`, not `.strict()`, so unknown keys are
  stripped rather than rejected; and **no route declares a `response:` schema**
  in this repo, so the wire body is the hand-written DTO in
  `run.repo.ts:51-68`. T6 edits that DTO, which is why the field actually reaches
  the client instead of the contract quietly lying.
- The single place this could have broken is `RunHistory.test.tsx:16`, which
  builds a `RunSummary` from a complete object literal. `.nullish()` keeps the
  key optional in the inferred type and keeps that file compiling. `.nullable()`
  would not, and would make this MINOR into a client build failure. T2 says so
  where an implementer will read it.

**Database.** One expand step, no contract step, forward-only. Nullable with no
backfill is the whole design: existing rows keep `null` and AC-93 defines `null`
as `critical`. There is no second migration and nothing to drop later.

**No expand→migrate→contract sequence is required**, because nothing is removed.
Run the detection commands anyway before merge:

```bash
BASE=$(git merge-base HEAD origin/main)
git diff "$BASE" -- server/src/vendor/shared/contracts/ | grep '^-' | grep -v '^---'
git diff "$BASE" -- server/src/db/migrations/ | grep -Ei '^\+.*(DROP (COLUMN|TABLE|CONSTRAINT)|RENAME|SET NOT NULL|ALTER COLUMN .* TYPE)'
```

Both should be empty apart from the `trace.ts` comment lines T7 overwrites, which
are pre-existing mirror drift and not a break this change introduced.

## Verification (end to end)

In order, after all five waves are verified:

```bash
cd server && pnpm typecheck
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot
cd server && pnpm exec vitest run .it.test --reporter=dot
cd client && pnpm typecheck
cd client && pnpm exec vitest run --reporter=dot
cd client && pnpm build
cd mcp && npm run typecheck
cd e2e && npm run typecheck
diff server/src/vendor/shared/contracts/trace.ts client/src/vendor/shared/contracts/trace.ts
cd server && pnpm db:migrate && pnpm db:seed
cd e2e && npm test
```

Notes on four of these, because none is obvious:

- **The integration lane appears here and nowhere else.** `server/`'s suite
  starts a Postgres testcontainer per `*.it.test.ts` file — fourteen startups
  today — so no per-task `Verify:` may run it. `integration.it.test.ts` is the
  natural place to prove `ci_fail_on` survives a real `completeAgentRun` →
  `listRunsForPull` round trip against Postgres.
- **`cd mcp && npm run typecheck` is not a typo.** `mcp/` is a fourth package
  that root `CLAUDE.md`'s module table does not list, and
  `mcp/tsconfig.json:22` maps `@devdigest/shared` straight at
  `server/src/vendor/shared/index.ts`. It compiles against the canonical contract
  with no mirror in between, so it is the only check that catches a drift there —
  and a `tsc` failure in `mcp/` is how that drift would announce itself.
- **`cd client && pnpm build` is not redundant with `typecheck`.** A value import
  from `@devdigest/shared` drags the vendored barrel into webpack and can break
  the build while `typecheck` and `test` stay green (`client/INSIGHTS.md:27`).
  T8 and T9 add new `@devdigest/shared` imports, so this is the check that proves
  they are all `import type`.
- **`e2e` needs the app running and a freshly seeded DB** (`e2e/README.md`), and
  `npm test` — never Playwright, never an API key.

There is **no lint script in any module.** Do not add one to this list.

## Out of scope

- `AC-1` – `AC-82`. Implemented and merged; the spec's `Verified:` line records
  it, and `docs/plans/2026-08-24-pr-why-risk-brief.md` is their build record.
  **That file is not to be modified.**
- `VerdictBanner` and `ReviewRunAccordion`. The strip stops delegating to the
  banner; the banner itself and its Agent-runs-tab consumer are untouched.
- `FindingsHoverCard` and its two test files. AC-90's mechanics are **copied**
  from it, not refactored out of it.
- `server/src/db/seed.ts`. No new seed data. The consequence is stated plainly
  under `## Recommendations`: AC-91's overflow and AC-92's disagreement are
  proven by RTL fixtures and are **not demoable in the running app**.
- `agent_runs.blockers`. Frozen at completion by design
  (`run-executor.ts:299`), still the CI and timeline signal, and deliberately not
  edited — AC-85 only stops the *strip* from reading it.
- The `contracts/trace.ts` comment-only mirror drift as a thing to reconcile
  deliberately. T7's copy resolves it incidentally; no task is spent on it.
- Hover-driven e2e coverage of the `ⓘ` card. `agent-browser` has no hover
  command, and `e2e/CLAUDE.md` forbids introducing Playwright to get one.
- The `brief` server slice (`server/src/modules/brief/`), the generation
  pipeline, the prompt, the caching and the 202/409/429/404/422 route matrix.
  All shipped under `AC-1` – `AC-82`; the amendment adds no server-side brief
  behaviour.

## Open questions

None. The four that existed at discovery — the hover card's provenance, the
strip's composition, e2e scope and execution mode — were answered before this
plan was written and are recorded under `## Requirements review`. The spec's own
`## Open questions` section is empty by the same route.
