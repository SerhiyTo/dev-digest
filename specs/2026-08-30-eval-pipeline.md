# Spec: Eval pipeline — regression harness for reviewer agents
Spec ID: SPEC-04
Status: implemented
Supersedes: none
Verified: 2026-08-31 — **67 of the 68 criteria this spec then carried were
confirmed against the tree; AC-55, the one that was not, has been confirmed
since. The spec now carries 69 — see the amendment note below.**
The work was built from `docs/plans/2026-08-30-eval-pipeline.md` and traced
criterion by criterion by `plan-verifier` in final mode, which returned COMPLETE
over 316 items with a row for every criterion; suites at verification time were
`reviewer-core` 63/63, server unit 613/613, server integration 178/178, client
498/498, every typecheck clean, both `vendor/shared` mirror `diff -q` gates at 0,
and `pnpm verify:l06` green from both manifests with one lane skipped.

**AC-55 is now confirmed.** `e2e/specs/11-evals.flow.json` carries the four
required legs — creating a case from a finding, listing the agent's set, running
it, and comparing two runs through the `Compare selected runs` control — and it
is no longer only typechecked: an `e2e:hermetic` run has since executed the
suite and passed 11 of 11 flows, this one included. That is the criterion's
`Observed by:` — the flow passing with no provider credential configured — so
the earlier reservation, that a flow which typechecks but has never run is not
an observed criterion, is discharged.

**Amended 2026-08-31 — AC-38 revised and AC-69 added; both are pending
re-verification and neither is claimed as met.** The dashboard listed only
agents that already owned at least one eval case. The seed plants all 8 cases on
`Security Reviewer` (AC-63) while five agents are seeded
(`server/src/db/seed.ts:1158-1207`), so `/evals` showed a single card — and an
agent with zero cases could not be reached from the dashboard at all, leaving no
path there to create its first case. AC-38 now requires every reviewer agent in
the workspace to be listed, and AC-69 defines the zero-case card. AC-69 is being
built as this amendment is written. No contract change follows: `EvalDashboard`
already admits `cases_total: 0` with every metric null
(`server/src/vendor/shared/contracts/eval-ci.ts:137-153`).

**AC-65's body overstates what was built.** Its `Observed by:` is met — the two
suite runs either side of removing the named prompt line report different
metrics, witnessed at `server/test/eval-prompt-sensitivity.it.test.ts:169-179`.
The body's claim that removing the line moves recall and precision *in opposite
directions* is not what happens: recall falls `0.2 → 0` and precision goes
`1 → null`, because with the line gone the agent reports no findings at all and
AC-36 then requires precision to be reported as not computed rather than as a
number. The seeded pair AC-65 requires does exist (`server/src/db/seed-evals.ts`,
the `must_find` SSRF case and the `must_not_flag` fixed-URL health-check case,
both tagged with the prompt line they depend on). Only the sentence describing
the direction of the move is wrong, and correcting it is an amendment, not part
of this status flip.

## Problem and user

The person who tunes a reviewer agent in this product has no way to tell whether
an edit made it better. They change the system prompt, re-run a review on one
pull request, read three findings, and form an impression. Nothing records what
the agent used to do, so a prompt line that fixes one false negative and quietly
introduces two false positives looks identical to a prompt line that fixed
everything. The evidence that this was always meant to be closed is already in
the tree: `server/src/modules/reviews/findings.ts:7-9` states that accept and
dismiss "are the dataset later lessons build on (eval cases from
accept/dismiss…)", `server/src/modules/agents/repository.ts:103-104` snapshots
every agent config into `agent_versions` explicitly "for reproducibility (eval
replays a past version)", and `eval_cases` / `eval_runs` exist and are migrated
(`server/src/db/schema/eval.ts:6-36`,
`server/src/db/migrations/0000_init.sql:117-140`). Nothing in `server/src`
reads or writes either table, there is no `modules/eval/`, and `client/` has no
`/evals` route and no Evals tab — `AgentEditor.tsx:1-5` says in as many words
that the tab "arrives in later lessons".

This feature turns the accept/dismiss decisions a reviewer already makes into a
stored regression set, runs an agent against that set on demand, scores the
result with a deterministic function that makes no model call, and puts two runs
side by side so "old prompt vs new" becomes a number instead of an impression.
Modules in scope: `server/` (a new eval slice plus an expand-only schema
change), `reviewer-core/` (the scorer, ring 0, pure), `client/` (two routes and
one nav entry), `e2e/` (one deterministic flow). The delivery checklist asks for
`specs/eval-pipeline.md`; this document satisfies it in substance under the
repository's dated-slug convention documented in `specs/README.md:31-56`, and
`Spec ID: SPEC-04` is the stable identifier to cite.

**Vocabulary warning.** The root `evals/` directory is `@devdigest/evals`, which
evaluates the Claude Code harness that builds this product. It is unrelated to
this feature and out of scope. Everything here is a product-level *eval case*,
*eval run* and *eval dashboard*, owned by a reviewer agent inside a workspace.
AC-66 fixes those three as the product terms in writing; the root package is not
renamed.

## Goals and non-goals

**Goals**

- A reviewer's accept/dismiss decision becomes a durable regression case without
  the reviewer leaving the finding they are looking at.
- An agent author can see the whole regression set for an agent, and what each
  case did on its last run.
