# breaking-change — rationale and contested calls

Not part of the skill payload. This records where the boundaries came from, what
was rejected, and which claims were checked against the tree.

---

## 1. Why this skill exists next to two others

Three skills in `.claude/skills/` touch compatibility. They were split by
*question*, not by topic, because overlapping guidance is worse than none:

| Question | Owner |
|---|---|
| Is this breaking? MAJOR / MINOR / PATCH? | `semver-discipline` |
| How is it marked, and how long does the old path live? | `deprecation-policy` |
| Did the diff touch a surface? In what order does it ship? What blocks the merge? | `breaking-change` |

The test applied to every section: **if two skills could answer this, one of them
must not.** A model that loads both and gets two answers picks whichever it read
last, which is worse than either answer alone.

## 2. What was cut, and why

The first draft of this skill was designed before the other two were on disk. It
carried:

- **a version registry** at `server/src/vendor/shared/contracts/registry.ts`,
  machine-readable, mirrored to `client/`, with `path` / `since` / `removeAfter`
  / `replacedBy` per deprecated element;
- **per-surface windows** — internal surfaces closable in the same PR given grep
  evidence, external surfaces ≥ 14 days.

Both were cut. `deprecation-policy` already specifies a marker
(`@deprecated` + `@removeAfter` + `@migration`) and windows (90 days public,
30 days internal), and shipping a second mechanism in the same folder would have
forced every agent to choose between them.

The registry's original justification was that root `CLAUDE.md` forbids comments,
so a JSDoc marker was unavailable. That premise no longer holds: `CLAUDE.md` now
carves out an explicit exception for a `@deprecated` marker block. The registry
would have been a parallel source of truth for something the marker already
records.

What survives from that design is the part no marker can express: **the database
surface has nowhere to put one.** A column is versioned by its migration number,
and expand-and-contract is two files. `deprecation-policy` explicitly excludes
schema and migrations, so this is a genuine gap rather than a duplication.

## 3. Contested calls

### Detection is mechanical, classification is not

Modelled on `pr-self-review`'s "deterministic before probabilistic". Whether a
line was removed is a `git diff` question; whether the removal breaks anyone is a
judgement. The split keeps the expensive, fallible step small.

Two costs, both known and both preferred to the alternative. The scans are tuned
for recall, so they fire on lines that were merely reflowed or reordered — 1.0.1
corrected an earlier claim that they had no false positives, and
`references/detection.md` now opens *Reading a hit* with the step that clears
that noise. And a semantic change produces no removed line at all, so no scan
finds it; rather than pretend otherwise, the same file names the class, gives a
field-name heuristic, and marks it explicitly as a prompt for a human rather than
a verdict.

Erring toward recall is deliberate. A false positive costs a second of reading;
a missed one costs the outage the skill exists to prevent.

### One CRITICAL case only

A gate that fires on every contract edit gets bypassed, and a bypassed gate is
strictly worse than no gate because it also teaches the habit. `pr-self-review`'s
own severity file makes the same argument for `onion-architecture`. So the only
blocker is an *undeclared* break — removal or narrowing with no expand step and
no marker. A declared, staged break is the procedure working.

### The sequence, not the calendar, is the mechanism

`deprecation-policy` owns how long the old path lives. This skill owns that the
three steps are three *releases*. The two are independent: a 90-day window with
all three steps in one PR protects nobody, because there is no version in which
both paths work and a consumer can therefore never upgrade one step at a time.

### Windows were surrendered, evidence was not

The original design let an internal surface close in the same PR when `grep`
proved zero consumers. `deprecation-policy` requires 30 days for cross-module
internals, and that number now governs. The grep survived anyway, as the
**migrate** step's artifact — it answers a different question (has the migration
happened) than the window does (has enough time passed).

## 4. Claims checked against the tree

Every path and symbol in the skill was verified. Three drafts were wrong:

- **`agent-runner/` does not exist.** It appears in
  `reviewer-core/src/index.ts`'s header and in `pr-self-review`'s routing table
  ("`agent-runner/` likewise"), and there is no such directory. The skill now
  says the CI runner is outside this tree — which is the stronger claim, since it
  means no grep in this repo can see that consumer of `reviewer-core`.
- **`groundFindings(findings: Finding[], diff: UnifiedDiff)`** — the draft had
  `(review: Review, diff: string)`.
- **`RunEvent` has no `type` field.** The enum is `RunEventKind`
  (`info | tool | result | error`), carried on every SSE message *and* frozen into
  the jsonb `RunTrace` documents in `run_traces`.

Verified as stated: `reviews.score` is a nullable `integer`
(`server/src/db/schema/reviews.ts:32`); `Review.score`'s `.describe()` text
encodes "HIGHER is better" and is fed to the model; `FindingRecord` extends
`Finding` with `review_id` / `accepted_at` / `dismissed_at`; routes are registered
statically, one call per operation; `check_contract_mirror` in
`pr-self-review/assets/preflight.sh` requires a `client/` counterpart for every
file under `server/src/vendor/shared/`.

## 5. Known gaps

- **No `assets/` script.** Detection is a set of commands in
  `references/detection.md`, not an executable. A script was scoped out; if it is
  added later it belongs beside `pr-self-review`'s `preflight.sh`, in step 0,
  where deterministic checks already run.
- **No enforcement of the release boundary.** Nothing mechanically prevents
  expand and contract landing in one PR beyond the gate's requirement that a
  removal be accompanied by an addition and a marker. Detecting "these two
  changes should have been two releases" needs history the diff does not carry.
