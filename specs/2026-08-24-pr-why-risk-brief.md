# Spec: PR Why + Risk Brief
Spec ID: SPEC-03
Status: implemented
Verified: 2026-08-24 — **AC-1 – AC-98 are implemented.** The sixteen amendment
criteria `AC-83` – `AC-98` were built on branch `lab-5-hw` across five commits
(`dda9d19`, `2fa7ef2`, `0853046`, `9df0af4`, `e37b8a3`) from
`docs/plans/2026-08-24-pr-why-risk-brief-blocking-reasons.md`, reviewed, and
traced criterion by criterion by `plan-verifier` in final mode, which returned
COMPLETE after one fix round with this spec's declared set and the plan's
coverage table identical and nothing dropped. Suites at HEAD: server 744 tests
across 64 files including the integration lane, client 451 across 62, `e2e`
typecheck clean, `dependency-cruiser` 0 errors. Each of the sixteen was
re-checked against the tree at status transition: `AC-83`–`AC-93` at
`BriefVerdictStrip.tsx`, its `helpers.ts` and
`_components/BlockingReasonsCard/`, with `AC-93`'s null-gate reading at
`client/src/lib/severity.ts:53-56`; `AC-94`–`AC-98` at `BriefPanel.tsx`,
`BriefPanel/styles.ts` and `RiskList/`; and the `RunSummary.ci_fail_on` that
`AC-84` and `AC-93` depend on at `server/src/vendor/shared/contracts/trace.ts:118`,
written at completion by `server/src/modules/reviews/run-executor.ts:312` and
mirrored byte-identically into `client/src/vendor/shared/`.

**Five things are not claimed, because verification could not make the
observation the criterion names.**

1. **`AC-93`'s migration was never observed applied.**
   `0022_bent_master_mold.sql` — `ALTER TABLE "agent_runs" ADD COLUMN
   "ci_fail_on" text` — is in the tree and registered at index 22 of
   `src/db/migrations/meta/_journal.json`, and the integration lane exercises
   the column against Testcontainers Postgres
   (`server/test/reviews.it.test.ts:238-288`, which also pins that editing the
   agent's gate afterwards does not move the run's recorded one). Whether
   `pnpm db:migrate` has actually run it against a live database is unverified:
   there was no DB access during verification.
2. **No e2e observation in this feature has ever been made live.**
   `e2e/specs/10-pr-brief.flow.json` carries the amendment's two new assertions
   — `"Merge risk: Medium"` (`AC-83`) and `"2 findings · 1 blockers"`
   (`AC-85`) — alongside its pre-existing cost-line assertion, and only
   `npm run typecheck` has ever run against that file. All three are unproven
   against a real DOM. `AC-83` and `AC-85` are confirmed anyway by component and
   unit tests that do run (`BriefVerdictStrip.test.tsx:85,125`,
   `BriefVerdictStrip/helpers.test.ts:52,93`); what remains unproven is the
   *seeded end-to-end* rendering, not the behaviour. Any criterion resting on
   that flow alone — `AC-80`, already recorded below as observable only through
   it — is therefore still not fully observed.
3. **The i18n reword `AC-71` depends on is in the tree but not attributable to
   this amendment.** `client/messages/en/brief.json:11` reads *"Generating the
   brief calls a paid model — press Generate when you want one."*, which
   satisfies `AC-71`. The file's only change on this branch is commit `2fa7ef2`,
   which carries two plans' work at once, so whether any *other* pre-existing
   key was reworded in the same pass cannot be separated out of git history.
4. **`AC-97` is confirmed on the declared style, not on a computed width.** Its
   stated observation is "the two columns' computed widths"; jsdom computes no
   grid track widths, so `BriefPanel.test.tsx:352` asserts
   `gridTemplateColumns === "minmax(0, 1fr) minmax(0, 1fr)"` instead
   (`BriefPanel/styles.ts`, with `alignItems: "stretch"`). Equal declared tracks
   are the same fact by construction, but this is an inspection of the rule and
   not of the box.
5. **One row of the design-provenance table did not ship.** Its copy row states
   that `brief.block.risks` and `brief.reviewFocus.title` are "reworded in
   place" to the frame's `RISK AREAS` and `REVIEW FOCUS — READ THESE FIRST`; the
   tree still reads `"Risks"` and `"Review focus"`
   (`client/messages/en/brief.json`). That row says in its own text that no
   criterion turns on the wording, so nothing is unimplemented against an `AC` —
   but the provenance table and the tree disagree, and a reader should be told
   so rather than discover it.

Two shipped behaviours are known, were accepted at close-out and were
deliberately not fixed: the merge-risk severity vocabulary borrowed by the
blocking-reasons card, and the keyboard reachability of that card's contents.
Both are stated under `## Non-functional requirements` and both have an
`## Edge cases` row, so that neither reads as a clean surface.

The original 82 were checked against the working tree on 2026-08-24; 79 of the
82 confirmed, and three are confirmed on the code path only: **AC-53**
(the no-currency branch exists at `BriefPanel.tsx:87` but no test renders
`BriefPanel` with a null `cost_usd`), **AC-54** (the 429 is proven at
`brief.it.test.ts:325`, the *per-workspace* scoping of the `keyGenerator` is
not — the one test uses a single workspace, and `app.ts:95` skips the limiter
under `NODE_ENV=test`) and **AC-61** (the `core`/`wiring` filter is implemented
and unit-tested at `domain.ts:266-267`, but its stated observation cannot be
made: no seeded PR contains `package-lock.json`). Two observations are also
unmakeable as written: **AC-29**'s input-summary counts have no column on
`pr_brief_generations`, and **AC-80**'s footer is asserted only through the
short sha in `e2e/specs/10-pr-brief.flow.json:15`, never in a component test.
That e2e flow also omits one assertion on purpose, recorded in its own
`description`: AC-27's count badge is substituted by a review-focus row's
`reason` text, because `wait --text` times out against a label rendered with
`textTransform: uppercase`.
Supersedes: none
Amended: 2026-08-24 — **the design frames were produced and inspected for the
first time**, and a defect was reported against the shipped strip: on a pull
request whose review returned `approve` with zero findings, the brief's own
merge-risk judgement and the reasons behind it vanished from the screen
entirely. `AC-6` and `AC-7` are replaced, `AC-51` and `AC-81` are amended on
placement only, and `AC-83`–`AC-98` are new. Every other criterion stands as
written and as verified. Only two shipped assertions become wrong under the
amendment and are named where they live, under `## Non-functional requirements`,
Testing.

`SPEC-03` is the next free id. `specs/` holds `SPEC-01`
(`specs/2026-08-20-project-context.md:2`) and `SPEC-02`
(`specs/2026-08-23-onboarding-generator.md:2`). The `SPEC-03` that appears at
`specs/README.md:40` is an illustrative example inside a fenced code block, and
`specs/2026-08-23-onboarding-generator.md:6-9` records in writing that the
number was deliberately skipped and left free. This document takes it.

## Problem and user

A reviewer opening a pull request in DevDigest gets a title, a diff and — if
somebody has paid for a run — a list of findings. What they do not get is the
one paragraph a human reviewer writes first: what this change is, why it exists,
how much care it deserves, and which four lines to read before the other two
hundred. The Overview tab renders exactly two cards today
(`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`)
— `IntentCard`, which says what the author *claims* the PR does, and
`BlastRadiusCard`, which says what the change can *reach*. Nothing joins them,
nothing rates the change, and nothing tells a reviewer where to start. The
verdict strip that carries the score and the summary is on a different tab
(`_components/VerdictBanner/`, rendered from the Agent runs tab), so the first
screen a reviewer lands on is the one screen with no judgement on it.

This is the third and last **L05** roadmap item — *Project Context Folder ·
Onboarding generator · **PR Brief card*** (`README.md:95`) — and it is unusually
scaffolded. `pr_brief` exists as a table with two columns and **zero writers**
(`server/src/db/schema/reviews.ts:101-106`); `Risk`, `Risks` and `PrBrief` exist
as contracts with **zero readers** anywhere in `server/src`, `client/src`,
`mcp/src`, `reviewer-core/src` or `e2e`
(`server/src/vendor/shared/contracts/brief.ts:12-24,152-158`);
`risk_brief` is already a selectable feature model with a default
(`contracts/platform.ts:17,59-63`), already rendered by the Settings picker
(`client/src/lib/feature-models.ts:29`) and already pinned by a test
(`server/test/settings-models.it.test.ts:54`); and
`client/messages/en/brief.json` is an orphaned i18n namespace nobody calls,
carrying `block.risks`, `noRisks`, `unavailable` and `unavailableHint`. Two
earlier specs deferred work here by name: `server/specs/2026-08-16-blast-radius.md`
refuses to write `pr_brief` because it is "an unversioned jsonb blob belonging
to a later composed-brief lesson", and `server/specs/2026-08-10-smart-diff.md:355`
defers `pseudocode_summary` because it "needs an LLM call, a `FeatureModelId`, a
prompt template, a persistence decision (where `pr_brief` would finally earn its
keep) and cost accounting". This feature is that lesson. It spans `server/`
(a new `brief` slice), the vendored contracts and their client mirror,
`client/` (the Overview tab and one row in the Files-changed tab) and `e2e/`.
`reviewer-core/` is untouched — the precedent for a feature-model LLM call is
`server/src/modules/intent/classifier.ts` with its prompt in
`server/src/prompts/`, not the engine, whose purity is a hard contract.

## Goals and non-goals

**Goals**

- A reviewer opening a PR can read, without paying for anything and without
  leaving the Overview tab, what the change does, why it exists, how risky it is
  to merge, and which files to open first.
- Every risk the brief states points at a real file that is either in this PR's
  diff or in its blast radius, so a claim can be checked rather than believed.
- A reviewer can tell a *risk level* from a *quality score* at a glance, and the
  two are never conflated in the data or in the UI.