- An agent author can re-run an agent against its whole set and get recall,
  precision and citation accuracy for that run.
- Two runs of the same agent can be compared directly, including the system
  prompt that produced each, so a prompt change is attributable.
- Scoring is deterministic, free, and reproducible: the same inputs always give
  the same numbers, and producing them costs nothing.
- The whole feature is verifiable in one command that a reviewer can run.

**Non-goals**

- The rest of the L06 row in `README.md:96` — Secret/Phantom gates, Plan
  Verifier and Export to CI are separate features and are not specified here.
- `Learn` and `Reply to author` on the finding action row, and the `Stats` and
  `CI` tabs in the agent editor. They appear in the design; they are L07
  (`README.md:97`).
- Skill-owned eval cases. `EvalOwnerKind` (`knowledge.ts:143`) already admits
  `skill`; this feature only ever writes `agent`, and the enum is not narrowed.
- Running an eval automatically — on a schedule, on agent save, or in CI. Every
  run in this feature is started by a person.
- Any change to how a real pull-request review runs, is scored, or is displayed.
- Publishing eval results outside the workspace.
- The `Promote v7` control drawn in the compare view. It is cut rather than
  defined: `agent_versions` already snapshots and bumps on every configuration
  change (`server/src/modules/agents/repository.ts:103-104`), so promoting the
  version a run already carries is either a no-op or a rollback wearing a
  promotion label. No criterion describes it.
- A cross-agent `Run all agents` control. Every eval run in this feature is
  started for exactly one named agent, so no single control can fan out across
  the whole workspace.

## User stories

US-1: As a reviewer reading a finding, I want to turn it into an eval case in
one click, so that the judgement I just made is preserved as a regression test
instead of evaporating.

US-2: As an agent author, I want to see every eval case an agent owns and what
each did last time, so that I know what the agent is actually being held to.

US-3: As an agent author, I want to run an agent against its whole set on
demand, so that I can check a change before it reaches a real pull request.

US-4: As an agent author, I want recall, precision and citation accuracy for a
run, so that "better" is a number rather than an impression.

US-5: As an agent author, I want to open the run history and put two runs side
by side with the system prompt that produced each, so that I can attribute a
metric move to a specific prompt change.

US-6: As someone reviewing this work, I want one command that proves the whole
pipeline holds together, and a set large enough to be meaningful, so that the
feature can be accepted without paying a provider or trusting a screenshot.

## Acceptance criteria (EARS)

### Creating a case from a finding (US-1)

AC-1 (US-1): WHEN a user activates "Turn into eval case" on a finding whose
recorded action is `accepted`, the server shall create an eval case owned by the
agent that produced the finding, whose expectation list contains exactly one
entry of kind `must_find` carrying the finding's file, start line, end line and
category.
  Observed by: the created case's `expected_output`, read back from the case
  detail response.

AC-2 (US-1): WHEN a user activates "Turn into eval case" on a finding whose
recorded action is `dismissed`, the server shall create an eval case owned by
the agent that produced the finding, whose expectation list contains exactly one
entry of kind `must_not_flag` carrying the same four fields.
  Observed by: the created case's `expected_output`, read back from the case
  detail response.

AC-3 (US-1): IF the finding has been neither accepted nor dismissed, THEN the
server shall reject the create request with 400 and shall create no case, and
the client shall render the control in a disabled state stating that the finding
must be accepted or dismissed first.
  Observed by: the HTTP status and an unchanged case count for that agent; and
  the disabled attribute on the rendered control.

AC-4 (US-1): WHEN a case is created from a finding, the server shall store on
the case a snapshot of the unified diff for the file the finding cites, so that
the case remains runnable after the finding, its review, its pull request or its
repository is deleted.
  Observed by: `input_diff` being non-empty on the created case, and the case
  still running to completion after the source pull request row is deleted.

AC-5 (US-1): WHEN a case is created from a finding, the server shall record on
the case the identifier of that finding.
  Observed by: the `source_finding_id` field of the case detail response.

AC-6 (US-1): IF an eval case already exists whose recorded source finding is the
finding being acted on, THEN the server shall create no second case and shall
return the existing case together with an indication that nothing was created.
  Observed by: a second POST returning the same case id as the first, and the
  agent's case count unchanged.

AC-7 (US-1): WHEN case creation succeeds, the client shall display a
confirmation naming the created case and offering a way to open it.
  Observed by: the confirmation element containing the case name, present in the
  DOM after the action resolves.

AC-8 (US-1): The system shall name a case created from a finding after that
finding, and shall make the name unique within the owning agent by appending a
numeric suffix when a case of that name already exists.
  Observed by: two cases created from two findings with identical titles having
  distinct `name` values.

### The expectation contract (US-1, US-2)

AC-9 (US-2): The system shall validate every eval case's expected output against
one schema: an array of expectations, each discriminated by a `kind` of
`must_find` or `must_not_flag`, each carrying a file, a line, an optional end
line and a category, and each optionally carrying a severity and a
`title_contains` substring.
  Observed by: the schema in `vendor/shared`, and a rejected write for a payload
  that does not conform.

AC-10 (US-2): IF a submitted expected output fails that validation, THEN the
server shall respond 400, shall persist nothing, and the response shall name the
index of the failing expectation and the failing field.
  Observed by: the HTTP status and the error body; and the case row being
  unchanged.