- **Neither judgement can erase the other.** The review and the brief are two
  independent opinions on one change; whenever they both exist, both are on the
  first screen, and whenever either of them has a reason to hold the merge, that
  reason is one interaction away — never a paragraph the reader has to hunt for
  on another tab.
- The brief is generated once per PR state and read many times; opening the tab
  a second time costs nothing.
- Regeneration is an explicit, confirmed, priced act — never a side effect of
  viewing, pushing or re-indexing.
- A reader can always tell which of five states they are looking at: never
  generated, generating, current, stale, or failed.
- A reader knows the brief is one model's opinion, and which model, before they
  act on it.
- Nothing the brief adds changes the meaning of anything that already ships.

**Non-goals**

- **The brief does not own intent.** It reads `pr_intent` and never writes it.
  `IntentCard` keeps its own Recompute control, and the brief's regenerate
  control does not recompute intent (Q2 → *Compose, don't own*).
- **The brief does not own the review.** It never creates an agent run, never
  writes `reviews` or `findings`, and never changes a verdict or a score.
- **No second-model verification.** The cross-model note is a factual disclosure,
  not a second opinion, and costs no additional provider call (Q8).
- **No re-specification of Smart Diff.** Screenshot B's ordering, its three
  buckets and its inline severity badges already ship. The only part of that
  screen in scope is the per-file "What this does" line (Q1).
- **No automatic generation** on import, on push, on review, on re-index or on a
  schedule.
- **No editing.** A brief is regenerated, never hand-corrected.
- **No new MCP tool.** `mcp/` is untouched by this spec.
- **No backfill.** Existing PRs have no brief until somebody generates one.

## User stories

- **US-1**: As a reviewer, I want the PR's intent and a one-paragraph summary of
  what it changes on the first screen I land on, so that I can decide how to
  spend my attention before I open a single file.
- **US-2**: As a reviewer, I want a merge-risk level and a list of concrete risks
  that each name a real file and line, so that I can check a claim instead of
  trusting an adjective.
- **US-3**: As a reviewer, I want a short ordered list of the lines to read
  first, so that I start where the danger is rather than at the top of the diff.
- **US-4**: As a reviewer, I want risks to account for what the change reaches
  beyond its own diff, so that a two-line edit to a widely-called function does
  not read as a two-line change.
- **US-5**: As a studio user, I want the brief stored per PR state and
  regenerated only when I ask, so that I neither pay repeatedly for the same
  answer nor trust an answer that describes an older commit.
- **US-6**: As a studio user, I want to know which model wrote the brief and
  which wrote the findings, so that I read them as one perspective rather than
  as a verdict.
- **US-7**: As a reviewer, I want each substantive changed file to say what it
  does in one line, so that I can skim the Files-changed tab without reading
  every hunk.
- **US-8**: As a studio user, I want to see whether the brief is missing,
  generating, current, stale or failed — and what each attempt cost — so that I
  am never guessing at the state of something I paid for.

## Acceptance criteria (EARS)

### The brief and what it says (US-1)

- **AC-1 (US-1)**: WHEN a user opens `?tab=overview` for a PR that has a stored
  brief, the client shall render a PR Brief section containing a verdict strip,
  an intent card, a blast-radius card and a review-focus card.
  *Observed by*: the four card elements present in the rendered Overview tab.

- **AC-2 (US-1)**: The brief response shall carry a `summary` of at most 400
  characters stating what the pull request changes and why.
  *Observed by*: the `summary` field of `GET /pulls/:id/brief`, and its length.

- **AC-3 (US-1)**: The system shall compose the intent card from the stored
  `pr_intent` record and shall not write to `pr_intent` during brief generation.
  *Observed by*: `pr_intent.computed_at` for that PR, unchanged across a
  generation. One table, one writer — `server/specs/2026-08-09-intent-layer.md`
  deleted a duplicate `upsertIntent` for exactly this reason.

- **AC-4 (US-1)**: WHERE no `pr_intent` record exists for the PR, the intent card
  shall render its existing not-derived empty state and every other card of the
  brief shall still render.
  *Observed by*: the intent empty state and a non-null `merge_risk` present in
  the same rendered tab.

- **AC-5 (US-1)**: WHEN a generation runs for a PR with no completed agent run,
  the system shall still produce and store a brief.
  *Observed by*: a 200 `GET` carrying a non-null `summary` for a PR with zero
  rows in `reviews`.

- **AC-6 (US-1)**: WHERE the PR has at least one completed review, the verdict
  strip shall display the latest review's verdict label, its summary, its
  finding count, its live blocker count, its 0-100 PR score **and** the brief's
  merge-risk band.
  *Observed by*: the rendered strip compared with the latest `ReviewRecord`
  (`verdict`, `summary`, `score`), the live blocker count of AC-85 and the
  stored `merge_risk` — all of them present in one strip.
  **Why this replaces the original AC-6.** The superseded criterion made the
  strip an either/or, and `BriefVerdictStrip.tsx:27` implemented it exactly:
  `if (review) return <VerdictBanner …/>`, with the `mergeRisk` prop accepted
  and never read on that branch. The shipped test pinned the erasure
  (`expect(screen.queryByText(/merge risk/i)).not.toBeInTheDocument()`). The
  consequence, reported on 2026-08-24 against a real pull request: a brief that
  had derived `high` and listed its reasons was replaced, the moment a review
  completed, by *Approve · 0 findings · 100* — the losing judgement leaving no
  trace at all. Two independent opinions where one silently outranks the other
  is worse than either opinion alone, because the reader cannot tell that a
  second one was ever formed.

- **AC-7 (US-1)**: WHERE the PR has no completed review, the verdict strip shall
  display the brief's own `summary` and the merge-risk band, and shall omit the
  verdict label, the finding count, the blocker count and the PR-score donut.
  *Observed by*: absence of the `CircularScore` element together with a rendered
  merge-risk band in the same strip. Only the review-derived elements are
  conditional; the band is not — see AC-83.

### Risk level and risks (US-2)

- **AC-8 (US-2)**: The brief response shall carry a `merge_risk` field whose
  value is exactly one of `low`, `medium`, `high`.
  *Observed by*: the `merge_risk` field of `GET /pulls/:id/brief`.

- **AC-9 (US-2)**: The system shall never write a merge-risk value into
  `reviews.score`, into `ReviewRecord.score`, or into any field named `score`.
  *Observed by*: `reviews.score` for that PR, unchanged across a generation.
  `Review.score` is documented in its own `.describe()` as PR quality where
  *higher is better* (`contracts/findings.ts`); merge risk is the inverse
  reading, and reusing the field would invert a meaning without changing a shape.

- **AC-10 (US-2)**: WHEN the merge-risk band is rendered, the client shall label
  it as merge risk and shall not label it as a score.
  *Observed by*: the rendered label text against the `brief` i18n namespace key
  it comes from.

- **AC-78 (US-2)**: The system shall derive `merge_risk` from the risks that
  survive grounding: `high` if any surviving risk has severity `high`, otherwise
  `medium` if any surviving risk has severity `medium`, otherwise `low`.
  *Observed by*: the stored `merge_risk`, recomputed from the stored `risks`
  array alone with no provider call. Deriving the band rather than accepting one
  makes it auditable the way `scoreConfidence` is in the intent layer
  (`server/src/modules/intent/confidence.ts:101`), reproducible between two runs
  on one diff, and guarantees it never describes risks that AC-14 and AC-15
  dropped.

- **AC-79 (US-2)**: IF the model's output carries a merge-risk value of its own,
  THEN the system shall discard it and shall store the derived value.
  *Observed by*: a stored `merge_risk` equal to AC-78's rule for a generation
  whose raw model output named a different band.

- **AC-11 (US-2)**: Each risk shall carry a `kind`, a `title` of at most 80
  characters, an `explanation` of at most 600 characters, a `severity` of
  `high`, `medium` or `low`, and a non-empty `file_refs` array.
  *Observed by*: each element of `risks` in the response body.

- **AC-12 (US-2)**: Each `file_refs` entry shall have the form `path`,
  `path:line` or `path:start-end`.
  *Observed by*: each string in `risks[].file_refs`.

- **AC-13 (US-2)**: The system shall accept a `file_refs` entry only when its
  path is one of the pull request's changed files or one of the file paths named
  in that PR's blast-radius response.
  *Observed by*: every `risks[].file_refs` path present in the union of
  `pr_files.path` and the blast response's caller and symbol file paths.

- **AC-14 (US-2)**: IF a generated `file_refs` entry names a path outside that
  union, THEN the system shall drop that entry before persisting and shall log a
  `warn` naming the dropped count.
  *Observed by*: the `warn` log line's count field, and the entry's absence from
  the stored document.

- **AC-15 (US-2)**: IF dropping unresolvable entries leaves a risk with an empty
  `file_refs` array, THEN the system shall drop that risk before persisting.
  *Observed by*: the absence of any stored risk whose `file_refs` is `[]`.

- **AC-16 (US-2)**: The system shall persist at most 12 risks per brief, ordered
  by `severity` descending and then by generation order.
  *Observed by*: `risks.length` and the severity sequence in the stored document
  for a generation that produced more than 12.

- **AC-17 (US-2)**: The system shall persist at most 5 `file_refs` per risk.
  *Observed by*: `risks[].file_refs.length` in the stored document.

- **AC-18 (US-2)**: WHILE a risk row is collapsed, the client shall display its
  icon, its title and its first `file_refs` entry.
  *Observed by*: the rendered collapsed row against `risks[0]`.

- **AC-19 (US-2)**: WHEN a user expands a risk row, the client shall display that
  risk's `explanation` and all of its `file_refs` entries.
  *Observed by*: the expanded row's text content against the risk object.

- **AC-20 (US-2)**: WHERE `repoFullName` and `headSha` are both known, each
  `file_refs` entry shall render as a link to that file at that commit on
  GitHub; otherwise it shall render as plain monospace text.
  *Observed by*: the anchor `href`, built by `src/lib/github-urls.ts`, or the
  absence of an anchor. Same degradation rule as the blast card
  (`client/specs/2026-08-16-blast-radius.md`).

- **AC-21 (US-2)**: WHERE the stored brief contains zero risks, the client shall
  render the risks section with its no-risks empty state rather than omitting
  the section.
  *Observed by*: the rendered `brief.noRisks` string, already present at
  `client/messages/en/brief.json`.

### The two judgements and the blocking reasons (US-2)

The strip carries two opinions that were formed independently and can disagree:
the review agent's `verdict`/`score`/blocker count, and the brief's derived
`merge_risk` (AC-78). This block states how they share one strip, and how the
reasons behind either of them reach the reader without reproducing a findings
tab inside a hover card.

- **AC-83 (US-2)**: The verdict strip shall render the brief's merge-risk band
  whether or not the pull request has a completed review, and shall never render
  the band and the verdict label as alternatives to one another.
  *Observed by*: the band's word present in the strip in both the reviewed and
  the unreviewed rendering of one pull request. The band is the brief's whole
  judgement in one word; a screen that drops it has thrown away the thing the
  reader paid a model to produce.

- **AC-84 (US-2)**: The system shall define a pull request's **blocking reasons**
  as the union of its blocker findings and its high-severity brief risks, where a
  *blocker finding* is a finding of the latest completed review that carries no
  `dismissed_at` and whose severity rank is at or above the gate policy recorded
  on the run that produced it.
  *Observed by*: the composed list against `reviews.findings` filtered by
  `dismissed_at` and by the run's gate, and `risks` filtered to
  `severity === 'high'`. The two sources are unioned rather than shown separately
  because the reader's question is one question — *is there a reason not to merge
  this* — and it does not become two questions because two models answered it.

- **AC-85 (US-2)**: The strip's blocker count and the blocking-reasons list shall
  be computed from the same live set, so that the number on the badge always
  equals the number of finding rows behind it.
  *Observed by*: the badge's count and the finding-row count of the opened
  blocking-reasons surface, equal, on a pull request where a blocker finding has
  since been dismissed. `agent_runs.blockers` is frozen at completion
  (`server/src/modules/reviews/run-executor.ts:299`) and remains the CI and
  timeline signal, which is why it is not edited; it stops being the *strip's*
  source because a dismissal makes the frozen number disagree with what the
  reader can count on screen.

- **AC-86 (US-2)**: WHERE the pull request has at least one blocking reason, the
  strip shall render an information control — adjacent to the finding-count badge
  where that badge renders, and otherwise within the strip on its own row;
  otherwise it shall not render that control.
  *Observed by*: the presence or absence of the control within the strip, against
  the length of AC-84's list, in both the reviewed and the unreviewed rendering of
  one pull request. The design frame draws this control as an `ⓘ` immediately
  after the counts badge — it is the one element of the strip the first
  implementation omitted entirely.
  **Why the criterion names two placements.** The frame only ever draws the
  reviewed rendering, where the counts badge exists to sit beside. The gate is the
  blocking-reason count alone (AC-84), not the presence of a review, so
  `## Edge cases` requires this control on a pull request that has high-severity
  risks and **no review at all** — a state with no badge on screen. Wording the
  criterion as *adjacent to the badge* and nothing else made the two halves of
  this spec contradict each other and would have made the required rendering
  unsatisfiable; the implementation follows the edge-case table
  (`BriefVerdictStrip.tsx`, `s.titleRow` under a review and `s.infoRow` without
  one, pinned by `BriefVerdictStrip.test.tsx:102,116,235,244`). This corrects the
  prose only. Nothing that was built changes.

- **AC-87 (US-2)**: WHEN a user hovers or focuses the information control, the
  client shall display the blocking reasons as one list, blocker findings first
  ordered by severity descending, then high-severity risks in stored order.
  *Observed by*: the rendered row sequence against AC-84's composed list.

- **AC-88 (US-2)**: Each blocking-reason row shall display a severity indicator,
  the finding's or the risk's title, and exactly one `file:line` reference, and
  shall display no rationale, explanation or summary text.
  *Observed by*: the row's rendered text, which shall contain no substring of the
  corresponding `findings.rationale` or `risks[].explanation`. Review-agent prose
  routinely runs to paragraphs — the strip summary in the seeded PR is itself
  four lines — and a hover card that reproduces it is a worse findings tab, not a
  reason to open the real one.

- **AC-89 (US-2)**: WHERE `repoFullName` and `headSha` are both known, a
  blocking-reason row's reference shall link to that file at that commit on
  GitHub; otherwise it shall render as plain monospace text.
  *Observed by*: the anchor `href`, built by `src/lib/github-urls.ts`, or the
  absence of an anchor. Same degradation rule as AC-20 and the blast card.

- **AC-90 (US-2)**: The blocking-reasons surface shall carry `role="tooltip"`,
  shall open on pointer hover and on keyboard focus, shall close on `Escape`, and
  shall render through a portal.
  *Observed by*: the role attribute, a focus-driven open, an `Escape`-driven
  close, and the node's parent being outside the strip's subtree.
  `FindingsHoverCard` (`client/src/app/repos/[repoId]/pulls/_components/FindingsHoverCard/`)
  already implements this contract, including open and close delays and
  scroll-dismiss; it is the component to reuse or to copy, not to re-derive.

- **AC-91 (US-2)**: The blocking-reasons list shall display at most 8 rows, and
  WHERE more blocking reasons exist it shall state how many are not shown.
  *Observed by*: the rendered row count and the overflow line for a pull request
  with more than 8 blocking reasons. A hover card that grows past the viewport
  cannot be read at all; a silent truncation would report *8 reasons* for a
  change that has 20 — the same no-silent-caps rule the input caps follow.

- **AC-92 (US-2)**: IF the latest completed review's verdict is `approve` or its
  live blocker count is zero, WHILE the brief's `merge_risk` is `high`, THEN the
  strip shall state that the review and the brief disagree.
  *Observed by*: the rendered disagreement line on a pull request whose review
  approved and whose stored `merge_risk` is `high`. This is precisely the state
  that produced the defect report — an approving review holding a 100 score over
  a brief that had asked for the merge to be held — and it is the one state where
  showing both judgements side by side is not yet enough, because a reader who
  reads left to right stops at the word *Approve*.

- **AC-93 (US-2)**: IF the run carrying the latest completed review records no
  gate policy, THEN the system shall treat that run's gate as `critical`.
  *Observed by*: the blocker set for a run whose recorded gate is null, equal to
  its non-dismissed `CRITICAL` findings. `critical` is the column default at
  `server/src/db/schema/agents.ts:25` and the contract default at
  `contracts/knowledge.ts:341`, so it is the value every run that predates the
  new column was overwhelmingly likely to have used. Reading the *agent's current*
  `ci_fail_on` instead would be wrong for the same reason `score` and `blockers`
  are denormalized onto the run at completion: the agent's gate can be edited
  after the run, and a historical run must keep being described by the policy it
  actually ran under.

### Design fidelity (US-1)

The frames arrived on 2026-08-24, after the work shipped. These criteria record
where the shipped screen and the frame disagree; each one is the frame's reading.
They carry no behaviour and change no contract.

- **AC-94 (US-1)**: The brief section shall carry a section label naming the
  brief, above the verdict strip.
  *Observed by*: the rendered label. The frame heads the section `PR BRIEF` with
  a document icon; `BriefPanel` renders no top-level `SectionLabel` at all, so the
  strip currently opens the tab with no heading and the regenerate button alone
  on that row.

- **AC-95 (US-1)**: The brief's regeneration control shall render inside the
  verdict strip.
  *Observed by*: the control's position within the strip's bounding box. This
  amends AC-81 on **placement only** — AC-81's requirement that the control carry
  a visible text label naming the brief is unchanged and still binding, because
  two differently-priced paid actions on one tab must not be told apart by
  position. The frame draws an icon-only control; the visible label wins over the
  frame here, and it is the one place in this amendment where that happens.

- **AC-96 (US-1)**: The cost and token line shall render inside the verdict strip:
  WHERE the strip renders the PR-score donut, beneath the donut; otherwise as the
  last element of the strip's main column, beneath the brief summary.
  *Observed by*: the cost line's position within the strip, in each of the strip's
  two layouts. This amends AC-51 on **placement only** — what it reports, the
  brief's own generation cost, is unchanged. AC-51 was one of the three criteria
  the original spec recorded as decided without a frame, and the
  design-provenance note pre-authorised exactly this correction.

  **Why the criterion has a second branch.** The frame shows only the reviewed
  rendering — `Request changes`, score 61, the cost line under the donut — so it
  is silent on the unreviewed one, and this branch is decided on its merits the
  same way AC-19 was. AC-7 omits the donut when the PR has no completed review,
  which leaves the first clause naming an anchor that is not on screen. The donut
  is not merely hidden there: it *is* the strip's trailing column, so the column
  goes with it. `BriefVerdictStrip/styles.ts` declares only `iconBox` and a
  `main` at `flex: 1` on its non-review branch, and the reviewed layout's
  `scoreCol` lives in `VerdictBanner/styles.ts`. The cost line therefore has no
  trailing column to sit under, and inventing one so that a single anchor can be
  stated would put an otherwise-empty column on screen for the sake of the
  wording. Falling back to the panel footer was also rejected: AC-96's binding
  element is that the cost line is *inside the strip*, and a datum that leaves
  the strip whenever the PR is unreviewed is the two-locations problem this
  criterion exists to end.

- **AC-97 (US-1)**: The intent card and the blast-radius card shall be rendered at
  equal width.
  *Observed by*: the two columns' computed widths. The frame gives each 697 px of
  a 1400 px content area; `BriefPanel/styles.ts` declares
  `gridTemplateColumns: minmax(0, 1.45fr) minmax(0, 1fr)`.

- **AC-98 (US-1)**: A risk row shall render its title and its file reference on
  separate lines within a bordered row.
  *Observed by*: the rendered row's box and line breaks. The shipped row places
  both on one line with the reference right-aligned at `maxWidth: 45%`
  (`RiskList/styles.ts`), which truncates a path like
  `src/middleware/ratelimit.ts:12-18` on a narrow column — the frame gives the
  path its own full-width line for that reason.

### Review focus (US-3)

- **AC-22 (US-3)**: The system shall produce the review-focus rows from the same
  provider call that produces the risks, and shall make no separate call for
  them.
  *Observed by*: exactly one provider call recorded for one generation.

- **AC-23 (US-3)**: Each review-focus row shall carry a file path, a line or line
  range, and a reason of at most 140 characters.
  *Observed by*: each element of `review_focus` in the response body.

- **AC-24 (US-3)**: IF a review-focus row's line range does not intersect a hunk
  of this PR's diff, THEN the system shall drop the row before persisting and
  shall log a `warn` naming the dropped count.
  *Observed by*: the `warn` count field, and the row's absence from the stored
  document. This is the same grounding rule the review pipeline already applies
  to findings.

- **AC-25 (US-3)**: The system shall persist at most 5 review-focus rows.
  *Observed by*: `review_focus.length` in the stored document.

- **AC-26 (US-3)**: The system shall order review-focus rows by the severity of
  the finding whose lines they intersect — `CRITICAL`, then `WARNING`, then
  `SUGGESTION`, then rows intersecting no finding — breaking ties by file path
  ascending and then start line ascending.
  *Observed by*: the stored `review_focus` order, reproduced from the same inputs
  on a second generation.

- **AC-27 (US-3)**: The review-focus card shall display the number of rows it
  contains.
  *Observed by*: the rendered count badge against `review_focus.length`.

- **AC-28 (US-3)**: WHERE the stored brief contains zero review-focus rows, the
  client shall render the card with an empty state rather than omitting it.
  *Observed by*: the rendered empty-state element with the card heading present.

### Blast radius and degradation (US-4)

- **AC-29 (US-4)**: The system shall include the pull request's blast-radius
  result in the generation input.
  *Observed by*: the persisted generation record's input-summary counts
  (symbols, callers, endpoints, crons) matching `GET /pulls/:id/blast-radius`.

- **AC-30 (US-4)**: WHERE the blast-radius result carries `degraded: true`, the
  system shall generate the brief anyway and shall store that result's `reason`
  as the brief's `degraded_reason`.
  *Observed by*: `degraded_reason` in the stored brief, equal to the blast
  response's `reason`.

- **AC-31 (US-4)**: WHILE a stored brief carries a non-empty `degraded_reason`,
  the client shall display a partial badge naming that reason.
  *Observed by*: the rendered badge text against `degraded_reason`.

- **AC-32 (US-4)**: WHERE the blast-radius result is degraded, the system shall
  restrict every accepted `file_refs` path to the pull request's changed files.
  *Observed by*: every `risks[].file_refs` path present in `pr_files.path` for a
  brief whose `degraded_reason` is non-empty. On the degraded path the engine
  cannot attribute endpoints or crons to a symbol
  (`server/specs/2026-08-16-blast-radius.md`), so a blast-sourced path there
  would be a reachability claim nothing computed.

- **AC-33 (US-4)**: WHERE the blast-radius result carries `truncated: true`, the
  brief shall carry a truncation flag and the client shall display it.
  *Observed by*: the flag in the response body and the rendered notice.
  `repo-intel` truncates its caller array globally rather than per symbol
  (`server/specs/2026-08-16-blast-radius.md`, Known limits #1), so a brief built
  on a truncated result can legitimately understate reach.

### Caching, staleness and the generation lifecycle (US-5)

- **AC-34 (US-5)**: The system shall store at most one brief per pull request.
  *Observed by*: the `pr_brief` primary key on `pr_id`.

- **AC-35 (US-5)**: The system shall record on the stored brief the head commit
  sha it was generated from.
  *Observed by*: the stored `head_sha`, equal to `pull_requests.head_sha` at
  generation time.

- **AC-36 (US-5)**: WHEN a brief is requested and a stored brief exists, the
  system shall return it without calling any LLM provider.
  *Observed by*: zero provider calls recorded for that request.

- **AC-37 (US-5)**: WHERE the stored brief's `head_sha` differs from the pull
  request's current `head_sha`, the response shall carry `stale: true`.
  *Observed by*: the `stale` field of the `GET` response after the PR's head
  moves. Derived per request and not stored, matching
  `server/specs/2026-08-09-intent-layer.md`.

- **AC-38 (US-5)**: WHILE a brief is stale, the client shall display a Stale
  badge and shall keep rendering the stored content.
  *Observed by*: the Stale badge together with the previous summary text still
  on screen.

- **AC-80 (US-5)**: WHEN a stored brief is rendered, the client shall display
  the time it was generated and the short form of the `head_sha` it was
  generated from, whether or not the brief is stale.
  *Observed by*: the rendered footer line against the generation row's
  finished-at timestamp and the stored `head_sha`. `stale: true` tells a reader
  the brief is old; it does not tell them how old or which commit it describes,
  which is what they need before paying for a regeneration.

- **AC-39 (US-5)**: The system shall not start a generation in response to a new
  commit, a re-index, a review run, a page view or a schedule.
  *Observed by*: zero rows added to the generation state table across an import,
  a re-index and ten page views of the Overview tab.

- **AC-40 (US-5)**: WHEN a user activates Generate or Regenerate, the client
  shall present a confirmation stating that generation calls a paid model, and
  shall issue no request until it is confirmed.
  *Observed by*: zero network requests recorded while the confirmation is open.

- **AC-81 (US-5)**: The brief's regeneration control shall render a visible text
  label naming the brief, distinct from the label `IntentCard` renders for its
  own recompute control.
  *Observed by*: the two controls' accessible names on one rendered Overview tab,
  which must differ. `IntentCard` already renders its word from
  `brief.intent.recompute` (`IntentCard.tsx:97`), so only the brief's control
  needs a new key — but two differently-priced paid actions must never be
  distinguished by position alone. Placement is fixed by AC-95; the visible label
  this criterion requires survives that move.

- **AC-82 (US-5)**: WHERE a previous generation for the pull request succeeded
  with a known cost, the confirmation required by AC-40 shall name that cost;
  otherwise it shall name no currency figure.
  *Observed by*: the confirmation's rendered text against the most recent
  successful generation's `cost_usd`, and the absence of any currency figure on a
  pull request that has never generated one. The number is already stored by
  AC-49, so "this calls a paid model" can be "this cost $0.014 last time".

- **AC-41 (US-5)**: WHEN a confirmed generation is requested, the server shall
  persist a generation row with status `running` before responding, and shall
  respond 202.
  *Observed by*: the 202 status, and a `running` row already readable by the
  immediately following poll — the write ordering `server/INSIGHTS.md` requires
  so that a 202 caller never polls a stale state.

- **AC-42 (US-5)**: IF a generation is requested for a pull request that already
  has a `running` generation, THEN the server shall respond 409 and shall make no
  provider call.
  *Observed by*: the 409 status, and zero provider calls recorded for that
  request.

- **AC-43 (US-5)**: WHILE a generation is `running`, the client shall poll the
  brief at 1500 ms and shall stop polling when the status leaves `running`.
  *Observed by*: the request interval in the network log, and the absence of a
  further request after the first non-`running` response.

- **AC-44 (US-5)**: WHILE a generation is `running`, the client shall disable the
  Generate and Regenerate controls.
  *Observed by*: the `disabled` attribute on both controls.

- **AC-45 (US-5)**: WHILE a generation is `running`, the client shall keep
  rendering the previously stored brief if one exists.
  *Observed by*: the previous summary text still on screen during the run.

- **AC-46 (US-5)**: WHEN a generation completes successfully, the system shall
  replace the stored brief and set the generation status to `done`.
  *Observed by*: the stored document's `head_sha` and `summary` after the run,
  and the status column.

- **AC-47 (US-5)**: IF a generation ends in failure, THEN the stored brief shall
  be unchanged and the generation status shall be `failed` with a message.
  *Observed by*: the stored document byte-identical to its pre-run value, and
  the `failed` status row carrying a non-null error.

- **AC-48 (US-5)**: IF a generation row has status `running` and started more
  than 10 minutes ago, THEN the system shall treat it as failed and shall permit
  a new generation to start.
  *Observed by*: a 202 rather than a 409 on a request made against a stuck row.

- **AC-49 (US-5)**: The system shall record the provider, model, prompt tokens,
  completion tokens and computed cost of every brief generation.
  *Observed by*: those five columns on the generation row after any completed or
  failed attempt.

- **AC-50 (US-5)**: The system shall not add brief generation cost to
  `agent_runs.cost_usd`.
  *Observed by*: the sum of `agent_runs.cost_usd` for that PR, unchanged across
  a generation. Same separation the intent layer chose, so review-run cost stays
  a clean measure of review-run cost.

- **AC-51 (US-5)**: WHEN a brief is rendered, the client shall display the cost
  and the prompt and completion token counts of the generation that produced it.
  *Observed by*: the rendered cost line against the stored generation's
  `cost_usd`, `tokens_in` and `tokens_out`. Placement is fixed by AC-96.

- **AC-52 (US-5)**: IF a generation fails after the provider billed tokens, THEN
  the failure notice shall name that attempt's cost and the displayed brief shall
  keep showing the last successful generation's cost.
  *Observed by*: the two distinct currency figures on screen after a failed
  regeneration.

- **AC-53 (US-5)**: IF the cost of a generation cannot be computed because the
  model is absent from the price book, THEN the client shall display the token
  counts and no currency figure.
  *Observed by*: the absence of a `$` figure with token counts still rendered.
  `server/INSIGHTS.md` records the same rule for run cost.

- **AC-54 (US-5)**: IF more than 5 generation requests are made for one workspace
  within one minute, THEN the server shall respond 429 to the excess and shall
  make no provider call for them.
  *Observed by*: the 429 status, and zero provider calls recorded for those
  requests. Matches the limit already on `POST /pulls/:id/intent`.

### Cross-model note (US-6)

- **AC-55 (US-6)**: The brief response shall carry the identifier of the model
  that generated it and the distinct identifiers of the models that produced the
  pull request's stored reviews.
  *Observed by*: the `model` field and the `review_models` array in the response
  body, against `reviews.model` for that PR.

- **AC-56 (US-6)**: The client shall render a cross-model note naming those model
  identifiers and stating that the brief and the findings come from those models
  and that a different model may reach a different conclusion.
  *Observed by*: the rendered note containing both the brief model id and each
  review model id.

- **AC-57 (US-6)**: WHERE the pull request has no stored review, the cross-model
  note shall name only the brief's model.
  *Observed by*: the rendered note text for a PR with zero `reviews` rows.

- **AC-58 (US-6)**: The system shall not make a provider call to produce the
  cross-model note.
  *Observed by*: exactly one provider call recorded per generation, the same one
  that produced the risks and the review focus.

- **AC-59 (US-6)**: The cross-model note shall be composed from the `brief` i18n
  namespace and shall contain no model-generated text.
  *Observed by*: the note's string interpolated from `client/messages/en/brief.json`
  with the model identifiers as parameters.

### Per-file summaries in the Files-changed tab (US-7)

- **AC-60 (US-7)**: WHEN a generation completes successfully, the system shall
  store a summary of at most 200 characters for each changed file classified
  `core` or `wiring`.
  *Observed by*: one stored summary per file in those two smart-diff groups, and
  each summary's length.

- **AC-61 (US-7)**: The system shall not store a summary for a file classified
  `boilerplate`.
  *Observed by*: the absence of a stored summary for `package-lock.json` in the
  seeded PR, whose classification is `boilerplate`.

- **AC-62 (US-7)**: WHERE a stored summary exists for a file and the stored
  brief is not stale, `GET /pulls/:id/smart-diff` shall carry it as that file's
  `pseudocode_summary`.
  *Observed by*: the `pseudocode_summary` field on that file in the smart-diff
  response.

- **AC-63 (US-7)**: WHERE no stored summary applies to a file, the smart-diff
  response shall omit `pseudocode_summary` for that file rather than setting it
  to null.
  *Observed by*: the absence of the key on that file object.
  `server/specs/2026-08-10-smart-diff.md` states the reason: omitted means *not
  computed*, null would mean *computed as empty*.

- **AC-64 (US-7)**: WHERE the stored brief's `head_sha` differs from the pull
  request's current `head_sha`, the smart-diff response shall omit
  `pseudocode_summary` for every file.
  *Observed by*: zero `pseudocode_summary` keys in the response for a PR whose
  head has moved since generation.

- **AC-65 (US-7)**: WHERE a file carries a `pseudocode_summary`, the expanded
  file card in the Files-changed tab shall render it beneath a "What this does"
  label.
  *Observed by*: the rendered label and text inside that file's expanded card.

- **AC-66 (US-7)**: Filling `pseudocode_summary` shall not change the smart-diff
  ordering, the group assignment of any file, or any severity badge.
  *Observed by*: the smart-diff response's `groups[].role` and `files[].path`
  sequences, identical before and after a generation.

### States, errors and reachability (US-8)

- **AC-67 (US-8)**: WHEN the brief request for a resolvable pull request has no
  stored brief, the server shall respond 200 with a null brief and the current
  generation state.
  *Observed by*: the 200 status with a null brief field and a non-null generation
  state. A 404 cannot carry `running`, and the client must distinguish
  never-generated from generating from failed — which is why this diverges from
  `GET /pulls/:id/intent`, where 404 is the empty state.

- **AC-68 (US-8)**: IF the pull request id does not resolve within the caller's
  workspace, THEN the server shall respond 404.
  *Observed by*: the 404 status for a PR belonging to another workspace.

- **AC-69 (US-8)**: IF the pull request id is not a uuid, THEN the server shall
  respond 422.
  *Observed by*: the 422 status.

- **AC-70 (US-8)**: WHILE the brief request is in flight, the client shall render
  a skeleton in the brief section.
  *Observed by*: the skeleton element present with no card content.

- **AC-71 (US-8)**: WHERE no brief has ever been generated for the pull request,
  the client shall render an empty state whose text names generation as a
  deliberate paid action and names no other trigger, carrying a Generate control.
  *Observed by*: the rendered empty-state strings and an enabled Generate
  control. `brief.unavailable` and `brief.unavailableHint` both exist in
  `client/messages/en/brief.json`, and the rewording this criterion depended on
  has already been made: `unavailableHint` read *"Run a review or open the PR to
  compute it."*, naming two triggers AC-39 explicitly forbids, and now reads
  *"Generating the brief calls a paid model — press Generate when you want one."*
  (`client/messages/en/brief.json:11`) — generation named as a deliberate paid
  action, no other trigger named. The criterion is satisfied by the copy in the
  tree; see the i18n note under `## Non-functional requirements`.

- **AC-72 (US-8)**: IF the brief request fails with any status other than 404,
  THEN the client shall render an error state with a retry control and shall not
  retry automatically.
  *Observed by*: exactly one request in the network log, and the rendered error
  state.

- **AC-73 (US-8)**: IF the most recent generation ended `failed`, THEN the client
  shall display a failure notice carrying the recorded error message alongside
  whatever brief is stored.
  *Observed by*: the rendered notice text against the generation row's error
  column.

- **AC-74 (US-8)**: The client shall not add any query parameter to the pull
  request URL for brief view state.
  *Observed by*: the URL after expanding a risk row and toggling every disclosure
  in the brief, unchanged. Which of two renderings of one card you last looked at
  is not shareable state — the rule
  `client/specs/2026-08-16-blast-radius.md` set against `?diffOrder=`.

- **AC-75 (US-8)**: Every collapsible row in the brief shall carry
  `role="button"`, `tabIndex`, `aria-expanded`, and shall respond to `Enter` and
  `Space`.
  *Observed by*: those attributes on each disclosure row and a keyboard-driven
  expansion.

- **AC-76 (US-8)**: WHERE a risk row has nothing to expand — an empty
  `explanation` together with exactly one `file_refs` entry, which AC-18 already
  shows while collapsed — it shall carry no `role="button"`, no `tabIndex`, no
  `aria-expanded` and no chevron.
  *Observed by*: the absence of those four attributes on such a row. Because the
  expansion is the explanation plus all refs (AC-19), a risk carrying any
  explanation text always has something to expand. A focusable
  element that does nothing is a keyboard trap and an `aria-expanded` that never
  changes is a lie to a screen reader — the rule
  `client/specs/2026-08-16-blast-radius.md` set for zero-caller symbols.

- **AC-77 (US-8)**: Every user-facing string the brief adds shall come from the
  `brief` i18n namespace.
  *Observed by*: no string literal rendered by a brief component that is absent
  from `client/messages/en/brief.json`.

## Edge cases

| Situation | Outcome |
|---|---|
| Brief never generated | 200 with a null brief and a Generate control — AC-67, AC-71 |
| Brief request in flight, nothing cached | Skeleton, not an empty card — AC-70 |
| Generation running, nothing cached yet | Running state, polled at 1500 ms, both controls disabled — AC-43, AC-44 |
| Generation running, a brief already cached | Previous brief stays on screen throughout — AC-45 |
| Two browser tabs both press Regenerate | The second gets 409; both converge because both poll the same single state row — AC-42, AC-43 |
| User dismisses the confirmation | Nothing starts, nothing is spent — AC-40 |
| No generation has ever succeeded with a known cost | The confirmation names no currency figure — AC-82 |
| Generation fails | Stored brief untouched, failure notice with the error and that attempt's cost — AC-47, AC-52 |
| Generation fails before any token was billed | Failure notice with no currency figure — AC-52, AC-53 |
| Generation process dies mid-run | The row is treated as failed after 10 minutes and a new run may start — AC-48 |
| Model absent from the price book | Token counts render, no `$` figure — AC-53 |
| PR gets new commits while a brief exists | Stale badge, content kept, nothing spent, no auto-regeneration — AC-37, AC-38, AC-39 |
| A review completes after the brief was generated | No Stale badge and no regeneration; the review-focus ordering keeps its no-findings tier and the cross-model note keeps naming one model. Accepted — see `## Non-functional requirements` |
| Stale brief and the Files-changed tab | `pseudocode_summary` disappears entirely rather than describing an older diff — AC-64 |
| No agent run has ever happened | Brief still generates; the strip shows the brief summary and the risk band, no verdict and no donut — AC-5, AC-7 |
| The cost line on a strip with no donut | It stays inside the strip, as the last element of the main column beneath the summary — AC-96. The frame never drew this rendering; decided on its merits, see the design-provenance note under `## Inputs and provenance` |
| A review approves while the brief derived `high` | Both are on the strip, and the strip says in words that they disagree — AC-6, AC-83, AC-92 |
| A review requests changes while the brief derived `low` | Both are on the strip; no disagreement line, because the review being stricter than the brief is not the failure mode AC-92 guards — the reader is already being told to stop |
| Blockers exist but no high-severity risk | The `ⓘ` renders and lists the blocker findings only — AC-84, AC-86 |
| High-severity risks exist but the PR has no review at all | The `ⓘ` renders and lists the risks only, on its own row inside the strip because there is no counts badge to sit beside — AC-84, AC-86 |
| A risk row's severity indicator inside the blocking-reasons card | It renders the findings' `CRITICAL` badge, not the brief's `high`. Known, accepted, not fixed — see `## Non-functional requirements`, the accepted consequence on the severity vocabulary. No criterion rules on it |
| A keyboard user opens the `ⓘ` and tabs onward | The card closes on blur before its file references can be reached, and the trigger has no `aria-describedby`. AC-90's stated observations still hold. Known, accepted, not fixed — see `## Non-functional requirements`, the accepted consequence on AC-90 |
| Nothing blocks: no blocker finding, no high risk | No `ⓘ` at all — an information control that opens an empty card is noise — AC-86 |
| Every blocker finding has since been dismissed | The badge reads 0 and the `ⓘ` disappears with it, while `agent_runs.blockers` keeps its frozen value for CI and the timeline — AC-85 |
| 20 blocking reasons | 8 rows and a line stating the other 12 are not shown — AC-91 |
| The run predates the gate-policy column | Its gate is read as `critical` — AC-93 |
| A blocking-reason row's finding was later edited to a lower severity | The live set is recomputed on render, so the row leaves the list without a regeneration — AC-84, AC-85 |
| No `pr_intent` record | Intent card shows its own empty state; the rest of the brief renders — AC-4 |
| Repository not indexed (blast degraded) | Brief generates, partial badge names the reason, `file_refs` restricted to changed files — AC-30, AC-31, AC-32 |
| Blast callers truncated by the engine cap | Truncation flag rendered; the brief may understate reach and says so — AC-33 |
| Model names a file that is not in the diff or the blast set | The ref is dropped and logged; a risk left with none is dropped — AC-14, AC-15 |
| Model names a line range outside every diff hunk | The review-focus row is dropped and logged — AC-24 |
| Model returns zero risks | Risks section renders its no-risks empty state and the band is `low` — AC-21, AC-78 |
| Model returns zero review-focus rows | Card renders with an empty state, not omitted — AC-28 |
| Model returns one risk | Rendered as a single row, no special casing |
| Grounding drops the only high-severity risk | The band is recomputed from what survived and can fall from `high` to `medium` — AC-78 |
| The model names a band of its own | Discarded unread; the stored band is the derived one — AC-79 |
| Model returns 40 risks | 12 stored, highest severity first — AC-16 |
| A risk carries 30 file refs | 5 stored — AC-17 |
| A risk has an explanation and exactly one file ref | Still expandable — the explanation is the expansion — AC-19 |
| A risk has an empty explanation and exactly one file ref | Nothing to expand: no chevron, not focusable — AC-76 |
| PR with 400 changed files | Generation input is capped and boilerplate files are dropped first — see `## Non-functional requirements` |
| A single file's patch is enormous | That patch is truncated in the input at 20 KB, and the truncation is logged |
| Repo full name or head sha not yet loaded | File refs render as plain monospace text rather than broken links — AC-20 |
| Diff contains a live secret (the seeded PR does) | The prompt is never logged verbatim; only counts and identifiers reach the logs — see `## Non-functional requirements` |
| PR belongs to another workspace | 404 — AC-68 |
| `:id` is not a uuid | 422 — AC-69 |
| Sixth generation request inside a minute | 429, nothing spent — AC-54 |
| Expanded risk row content | Explanation plus all file refs — AC-19. The design never drew this state; decided on its merits, see the design-provenance note under `## Inputs and provenance` |

## Non-functional requirements

**Contract impact — additive, MINOR, non-breaking.** Nothing is renamed, removed,
narrowed or made newly required.

- `Risk`, `Risks` and `PrBrief` (`server/src/vendor/shared/contracts/brief.ts:12-24,152-158`)
  are reused as they stand. A cross-package `rg` over `server/src client/src
  reviewer-core/src e2e mcp/src` finds exactly one reference to any of the three:
  `client/src/lib/types.ts:43` re-exports `PrBrief` as a **type** —
  `export type { PrBrief, SmartDiff } from "@devdigest/shared"`. Nothing anywhere
  reads a field of it. A type-only re-export widens with the type it re-exports,
  so extending `PrBrief` with `merge_risk`, `review_focus`, `summary`,
  `degraded_reason`, `truncated`, `head_sha`, `model`, `review_models` and the
  cost fields breaks no consumer and needs no edit at that line — but a reviewer
  who greps will find that re-export, and it is accounted for here rather than
  contradicting a "zero readers" claim. The extension must still be run through
  `semver-discipline` and the `breaking-change` detection commands before merge:
  a clean grep is necessary, not sufficient.
- `SmartDiffFile.pseudocode_summary` already exists as `.nullish()`
  (`contracts/brief.ts:122`) and is reserved for exactly this. Filling it needs
  **no contract edit**.
- `Review`, `ReviewRecord`, `Finding`, `FindingRecord`, `Intent`,
  `PrIntentRecord`, `BlastRadiusResponse` and `SmartDiff` are **unchanged**.
- **`RunSummary` gains one optional field**, `ci_fail_on`, carrying the gate
  policy the run actually executed under (`contracts/trace.ts`). It is nullable
  and defaulted, no consumer is required to read it, and AC-93 states what a null
  means, so the change is additive and MINOR. It is needed because AC-84's
  blocker set cannot be derived without it: `ci_fail_on` lives on the `agents`
  table (`server/src/db/schema/agents.ts:25`), is not denormalized onto
  `agent_runs`, and is not on `RunSummary` — so today the client knows *how many*
  findings blocked and cannot know *which*. Reading it live off the agent is
  rejected by AC-93's reasoning. Run the change through `semver-discipline` and
  the `breaking-change` detection commands before merge, and mirror
  `server/src/vendor/shared/` into `client/src/vendor/shared/` in the same commit.
- The canonical contracts in `server/src/vendor/shared/` must be mirrored
  byte-identically into `client/src/vendor/shared/` **in the same commit**;
  `pr-self-review`'s `check_contract_mirror` proves the copies agree and proves
  nothing about compatibility.
- **Who breaks if this is done wrong**: a browser holding the previous bundle,
  and `mcp/`, whose `tsconfig.json` maps `@devdigest/shared` straight at the
  server file so a drift there is a `tsc` failure in `mcp/` rather than a silent
  divergence.

**Database — one further expand migration for the amendment.** `agent_runs`
gains a nullable `ci_fail_on` column, written at run completion beside the
`score` and `blockers` it already denormalizes there
(`server/src/modules/reviews/run-executor.ts:299`). Nullable with no backfill:
existing rows keep a null and AC-93 reads that as `critical`. Forward-only,
generated by `pnpm db:generate`, never hand-edited.

**Database — one expand migration, no contract step.** `pr_brief` today is
`{ pr_id uuid PK, json jsonb NOT NULL }` (`server/src/db/schema/reviews.ts:101-106`)
with zero writers. Every column this feature needs — head sha, model, provider,
token counts, cost, generated-at — is nullable or defaulted, so `pnpm db:generate`
produces a single non-interactive `ADD COLUMN` migration. The generation state is
a new table modelled on the onboarding generation-state row
(`server/src/db/schema/knowledge.ts:85-103`): status `running|done|failed`,
provider, model, tokens, cost, degraded reason, error, started-at, finished-at.
Generated SQL is never hand-edited, and migrations are forward-only.

**Performance and limits.**

- A cached read shall complete within 300 ms at p95, measured server-side, and
  shall make zero provider calls (AC-36).
- A generation shall be abandoned after 120 seconds and shall not be retried
  automatically. `INTENT_MAX_RETRIES` is held at 1 in the intent layer precisely
  because `completeStructured` multiplies the timeout by `maxRetries + 1`; here
  the run is backgrounded, so the budget is spent once.
- Generation input caps: at most 200 KB of patch text in total and 20 KB per
  file, with `boilerplate`-classified files dropped first, then `wiring`, then
  the lowest-ranked `core` files. Every cap that actually truncates something
  logs a `warn` naming the count — the rule `server/specs/2026-08-16-blast-radius.md`
  and `smart-diff/service.ts` already follow.
- Output caps: 12 risks, 5 file refs per risk, 5 review-focus rows, 400-character
  summary, 80-character risk title, 600-character explanation, 140-character
  review-focus reason, 200-character file summary.
- Client polling is 1500 ms while `running` and stops the moment status leaves
  it (AC-43). The cached read uses `retry: false` and a `staleTime` of 60 000 ms,
  matching `hooks/blast.ts`.
- `POST` is rate-limited to 5 requests per minute per workspace, matching
  `POST /pulls/:id/intent`. The `security` skill's suggested 3/min for AI
  generation was considered and rejected in favour of consistency with the
  existing route; if the limit is later tightened, both routes move together.

**Accessibility.** Disclosures are hand-rolled — there is no `Collapsible`
primitive in `@devdigest/ui` — with `role="button"`, `tabIndex`, `aria-expanded`
and `Enter`/`Space` handling (AC-75), and rows with nothing to expand carry none
of those (AC-76). Colour is never the only carrier of the merge-risk band: the
band's word is rendered as text. The blocking-reasons surface is a hover card and
therefore must also be reachable without a pointer: AC-90 requires it to open on
focus and close on `Escape`, which is what `FindingsHoverCard` already does with
`onFocusCapture`/`onBlurCapture` and a `keydown` listener. Its severity indicator
is never colour alone — the existing `SeverityBadge` primitive carries the word.

**Accepted consequence — AC-90 is satisfied literally and not in spirit.** As
shipped, the blocking-reasons card is *reachable* by hover and by focus and it
closes on `Escape`, which is every observation AC-90 names and every one the
tests make (`BlockingReasonsCard.test.tsx:55,65,72,79`). Its **contents are not
keyboard-navigable**: the portalled card carries `role="tooltip"` but no `id`,
the `IconBtn` trigger carries no `aria-describedby` and has no prop that could
set one (`client/src/vendor/ui/primitives/IconBtn.tsx`), so a screen reader is
never told the tooltip describes the control; and the anchor's `onBlurCapture`
closes the card, so a keyboard user tabbing onward destroys it before any of its
`MonoLink` references can be reached. A sighted mouse user gets working links; a
keyboard user gets a card they can open, read and never enter. This was known at
close-out and accepted rather than fixed, because closing it properly means
either giving the tooltip an id and the trigger a described-by — a change to a
vendored `@devdigest/ui` primitive — or promoting the surface from a tooltip to a
focus-trapping popover, which is a different component contract from the
`FindingsHoverCard` precedent AC-90 points at. Revisit by amending AC-90 to name
the tab order and the described-by relation as observations, rather than by
patching the component against a criterion that does not ask for them.

**Observability.** A generation logs `info` at start and at end with the pull
request id, provider, model, token counts, cost, the counts of dropped file refs
and dropped focus rows, and the degraded reason. **The prompt is never logged
verbatim**: the diff routinely contains secrets — the seeded demo PR contains a
literal `sk_live_` Stripe key at `server/src/db/seed.ts:394-400` — so only counts
and identifiers reach the logs.

**Determinism where it is cheap.** Ordering, capping, grounding, ref validation
and the merge-risk band are pure functions of their inputs and are unit-testable
without a provider — AC-26 requires reproducibility from the same inputs, and
AC-78 makes the band reproducible from the stored `risks` array alone. Only the
text itself comes from the model.

**Accepted consequence of sha-only staleness (AC-37).** A brief generated before
any review keeps a review-focus ordering computed with no findings — AC-26's
fourth tier — and a cross-model note naming only its own model (AC-57), and it
goes on presenting as fresh after a review completes. This is accepted rather
than overlooked, for the same reason `SPEC-02` accepted it at its AC-54: the
alternative invalidates a brief the moment the user runs the very review the
brief was meant to help them read, pushing them toward a regeneration they did
not need. Revisit if review-focus ordering turns out to move materially once
findings exist.

**Accepted consequence — a risk row in the blocking-reasons card wears the
findings' severity vocabulary.** The two sources AC-84 unions are graded on two
different scales: a finding is `CRITICAL`/`WARNING`/`SUGGESTION`
(`contracts/findings.ts`), a risk is `high`/`medium`/`low` (AC-11). AC-88 requires
each row to carry *a severity indicator* and never says which vocabulary a risk
row's indicator speaks, and no other criterion rules on it either — so the
implementation picked one: `riskReason()` in `BriefVerdictStrip/helpers.ts`
hard-codes `severity: "CRITICAL"` for every qualifying risk, because only `high`
risks reach the card at all (AC-84) and `SeverityBadge` accepts nothing else. The
visible consequence is that a pull request whose only blocking reason is a merge
risk opens a card showing the red `CRITICAL` badge — a word the brief never used
and a scale it does not share. This was known at close-out and accepted rather
than fixed, on the grounds that inventing a second badge vocabulary inside a hover
card is a design decision no frame covers and no criterion asked for, and that
rendering the risk's own word instead needs a primitive that does not exist today.
It is recorded here rather than left silent because the surface reads as clean and
is not: the two scales are conflated on that one row, which is exactly what AC-9
and the *a reviewer can tell a risk level from a quality score at a glance* goal
forbid everywhere else in this spec. Revisit by adding a criterion that states
what a risk row's indicator shows, so the ambiguity is closed by a decision rather
than by whichever badge the primitive happened to accept.

**The `brief` i18n namespace is smaller than it looks.**
`client/messages/en/brief.json` today carries `block.risks`, `block.intent`,
`block.history`, `noRisks`, `noHistory`, `overlap`, `unavailable`,
`unavailableHint` and the `intent` and `why` sub-namespaces — and nothing else.
AC-77 requires every string this feature adds to come from that namespace, so it
gains keys for the merge-risk band, the cross-model note (AC-56, AC-59), the cost
and token line (AC-51), the partial and truncation badges (AC-31, AC-33), the
review-focus card and its empty state (AC-27, AC-28), the generated-from footer
(AC-80), the brief's own regeneration label (AC-81) and the confirmation's price
line (AC-82). The amendment adds a further group: the blocking-reasons control's
accessible name, the card's heading and its reason count (AC-86, AC-87), the
overflow line (AC-91) and the disagreement sentence (AC-92). AC-77 binds all of
them. The disagreement sentence in particular is composed from the namespace with
the two judgements as parameters and contains no model-generated text — the same
rule AC-59 sets for the cross-model note, and for the same reason: a sentence
that tells the reader two models disagree must not itself be written by one of
them. Of the existing keys only `noRisks` is reusable as it stands.
**`unavailableHint` has been reworded**: it read *"Run a review or open the PR to
compute it."*, naming two triggers AC-39 explicitly forbids, so the copy stated
the opposite of the specified behaviour and AC-71 depended on the fix. It now
reads *"Generating the brief calls a paid model — press Generate when you want
one."* (`client/messages/en/brief.json:11`). The reason it had to change still
governs the key: AC-39 forbids both triggers the old sentence named, so an
empty-state hint may name generation as a deliberate paid action and nothing
else. Rewording a message string was not a contract change and needed no expand
step — it did change what an existing screen says, so it shipped alongside the
empty state rather than ahead of it.

**Layering.** The new slice may not import from `intent/`, `blast/`,
`smart-diff/` or `repo-intel/` — cross-slice imports are a dependency-cruiser
`error` and the config resolves type-only edges the same as runtime ones
(`server/specs/2026-08-16-blast-radius.md`). Shared shapes travel through
`vendor/shared` contracts, `db/rows.ts` or a structurally-declared port in the
slice's own `ports.ts`, exactly as `blast/ports.ts` re-declares the repo-intel
engine. This constraint applies in both directions, including whatever path lets
the smart-diff response read stored file summaries (AC-62).

**Client bundling.** Every import from `@devdigest/shared` in the new client code
must be `import type`. A value import drags the vendored barrel into webpack and
can break `pnpm build` while `typecheck` and `test` stay green
(`client/INSIGHTS.md:27`). Any fixed set the UI needs is declared locally in the
component's `constants.ts`, never read off a Zod enum's `.options`.

**Severity colours.** The merge-risk band's colours come from `SEV` in
`src/vendor/ui/primitives/tokens.ts`. Two hand-rolled `SEV_COLOR` copies already
exist and have already drifted; this feature adds no third.

**Testing.** The amendment's own logic — composing the blocking-reason set from
findings, dismissals, the run's gate and the brief's risks (AC-84), the ordering
of AC-87, the cap of AC-91 and the disagreement predicate of AC-92 — is pure and
is unit tested against fixtures with no provider and no network. Two shipped
tests assert the behaviour this amendment replaces and must be rewritten rather
than deleted: `BriefVerdictStrip.test.tsx` pins
`expect(screen.queryByText(/merge risk/i)).not.toBeInTheDocument()` under a
review, which AC-83 inverts, and `e2e/specs/10-pr-brief.flow.json` records in its
own `description` that it cannot assert the merge-risk band *because* a reviewed
PR hides it — a limitation AC-83 removes, so that flow gains the assertion it had
to give up. Pure ordering, capping, grounding and ref-validation logic is unit
tested; service behaviour is tested against fake ports; route behaviour including
the 202/409/429/404/422 matrix is tested against Testcontainers Postgres in a
`*.it.test.ts`. The `e2e/` flow covers the **cached read path only** — `e2e/README.md:5`
states "No Playwright, no LLM, no API key", so the Generate control cannot be
exercised there, exactly as the intent compute button is not.

## Inputs and provenance

| Input | Produced by | Can be absent | What absence means |
|---|---|---|---|
| PR title, body, branch, base | GitHub import → `pull_requests` | Body yes | The brief has less to say about *why*; generation still runs |
| Changed file paths and patches | GitHub import → `pr_files` | Only for an empty PR | With zero changed files the brief is not generated; the empty state stays |
| `head_sha` | `pull_requests.head_sha` | No | It is the cache key; without it staleness cannot be computed |
| Commit messages | `pr_commits` | Yes | Weaker intent signal only |
| Derived intent, in/out of scope, risk areas | `pr_intent`, written only by the intent layer | Yes | Intent card shows its not-derived state; the brief still generates — AC-4 |
| Blast radius, callers, endpoints, crons, `degraded`, `reason`, `truncated` | `GET /pulls/:id/blast-radius`, computed from `repo-intel` | Never absent; may be degraded | Degraded → partial badge and changed-files-only refs — AC-30, AC-32 |
| Smart-diff grouping (`core`/`wiring`/`boilerplate`) | `GET /pulls/:id/smart-diff`, deterministic, no model | No | Decides which files get a summary and which are dropped first under the input cap |
| Latest verdict, summary, score | `reviews` | Yes | The strip degrades to the brief's own summary and the risk band — AC-7 |
| Blocker count on the strip | Derived live on render from the review's non-dismissed findings and the run's recorded gate | Yes | Omitted from the strip along with the finding count — AC-7 |
| Blocker count on the run row and the timeline | `agent_runs.blockers`, frozen at completion from `countBlockers(keptFindings, agent.ciFailOn)` (`server/src/modules/reviews/run-executor.ts:299`) | Yes | The CI and timeline signal; deliberately not the strip's source once a finding can be dismissed — AC-85 |
| The gate policy a run executed under | `agent_runs.ci_fail_on`, denormalized at completion from `agents.ci_fail_on` | Yes, on every row predating the column | Read as `critical` — AC-93 |
| Dismissal state of a finding | `findings.dismissed_at`, written by the reviewer | Yes | A dismissed finding is not a blocking reason — AC-84 |
| Finding severities and line ranges | `findings` | Yes | Review-focus rows fall into the "intersects no finding" ordering tier — AC-26 |
| Review model identifiers | `reviews.model` | Yes | The cross-model note names only the brief's model — AC-57 |
| Brief model and provider | `FEATURE_MODELS` entry `risk_brief` (`contracts/platform.ts:59-63`), overridable per workspace in Settings | No | Defaults to the registry value; behaviour unchanged until a model is picked |
| Prompt tokens, completion tokens, cost | The provider response and `adapters/llm/pricing.ts` | Cost yes | Token counts render, no currency figure — AC-53 |
| Risks, review focus, summary, merge risk, file summaries | The `risk_brief` model, one call | Only on failure | Failure leaves the previous brief in place — AC-47 |

**Design provenance — the frame was produced on 2026-08-24 and this note is the
record of what it changed.** The original spec was written without one: no Figma
URL, no image path and no screenshot reached its author, so everything it said
about the design came from a written transcription (rung 3 of the design ladder),
corroborated against the code and the seed data (rung 4), which turned out to
hold the design verbatim — `server/src/db/seed.ts:385` carries the strip's
summary sentence and `:387` carries `score: 61`. It named three things a
transcription could not settle and decided them on their merits: what a risk row
expands to (AC-19), whose cost the strip's cost line reports (AC-51) and whether
the score donut's arc encodes the band (AC-10), and it pre-authorised a produced
frame to supersede those three and this note.

The frame, inspected against the shipped screen, settled them and found more:

| Frame | Shipped | Resolution |
|---|---|---|
| `ⓘ` immediately after the counts badge | Absent | AC-86 — the frame had drawn the affordance the erased-judgement defect needed, and it was the one strip element never built |
| Cost `$0.014 · 8.2K→1.3K` inside the strip under the donut | In the panel footer at the bottom | AC-96 — the frame supersedes AC-51 on placement, exactly as pre-authorised; what is reported is unchanged |
| `PR BRIEF` section label above the strip | No label at all | AC-94 |
| Regenerate as an icon-only control inside the strip | Labelled button in a header row above the strip | AC-95 takes the placement, AC-81 keeps the visible label. The one place the frame does **not** win, and it loses to an accessibility rule the frame could not have known about |
| Intent and blast columns at equal width | `minmax(0, 1.45fr) minmax(0, 1fr)` | AC-97 |
| Risk row: bordered box, title over its file path | One line, path right-aligned at `maxWidth: 45%` | AC-98 |
| Risk-row expansion | Never drawn | AC-19 stands as decided — the frame is silent, so the merits decision holds |
| The strip on a PR with no completed review | Never drawn — every frame shows the reviewed rendering | AC-96's second branch is a merits decision, not a frame reading: with no donut there is no trailing column, so the cost line ends the main column instead |
| Donut arc against the band | Donut encodes the 0-100 score only | AC-10 stands, now confirmed by the frame rather than argued |
| `RISK AREAS`, `REVIEW FOCUS — READ THESE FIRST` | `Risks`, `Review focus` | Copy only, and the frame wins: `brief.block.risks` and `brief.reviewFocus.title` are reworded in place. Not a contract change, and no criterion turns on the wording |

Two elements of the shipped screen appear in **no** frame — the generated-from
footer (AC-80) and the cross-model note (AC-56). Both were accepted deliberately
as `UX-2` and as a US-6 goal. A frame's silence is not a rejection, and neither is
removed.

## Untrusted inputs

Everything in this table crosses a trust boundary. The controlling precedent is
`server/specs/2026-08-09-intent-layer.md`, whose threat model is not
hypothetical: in April 2026 "Comment and Control" (CVSS 9.4) showed PR titles
alone driving three AI review agents to exfiltrate their API keys.

| Input | Chosen by | What it is allowed to be | What the system does otherwise |
|---|---|---|---|
| PR title, body, branch, commit messages | The same person whose code is under review | Text, truncated to the input caps | Fenced in its own labelled `<untrusted>` block with an escaped closer; never treated as instruction |
| Diff and patch text fetched from GitHub | The PR author | Text, capped at 20 KB per file and 200 KB total | Truncated and logged; fenced as untrusted |
| Derived intent | The intent classifier, over author-controlled inputs | Already-persisted `Intent` fields | Re-fenced as untrusted here; a stated scope can never suppress a risk or lower the band |
| Repository file paths and symbol names from `repo-intel` | Repository content | Paths and identifiers | Fenced; used only to validate refs, never as instruction |
| **Every byte of the brief model's output** | The model, steerable by all of the above | `severity` in the three-value enum; `file_refs` matching `path`/`path:line`/`path:start-end`; strings within the length caps. The model supplies no band — `merge_risk` is derived server-side from the risks that survive grounding (AC-78, AC-79) | Schema-validated on arrival; out-of-enum values reject the whole generation as `failed`; over-length strings are truncated; unresolvable refs and ungrounded rows are dropped — AC-14, AC-15, AC-24 |
| `file_refs` paths specifically | The model | A path already present in `pr_files.path` or in the blast response | Dropped. A fabricated path would otherwise become a rendered `githubBlobUrl` deep link the reader would trust — AC-13, AC-14 |
| Review-focus line ranges | The model | A range intersecting a real diff hunk | Dropped. This is the same grounding gate the review pipeline applies to findings — AC-24 |
| Finding titles and risk titles rendered in the blocking-reasons card | The review model and the brief model | Plain text rendered by React, which escapes it | Never rendered through `dangerouslySetInnerHTML`. The card renders titles and file references only — AC-88 excludes `rationale` and `explanation`, which shrinks the untrusted surface on that card rather than widening it. Each row's link target is a `githubBlobUrl` built from a path already validated by AC-13 or grounded by the review pipeline; a title is never used to build a URL |
| Risk `explanation` and focus `reason` text | The model | Plain text rendered by React, which escapes it | Never rendered through `dangerouslySetInnerHTML`. If markdown rendering is ever wanted here, it goes through the existing sanitised `Markdown` primitive and `javascript:` URLs are rejected |
| Any instruction embedded in the diff or the body claiming the change is approved, exempt or low-risk | The PR author | A fact about the PR to describe | The trusted system section overrides it in any language; a descoping claim never lowers `merge_risk` or drops a risk |
| The merge-risk band itself | Not the model — the server, from the risks that survived grounding | Exactly the value AC-78's rule yields for those risks | A band the model supplied is discarded unread (AC-79). `PrIntentClassification` has no `confidence` field and `test/intent-confidence.test.ts` pins that a model-supplied number cannot reach a stored value; deriving the band applies that same rule one step further, and it also stops the band from becoming a self-assessment of the model's own certainty. No self-reported confidence is stored or displayed |

## Open questions

None. Every question and every proposal raised against this spec — at authoring
time and again at the 2026-08-24 amendment — was answered and now lives in the
body rather than as an entry here:

| Raised | Answer | Where it lives now |
|---|---|---|
| `Q-1` the design was never seen | The transcription stands as the record; the three things it could not settle were decided by `Q-2`, `Q-3` and `Q-4` | The design-provenance note under `## Inputs and provenance` |
| `Q-2` whose cost the strip reports | The brief's own generation cost, kept out of `agent_runs.cost_usd` | AC-50, AC-51, unchanged |
| `Q-3` what a risk row expands to | The risk's `explanation` plus all of its `file_refs` | AC-19, plus AC-76 and the two corrected `## Edge cases` rows on when a row is expandable at all |
| `Q-4` the donut's arc colour | No — the donut renders the 0-100 quality score and the band is a separate labelled element | AC-8, AC-10, unchanged |
| `Q-5` how `merge_risk` is decided | A stated function of the risks that survive grounding, not a model choice | AC-78, AC-79, the determinism note, two `## Untrusted inputs` rows and three `## Edge cases` rows |
| `Q-6` should a review invalidate the brief | No — staleness stays sha-only, matching `SPEC-02`'s AC-54 | AC-37, plus the accepted consequence under `## Non-functional requirements` |
| `UX-1` two refresh controls on one tab | Accepted — the brief's control carries its own visible label; `IntentCard` already renders one | AC-81 |
| `UX-2` say what the brief was generated from | Accepted — relative time and short sha, alongside the Stale badge rather than instead of it | AC-80 |
| `UX-3` price in the confirmation | Accepted — the last successful generation's known cost, or no figure at all | AC-82 |
| `Q-7` what the strip shows when the review and the brief disagree | Both, always. The verdict keeps the headline and the band joins it as a labelled chip; when an approving review stands over a `high` band the strip says so in words | AC-6, AC-83, AC-92 |
| `Q-8` where the reasons for holding a merge are stated, given how long review-agent prose runs | Behind the `ⓘ` the frame already drew, as titles and file references with no prose at all | AC-86 to AC-91 |
| `Q-9` whether the blocking set is the review's or the brief's | Neither alone — their union, because the reader has one question and it does not become two because two models answered it | AC-84 |
| `Q-10` how the client identifies *which* findings blocked, given it only receives a count | `RunSummary` gains an optional `ci_fail_on`, denormalized onto the run at completion beside `score` and `blockers` | AC-84, AC-93, and the contract-impact note |
| `UX-4` the regenerate control's placement against the frame | Accepted with one exception — it moves into the strip as the frame draws it, and keeps the visible label the frame omits | AC-95, AC-81 unchanged |
| `UX-5` the six other frame disagreements | Accepted, frame wins on all six | AC-94, AC-96, AC-97, AC-98 and the copy row of the design-provenance table |

Three statements the repository contradicted were corrected in the same pass and
are recorded where they belong rather than here: the single type-only re-export
of `PrBrief` at `client/src/lib/types.ts:43` (under `## Non-functional
requirements`, contract impact), the `unavailableHint` copy that named two
triggers AC-39 forbids and has since been reworded to name generation as a paid
action and nothing else (AC-71 and the i18n note), and the true contents of the
`brief` i18n namespace (the i18n note).