AC-11 (US-2): WHILE the eval-case editor holds text that is not valid JSON, the
client shall mark the expected-output field invalid and shall disable Save.
  Observed by: the validity badge state and the disabled attribute on Save.

AC-12 (US-2): WHEN the user inserts a finding skeleton in the eval-case editor,
the client shall require a choice between `must_find` and `must_not_flag` and
shall insert a skeleton valid for the chosen kind.
  Observed by: the text inserted into the editor after each of the two choices.

AC-13 (US-2): The system shall accept an eval case whose expectation list is
empty, and shall treat it as asserting that the agent reports no findings at
all.
  Observed by: such a case saving without error and passing when the agent
  returns zero findings.

### Seeing the set (US-2)

AC-14 (US-2): WHEN a user opens an agent's eval page, the client shall list
every case that agent owns, and for each case its name, the kinds of expectation
it carries, and the outcome of its most recent run.
  Observed by: one rendered row per case returned by the list endpoint.

AC-15 (US-2): WHERE a case has never been run, the client shall label it "never
run" and shall show neither a pass nor a fail state for it.
  Observed by: the rendered row for a case with no run rows.

AC-16 (US-2): IF an agent owns no eval cases, THEN the client shall render an
empty state that says so and offers case creation, and shall render no metric
percentages for that agent.
  Observed by: the rendered agent page for an agent with zero cases containing
  no percentage-formatted metric value.

AC-17 (US-2): WHEN an agent is deleted, the system shall delete that agent's
eval cases and all runs belonging to them.
  Observed by: the case list for the deleted agent's identifier returning
  nothing, and no orphan case rows remaining.

AC-18 (US-2): The server shall reject any read or write of an eval case or eval
run that belongs to a different workspace than the caller's, with 404.
  Observed by: the HTTP status for a case identifier from another workspace.

### Running the set (US-3)

AC-19 (US-3): WHEN a user starts an eval run for an agent, the server shall
create exactly one suite run recording that agent, the agent's current version
number, and the start time, and shall execute every case the agent owns against
the configuration snapshot stored for that version.
  Observed by: one suite-run row per start, carrying a version that matches the
  agent's `version` at start time.

AC-20 (US-3): WHEN a case is executed as part of a suite run, the server shall
persist one per-case run row carrying that suite run's identifier, the agent
version used, the agent's raw output, the per-case metrics, the duration and the
cost.
  Observed by: the count of per-case rows carrying the suite run's identifier
  equalling the number of cases the agent owned at start time.

AC-21 (US-3): IF a suite run for an agent is already in progress, THEN the
server shall reject a further start for that agent with 409 and shall create no
second suite run.
  Observed by: the HTTP status of the second request, and the suite-run count
  for that agent.

AC-22 (US-3): IF the execution of one case fails — provider error, timeout, or
malformed model output — THEN the suite run shall continue with the remaining
cases, shall persist that case's run row with a failed outcome and the error
message, and shall count that case as zero matched findings in the run's
aggregate metrics rather than excluding it.
  Observed by: the persisted per-case row's error field, and the suite run's
  case total equalling the agent's case count.

AC-23 (US-3): WHEN every case in a suite run has been executed, the server shall
write to the suite run the aggregate recall, precision and citation accuracy,
the number of cases passed, the number of cases total, the total cost and the
total duration, and shall mark the run complete.
  Observed by: the completed suite-run row.

AC-24 (US-3): IF the server process handling a suite run terminates before the
run completes, THEN that suite run shall be observable as incomplete rather than
as a run with metrics, and shall be excluded from trend, delta and comparison.
  Observed by: the run's absence from the trend series returned for that agent,
  and its state in the run list.

AC-25 (US-3): The server shall limit eval-run starts to at most 10 per minute
per workspace, matching the limit already applied to review starts at
`server/src/modules/reviews/routes.ts:29`.
  Observed by: the HTTP status of the eleventh start within one minute.

AC-26 (US-3): WHEN a single case is run on its own from the case editor, the
server shall persist a per-case run row that belongs to no suite run, and that
row shall not contribute to any suite-run aggregate, trend point or comparison.
  Observed by: the row's null suite-run identifier, and the agent's trend series
  being unchanged by that run.

AC-57 (US-3): WHEN a case is executed in an eval run, the system shall apply the
citation-grounding gate to the agent's findings before persisting or scoring
them, on exactly the terms a pull-request review applies it
(`reviewer-core/src/grounding.ts:5-13,52`), so that an eval measures the shipped
path rather than an ungated one.
  Observed by: a case whose agent reports one finding citing a line in no hunk
  of the case's snapshotted diff, and whose persisted output and per-case
  metrics both exclude that finding.

AC-58 (US-3): WHILE a suite run is in progress, the client shall display a
cancel control for that run.
  Observed by: the control's presence while the run is in progress and its
  absence once the run has reached a terminal state.

AC-59 (US-3): WHEN a user cancels a suite run that is in progress, the server
shall execute no further cases after the case in flight, shall mark the suite
run cancelled, and shall retain every per-case run row already written.
  Observed by: the suite run's cancelled state, and the per-case row count
  equalling the number of cases that had started before the cancel.

AC-60 (US-3): WHEN a suite run is cancelled, the server shall thereafter accept
a new suite-run start for that agent rather than rejecting it under AC-21.
  Observed by: the HTTP status of a start issued after a cancel.

AC-61 (US-3): The system shall exclude a cancelled suite run from an agent's
trend series, from its metric deltas and from run comparison, on the same terms
as an incomplete run (AC-24).
  Observed by: the trend series length being unchanged by a cancelled run, and
  the run being unselectable for comparison.

AC-62 (US-3): WHERE a suite run was cancelled, the client shall label it
cancelled in the run list, shall render no aggregate metric percentage for it,
and shall still make its per-case rows readable.
  Observed by: the rendered run-list row for a cancelled run containing no
  percentage-formatted aggregate, and its per-case detail listing the cases that
  did run.

### Scoring (US-4)

AC-27 (US-4): The system shall compute every eval metric with a function whose
only inputs are the case's expectations and the agent's findings for that case,
and that performs no network request and no model call.
  Observed by: a test that runs the scorer with every provider adapter and
  network client replaced by a fake that fails on use, and passes.

AC-28 (US-4): The system shall treat a finding as matching an expectation when
the finding's file equals the expectation's file, the finding's line range
overlaps the expectation's line range widened by the tolerance window, and the
finding's category equals the expectation's category.
  Observed by: the scorer's output for a finding one line outside and one line
  inside the window.

AC-29 (US-4): The system shall record, for every matched finding, whether its
severity and its title agreed with the expectation, and shall not let either
decide whether the match occurred.
  Observed by: the per-case detail carrying both flags, while the match count is
  unchanged between a matching and a non-matching severity.

AC-30 (US-4): The system shall compute recall as the number of `must_find`
expectations matched divided by the number of `must_find` expectations present,
counting only cases that carry at least one `must_find` expectation.
  Observed by: the run's recall for a set containing one case with two
  `must_find` expectations and one case with none.

AC-31 (US-4): The system shall exclude a case carrying no `must_find`
expectation from the recall denominator rather than scoring it as zero recall.
  Observed by: recall being unchanged when a `must_not_flag`-only case is added
  to a set.

AC-32 (US-4): The system shall compute precision as the number of reported
findings that matched a `must_find` expectation divided by the total number of
findings reported, and shall count a finding that matches a `must_not_flag`
expectation as one unmatched finding in that denominator.
  Observed by: the run's precision for a case where the agent reports exactly
  one finding that violates a `must_not_flag` expectation.

AC-33 (US-4): The system shall compute citation accuracy as, among the findings
that matched a `must_find` expectation, the fraction whose cited file equals the
expected file and whose cited line range falls within the expectation's line
range widened by the tolerance window.
  Observed by: the run's citation accuracy for a matched finding cited one line
  outside the window.

AC-34 (US-4): The system shall mark a case passed when every `must_find`
expectation it carries was matched and no `must_not_flag` expectation it carries
was violated, and failed otherwise.
  Observed by: the per-case run row's pass field for each of the four
  combinations.

AC-35 (US-4): IF a run's set contains no `must_find` expectation at all, THEN
the system shall report recall as not computed rather than as zero, and the
client shall render it as not computed rather than as 0%.
  Observed by: the null recall in the response, and the rendered text.

AC-36 (US-4): IF an agent reported no findings for a case, THEN the system shall
compute precision for that case as not computed rather than as zero, and shall
exclude it from the run's precision denominator.
  Observed by: the per-case precision being null and the run precision being
  unchanged by adding such a case.

AC-37 (US-4): The system shall produce identical metrics for identical
expectations and identical findings on every execution, independent of ordering
within either list.
  Observed by: a test scoring the same inputs twice with the findings reordered
  and asserting equal metrics.

AC-56 (US-4): The system shall widen an expectation's line range by exactly 3
lines in each direction, and shall use that same window in the match rule
(AC-28) and in citation accuracy (AC-33).
  Observed by: the scorer's output for a finding 3 lines outside an
  expectation's range, which matches, and one 4 lines outside, which does not.

### Metrics on screen (US-4)

AC-38 (US-4): WHEN a user opens the eval dashboard, the client shall list every
reviewer agent in the workspace, each with its most recent completed run's
recall, precision and citation accuracy, that run's agent version and time, and
its passed-of-total count.
  Observed by: one rendered card per agent in the workspace, carrying those five
  values for an agent that has a completed run.

AC-39 (US-4): WHERE an agent has never had a completed suite run, the client
shall show "never run" for that agent and shall render no metric percentage and
no delta for it.
  Observed by: the rendered card for such an agent containing no
  percentage-formatted value.

AC-40 (US-4): WHERE an agent has exactly one completed suite run, the client
shall render each metric without a delta and shall state that there is no
previous run to compare against.
  Observed by: the rendered metric cards containing no delta indicator and
  carrying that statement.

AC-41 (US-4): WHEN a user opens an agent's eval page, the client shall render
recall, precision and citation accuracy each with its change against the
previous completed run, a trend series over that agent's completed runs in
chronological order, and a run list carrying each run's time, agent version,
three metrics, passed-of-total and cost.
  Observed by: the rendered metric cards, the trend series length matching the
  agent's completed-run count, and the run list rows.

AC-42 (US-4): IF the most recent completed run's recall, precision or citation
accuracy is lower than the previous completed run's, THEN the client shall
display a banner naming each metric that fell and by how much.
  Observed by: the banner text for an agent whose last two runs differ in that
  direction.

AC-43 (US-4): The system shall return an agent's trend series ordered oldest to
newest and shall cap it at the 30 most recent completed runs.
  Observed by: the ordering and length of the returned series for an agent with
  more than 30 runs.

### Comparing two runs (US-5)

AC-44 (US-5): WHILE exactly two runs are selected in an agent's run list, the
client shall enable the compare control; while zero, one, or more than two are
selected, it shall be disabled.
  Observed by: the disabled attribute on the compare control at each selection
  count.

AC-45 (US-5): WHEN a user compares two runs, the client shall present recall,
precision, citation accuracy and cost each as the older run's value, the newer
run's value and the difference, with the older run always on the left
irrespective of the order in which the two were selected.
  Observed by: the rendered comparison for the same pair selected in each order.

AC-46 (US-5): WHEN a user compares two runs, the client shall present the
difference between the system prompts recorded in the agent-version snapshots of
those two runs.
  Observed by: the rendered prompt diff for two runs made either side of a
  prompt edit.

AC-47 (US-5): IF the agent-version snapshot behind either compared run cannot be
read, THEN the client shall state that the prompt difference is unavailable and
shall still present the metric differences.
  Observed by: the rendered comparison when one snapshot row is absent.

AC-48 (US-5): WHERE the two compared runs share an agent version, the client
shall state that the configuration did not change between them.
  Observed by: the rendered comparison for two runs at the same version.

AC-49 (US-5): WHEN the system prompt of an agent is changed between two suite
runs over an unchanged set, the two runs shall report different recall or
different precision.
  Observed by: the two suite-run rows' metrics, compared in the compare view.
  Its guaranteed witness is the seeded case pair of AC-65, whose outcomes one
  named prompt line decides.

### Verification and scale (US-6)

AC-50 (US-6): The system shall make at least 8 eval cases available for one
reviewer agent in a freshly prepared environment, all runnable without manual
authoring.
  Observed by: the case count returned by the list endpoint for that agent after
  `pnpm db:seed` has run (AC-63).

AC-51 (US-6): The repository shall provide a `verify:l06` command runnable from
both `server/` and `client/` as `pnpm verify:l06`, matching how `verify:l03` is
declared in both today (`server/package.json:15`, `client/package.json:11`).
  Observed by: the presence of the script in both package manifests and the exit
  code of the command.

AC-52 (US-6): The `verify:l06` command shall run, and shall fail the whole
command on the failure of any of: server typecheck, server unit tests, server
integration tests, `reviewer-core` typecheck and tests, client typecheck, client
tests, client build, and `e2e` typecheck.
  Observed by: the command's exit code with each lane deliberately broken.

AC-53 (US-6): The `verify:l06` command shall include a lane that asserts every
eval route is registered, and a lane that executes the scorer with all model and
network access replaced by a fake that fails on use.
  Observed by: the named lanes in the command's output, and a non-zero exit when
  either is removed or broken.

AC-54 (US-6): WHERE a lane cannot run in the current environment, the
`verify:l06` command shall report that lane as skipped and shall not report the
command as verified on the strength of a lane that did not run.
  Observed by: the command's output and exit code with Docker unavailable.

AC-55 (US-6): The `e2e` suite shall carry one flow that exercises creating a
case from a finding, listing an agent's set, running the set, and comparing two
runs, and that flow shall complete without any model call.
  Observed by: the flow passing with no provider credential configured.

AC-63 (US-6): WHEN the database seed runs, the system shall create at least 8
eval cases owned by the seeded `Security Reviewer` agent
(`server/src/db/seed.ts:1004`), each carrying a snapshotted diff and an
expectation list valid under AC-9.
  Observed by: the case count and each case's `input_diff` and `expected_output`
  after `pnpm db:seed`.

AC-64 (US-6): WHEN the database seed runs a second time against a database it
has already seeded, the system shall not multiply the seeded eval cases.
  Observed by: the case count for that agent being equal after one seed and
  after two.

AC-65 (US-5): The seeded set shall contain a pair of cases whose outcomes are
decided by one named line of that agent's system prompt — one case whose
expectation requires the finding that line produces, and one whose expectation
forbids it — so that removing or restoring the line moves recall and precision
in opposite directions.
  Observed by: two suite runs made either side of removing that one line, whose
  recall and precision differ in the compare view (AC-49).

AC-66 (US-6): The repository shall carry a note, in `specs/README.md` and in the
eval module's own documentation, fixing "eval case", "eval run" and "eval
dashboard" as product terms owned by a reviewer agent, and stating that the root
`@devdigest/evals` package evaluates the Claude Code harness and is a different
thing.
  Observed by: the presence of that note in both documents.

AC-67 (US-6): The system shall hold `client/src/vendor/shared/contracts/eval-ci.ts`
byte-identical to `server/src/vendor/shared/contracts/eval-ci.ts`, including the
`AgentManifest` block the client copy does not declare today and the
`openrouter` member of `ConformanceInput.provider` it does not carry today
(`client/INSIGHTS.md:179-190`).
  Observed by: `diff -q` between the two files exiting 0.

AC-68 (US-6): The `verify:l06` command shall include `contracts/eval-ci.ts` in
the byte-identical mirror gate rather than in the excluded list
(`scripts/verify-l04.sh:103`), and shall fail when the two copies differ by one
character.
  Observed by: the command's exit code with a single character changed in one
  copy.

AC-69 (US-4): IF an agent owns no eval cases, THEN the dashboard shall render
that agent's card with no percentage-formatted metric value and an affordance
that opens that agent's eval surface so the first case can be created.
  Observed by: the rendered card for an agent with zero cases containing no
  percentage-formatted value and a control linking to that agent's eval surface.

## Edge cases

| Case | Outcome |
|---|---|
| Finding is neither accepted nor dismissed when "Turn into eval case" is pressed | Control disabled client-side, 400 server-side, nothing created (AC-3) |
| Same finding turned into a case twice | Second attempt returns the existing case, creates nothing (AC-6) |
| Two findings with the same title become cases | Names disambiguated with a numeric suffix (AC-8) |
| The source finding, review, pull request or repository is deleted later | Case keeps running: the diff was snapshotted at creation (AC-4) |
| The agent that owns the set is deleted | Cases and their runs are deleted with it. `eval_cases.owner_id` carries no foreign key (`server/src/db/schema/eval.ts:12`) and cannot, because `owner_kind` is polymorphic; the deletion is therefore an explicit application-level responsibility, not a database cascade (AC-17) |
| Agent owns zero cases | Still listed on the dashboard, with no percentages and an affordance that opens that agent's eval surface so the first case can be created (AC-69); the agent's own eval page shows the empty state with case creation offered (AC-16). `EvalDashboard.current` declared non-nullable numbers before this feature (`eval-ci.ts`) and was made nullable for exactly this state, because rendering 0% for "no data" is the failure this repo already ruled against in `client/specs/2026-08-16-blast-radius.md` |
| Agent has exactly one completed run | Metrics shown, deltas suppressed with an explicit "no previous run" (AC-40) |
| Agent owns cases but has never had a completed suite run | "never run", not 0% (AC-39) — a different state from owning no cases at all (AC-69); individual cases likewise (AC-15) |
| A case is run alone from the editor | Persisted, but contributes to no aggregate, trend point or comparison (AC-26) |
| Suite run started twice — double click, two tabs | Second start rejected 409 (AC-21), retries bounded by the rate limit (AC-25). There is no cross-agent `Run all agents` control to fan out from: every start names one agent (Non-goals) |
| A user starts the wrong run and wants out | Cancel stops after the case in flight, marks the run cancelled and keeps the per-case rows already written (AC-58, AC-59, AC-62); the agent is immediately startable again (AC-60) |
| A cancelled run's partial numbers | Never aggregated and never comparable: the run is excluded from trend, delta and comparison exactly as an incomplete run is (AC-61), while its completed per-case rows stay readable (AC-62) |
| One run costs more than the user expected | Bounded by the 200-case limit, the 120-second per-case timeout and cancellation (AC-59) only. A per-run spend ceiling with a stopped-on-budget state was proposed and **rejected**: partial metrics are not comparable to full ones under AC-22, so the ceiling would buy a number nobody could use |
| Restoring an older configuration from the compare view | Not offered. The design's `Promote v7` control is **cut**, not defined — see Non-goals |
| The seed is run twice against the same database | The seeded eval cases are not multiplied (AC-64) |
| One case fails mid-suite | Suite continues; the case scores zero matches and stays in the denominators, so a flaky provider shows as a metric drop rather than silently shrinking the set (AC-22) |
| Every case fails | Run completes with recall 0, precision not computed, and the per-case errors persisted (AC-22, AC-36) |
| No `must_find` expectation anywhere in the set | Recall reported as not computed (AC-35) |
| Agent reports zero findings for a case | Precision not computed for that case, excluded from the run denominator (AC-36); the case still passes if it carried no `must_find` (AC-13, AC-34) |
| Expectation list is empty | Valid; asserts the agent stays silent (AC-13) |
| Model output is unparseable | Case fails with the error persisted, suite continues (AC-22) |
| Server dies mid-run | Run is observable as incomplete, excluded from trend and comparison (AC-24) |
| Comparison selected in newest-first order | Older run rendered on the left regardless (AC-45) |
| Agent-version snapshot behind a compared run is missing | Metric deltas still shown, prompt diff stated unavailable (AC-47) |
| Two compared runs share a version | Stated explicitly, so an unchanged metric is not misread as a prompt with no effect (AC-48) |
| Citation accuracy looks perfect for the wrong reason | The grounding gate at `reviewer-core/src/grounding.ts:5-13,52` already drops findings whose range does not intersect a diff hunk, before anything is persisted. Measuring "did it cite a real hunk" would therefore be trivially 1.0; the metric is defined instead as distance to the *expected* line (AC-33). The runner keeps the gate on (AC-57), so an eval measures the path a user actually gets; the cost of that choice is that a hallucinated location never reaches the precision denominator |
| Case set grows past what one screen or one run can hold | Capped per the limits in Non-functional requirements; trend capped at 30 runs (AC-43) |
| A case from another workspace is addressed directly | 404 (AC-18) |

## Non-functional requirements

**Cost and time.** A suite run is the most expensive control in the product: the
three agents in the design over a 20-case set is 60 sequential model calls, and
the design's own run list prices a single 20-case run at $0.23. Every suite run
shall persist its total cost, and every per-case run shall persist its own, from
the same accounting the review executor already does
(`server/src/modules/reviews/run-executor.ts:272,307,329`). Nothing in this
feature shall start a run without a person pressing a control, and no control
starts more than one agent's set (Non-goals). A run in progress can be cancelled
(AC-58–AC-62); there is no spend ceiling, so a run's cost is bounded by the
200-case limit, the per-case timeout and the user's ability to cancel.

Cancellation is not a new mechanism to design. A review run is already
cancellable end to end in this repo — the route at
`server/src/modules/reviews/routes.ts:113-118`, `cancelRun` at
`server/src/modules/reviews/service.ts:85-90`, the `cancelRunIfRunning` update
that sets the `'cancelled'` run status at
`server/src/modules/reviews/repository/run.repo.ts:94-101`, and the client
mutation at `client/src/lib/hooks/reviews.ts:76-81` — including the orphaned-run
case, where marking the row and completing the bus is what makes cancel work
after the executing process has died. A cancelled suite run is that same
terminal state on a different kind of run, and AC-24's incomplete state and
AC-61's cancelled state are deliberately treated alike downstream.

**Limits.** At most 200 eval cases per agent. At most 100 expectations per case.
At most 256 KiB of snapshotted diff per case, and at most 64 KiB of expectation
JSON. Case name at most 120 characters. Per-case execution timeout of 120
seconds, after which the case fails per AC-22. Trend series capped at 30 runs
(AC-43); run list paginated at 50 rows.

**Line tolerance.** The matching and citation windows use one named tolerance
value of ±3 lines, applied identically in both (AC-28, AC-33, AC-56). It is
deliberately loose enough to survive a model citing a function header a line or
two above the offending line, and tight enough that citation accuracy still
discriminates — a ±10 window would match almost anything and leave the metric
without signal.

**Determinism and independence from a provider.** Scoring is a pure function
(AC-27) and belongs at ring 0 with the rest of the pure engine, alongside
`reviewer-core/src/grounding.ts`, which is its nearest existing neighbour. It
imports no database, no filesystem, no GitHub client and no server code, per the
hard purity contract in `reviewer-core/CLAUDE.md`. The `e2e` flow must complete
with no provider credential present (AC-55), matching how the existing ten flows
in `e2e/specs/` run.

**Observability.** Every suite run records agent, agent version, start and end
time, case total, passed count, aggregate metrics, total cost and total
duration. Every per-case run records the agent's raw output, per-case metrics,
pass, duration, cost and, on failure, the error message.

**Accessibility.** The three metric values, the passed-of-total count and the
trend must each be readable without relying on colour alone — a metric that has
fallen is named in text (AC-42), not only tinted. Run-list checkboxes carry
accessible names identifying the run they select. The compare view is a modal
and must trap focus and be dismissible from the keyboard.

**Contract impact.** All of the following live in
`server/src/vendor/shared/contracts/` and must be mirrored byte-identically into
`client/src/vendor/shared/` in the same commit.

- `EvalCaseInput.expected_output` is `z.unknown()` today; AC-9 narrows it to a
  typed discriminated array. **This is a narrowing of a published contract**, and
  is therefore breaking in principle. In fact it breaks nobody: nothing under
  `server/src` or `client/src` outside the schema and migration files reads
  `eval_cases`, no route consumes `EvalCaseInput`, and the table has never held
  a row. It ships as one change, and this paragraph is the declaration.
- `EvalDashboard.current.recall`, `.precision`, `.citation_accuracy` and
  `.traces_passed` are non-nullable numbers today. AC-35, AC-36 and AC-39
  require a not-computed state, so they become nullable. Same argument, same
  zero consumers, same declaration.
- `EvalDashboard.delta.recall`, `.precision` and `.citation_accuracy` are
  non-nullable numbers today as well
  (`server/src/vendor/shared/contracts/eval-ci.ts:81-85`). AC-40 requires an
  explicit no-delta state for an agent with exactly one completed run, and
  AC-39 requires no delta at all for an agent with none, so these three become
  nullable on the same terms as `current` — a narrowing of a published contract
  in principle, with the same zero consumers, declared here.
- `EvalRunRecord` gains the suite-run identifier and the agent version. Additive;
  `z.object` strips unknown keys, so this breaks no reader.
- A suite-run record and a case-list record are new shapes. Additive.
- No `reviewer-core` export is removed or changed. The scorer is a new export,
  which is additive — and note that `reviewer-core` has a consumer outside this
  tree, per `reviewer-core/src/index.ts`, so removal there would not be safe
  even when a repo-wide grep is clean.

**Schema impact.** Expand only, and every step must be correct while old and new
code run against the same database during a deploy.

- New table for suite runs. Additive.
- `eval_runs` gains a nullable suite-run identifier and a nullable agent version.
  Nullable, no backfill, no read change for anything that exists — which is
  nothing (AC-26 depends on the null case being meaningful, so it stays
  nullable permanently rather than being tightened later).
- `eval_cases` gains a nullable source-finding reference. Nullable because a
  hand-authored case has no source finding, and because AC-4 requires the case
  to outlive the finding.
- No column is dropped, renamed, narrowed or made `NOT NULL` by this feature.
- Migrations are generated, never hand-edited.

**Mirror gate.** `scripts/verify-l04.sh` gates six files by `diff -q` and
deliberately excludes `contracts/eval-ci.ts`, `productionize.ts` and `trace.ts`
as known-divergent. `eval-ci.ts` is the file this feature edits most, and it is
currently divergent in two ways: the client copy declares no `AgentManifest`,
and its `ConformanceInput.provider` enum is `['openai','anthropic']` against the
server's `['openai','anthropic','openrouter']` (confirmed by diffing the two
files; recorded at `client/INSIGHTS.md:179-190`). Editing a file that no gate
checks is how the second divergence got there. Both divergences are therefore
repaired and the file is moved into the gated list (AC-67, AC-68) — this fixes
drift the feature did not cause, and it is the only outcome that stops the next
one, because a file excluded from `diff -q` cannot be gated on the new surface
alone.

## Inputs and provenance

| Input | Produced by | Can be absent | What absence means |
|---|---|---|---|
| The finding a case is created from — file, line range, category, severity, title | A reviewer agent run, persisted by `server/src/modules/reviews/run-executor.ts` | No, when the entry point is the finding card | — |
| The finding's action state, accepted or dismissed | The reviewer, through `POST /findings/:id/(accept\|dismiss)` (`server/src/modules/reviews/routes.ts:142-146`) | Yes — a finding starts undecided | The expectation kind cannot be derived; the control is refused (AC-3) |
| The diff a case runs against | Snapshotted at creation from the source pull request's diff, or pasted by the user in the editor | No — a case with no diff cannot be run | Rejected at save |
| The expectation list | Derived from the finding (AC-1, AC-2) or authored in the editor | Yes, an empty list is legal (AC-13) | An empty list asserts silence, not "unknown" |
| The agent configuration a run executes under | `agents` plus the immutable snapshot in `agent_versions` (`server/src/modules/agents/repository.ts:103-104`) | The row can be absent for an old version | The run still shows metrics; the prompt diff is unavailable (AC-47) |
| The agent's findings for a case | The same execution path a real review uses, so that an eval measures the product rather than a parallel implementation | Yes, zero findings is a legal outcome | Precision not computed for that case (AC-36); the case may still pass (AC-13) |
| Token counts and cost for a run | The provider response, through the accounting the review executor already performs | Yes — `cost_usd` is already nullable throughout | Cost is displayed as unknown, never as $0.00 |
| The metrics | The deterministic scorer, from expectations and findings only (AC-27) | Individually, yes (AC-35, AC-36) | Not computed, rendered as such, never as 0% |
| The set that satisfies AC-50 | `pnpm db:seed`, which plants at least 8 cases on the seeded `Security Reviewer` (AC-63) including the prompt-line pair of AC-65 | No, in any environment prepared the documented way | An unseeded database leaves AC-50 and AC-55 without a set to act on, which is a preparation failure rather than a product state |

## Untrusted inputs

| Input | Allowed to be | On violation |
|---|---|---|
| Eval case name | 1–120 characters of text, stored and rendered as text, never as markup | Rejected at 400 |
| Case notes | At most 4 KiB of text, rendered as text | Rejected at 400 |
| Pasted diff (`input_diff`) | At most 256 KiB of text. Treated as opaque data: never executed, never used to build a filesystem path, and never trusted to describe files that exist | Rejected at 400 |
| Expected-output JSON | At most 64 KiB, parsed with a bounded JSON parser and validated against the schema in AC-9 before anything is persisted. Never evaluated as code | Rejected at 400 with the failing index named (AC-10) |
| Diff content reaching the model | The diff is attacker-influenced by construction — it is a pull request's contents, and a case can be authored to contain anything. Text inside it that instructs the reviewer is data, not instruction, and must not be able to change what the agent is asked to do | The run proceeds; injected instructions are simply part of the graded input |
| Secrets inside a case's diff | The design's own example case snapshots a literal `sk_live_…` string. A case is a durable, workspace-visible record, so anything a user pastes into it persists. The system shall not log `input_diff` contents, and shall not include them in an error message | — |
| Model output, persisted as `actual_output` and rendered in per-case detail and the compare view | Validated against the existing `Finding` schema before scoring or persistence. Every string field — title, file, rationale, suggestion — is rendered as text and never as markup, and the file field is never used to build a filesystem path or a request URL | Malformed output fails the case per AC-22 |
| System prompt text rendered in the compare diff | Workspace-authored, still rendered as text with no markup interpretation | — |
| Agent, case and run identifiers in the URL | Opaque identifiers, always checked against the caller's workspace before any read or write (AC-18) | 404 |
| Eval run start requests | Rate-limited per AC-25 | 429 |

## Open questions

None.

Every question this spec opened has been resolved and folded into the sections
above: the ±3 tolerance (AC-56), the grounding gate staying on during an eval
run (AC-57), cancellation (AC-58–AC-62), the seeded set and its prompt-line pair
(AC-63–AC-65), the vocabulary note (AC-66) and the `eval-ci.ts` mirror repair
and gate (AC-67, AC-68). Two proposals were rejected and are recorded as such in
`## Edge cases`: the `Promote v7` control, which is cut rather than defined, and
the per-run spend ceiling. The cross-agent `Run all agents` fan-out is cut and
recorded in `## Goals and non-goals`.
