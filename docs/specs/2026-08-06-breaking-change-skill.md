# breaking-change skill — design

Date: 2026-08-06
Status: implemented

## Problem

Twelve skills govern how code in this repo is written. None of them asked the
one question that separates a refactor from an outage: **does a consumer depend
on the shape I am about to change?**

Four surfaces cross a package or process boundary here, and every one can be
broken silently:

- a Zod contract is edited in `server/src/vendor/shared/contracts/` and mirrored
  to `client/` — both sides compile, a deployed client does not;
- a route is renamed in `server/src/modules/*/routes.ts` — no compiler sees the
  caller, because the caller is a `fetch` string;
- a column is dropped in `server/src/db/schema/` — the code is consistent and the
  rows are gone;
- an export disappears from `reviewer-core/src/index.ts` — a CI runner outside
  this tree bundles that package separately.

## Scope, and the two neighbours

`semver-discipline` and `deprecation-policy` were added to `.claude/skills/` on
the same day this skill was written. Between them they own the MAJOR/MINOR/PATCH
verdict, the `@deprecated` marker format and the removal window. The split was
therefore made by question, not by topic:

| Question | Owner |
|---|---|
| Is this breaking? Which bump? | `semver-discipline` |
| How is it marked, how long does it live? | `deprecation-policy` |
| Did the diff touch a surface? What order does it ship in? What blocks merge? | `breaking-change` |

In: detection, the release sequence, the database surface, the gate.
Out: the verdict, the marker, the window, `/v1` URL prefixes, `e2e/`.

### What the original design lost

The approved design carried a machine-readable version registry at
`server/src/vendor/shared/contracts/registry.ts` (mirrored to `client/`) and
per-surface windows — internal closable in the same PR given grep evidence,
external ≥ 14 days.

Both were cut once the neighbours were found. `deprecation-policy` already
specifies a marker and windows of 90/30 days; two mechanisms in one folder force
every agent to pick one at random. The registry's premise — that root `CLAUDE.md`
forbids comments, so a JSDoc marker was unavailable — also stopped being true:
`CLAUDE.md` now carves out an explicit exception for a `@deprecated` marker
block.

What survived is the part no marker can express: **a database column has nowhere
to put one**, and `deprecation-policy` explicitly excludes schema and migrations.

## Design

### Detection is mechanical

Four `git diff` scans anchored to `git merge-base HEAD origin/main`, one per
surface, plus a documented list of the changes that leave no removed line — a
newly required field, tightened validation, a changed default, a response enum
growing, and the semantic case where nothing in the schema moves at all.

The split is `pr-self-review`'s: deterministic first, judgement only after a hit.
The known blind spot (semantics) is named rather than papered over.

### The sequence, not the calendar

```
expand     new field/route/column beside the old one; marker goes on here
migrate    every in-repo consumer moved; cross-package rg output pasted in the PR
contract   old path deleted, own PR, after the window closes
```

Independent of the window `deprecation-policy` sets: three steps must be three
*releases*, or there is no version in which both paths work and no consumer can
upgrade one step at a time. Rollback safety is the payoff — only the last step is
irreversible, and by then nothing depends on what it removes.

### Database

Versioned by migration number; expand and contract are two generated files by
construction. Covers the `NOT NULL` three-step, `CHECK`/`UNIQUE` via `NOT VALID`,
text-enum direction, and the observation that a column rename need not become a
contract rename — `onion-architecture`'s repository-boundary mapping lets the two
surfaces move independently.

### The gate

`detect → classify → require → verify → report`. **CRITICAL for exactly one
case**: a removal or narrowing with no expand step and no marker in the same
diff. Everything else is WARNING. A gate that fires on every contract edit gets
bypassed, and a bypassed gate teaches the habit.

## Delivered

```
.claude/skills/breaking-change/
  SKILL.md                   defaults table, surfaces + detection, sequence, DB,
                             6 good/bad pairs, the gate, project profile
  references/detection.md    per-surface scans; the changes with no removed line
  references/rollout.md      three steps, deploy ordering, two-deploy window, rollback
  references/database.md     migration pairs, NOT NULL, constraints, enums
  references/gate.md         five steps, severity, report shape, pr-self-review
  references/examples.md     11 good/bad pairs on real symbols in this repo
  evals/evals.json           5 evals, incl. one that must produce no ceremony
  CHANGELOG.md, README.md
```

Wiring: routing and severity rows in `pr-self-review`, catalog row in
`.claude/skills/README.md`. No product code changed.

## Corrections made against the tree

- `agent-runner/` does not exist, despite being named in
  `reviewer-core/src/index.ts` and `pr-self-review/references/routing.md`. The
  skill says the CI runner is outside this tree instead — a stronger claim, since
  no grep here can see it.
- `groundFindings(findings: Finding[], diff: UnifiedDiff)`, not `(review, diff)`.
- `RunEvent` has no `type` field; the wire enum is `RunEventKind`, and it is also
  frozen into the jsonb `RunTrace` documents.

## Known gaps

- No `assets/` detection script — commands only. If one is added it belongs in
  `pr-self-review`'s `preflight.sh`, where deterministic checks already run.
- `deprecation-policy` links three reference files and an audit script that are
  not on disk; deferring to it currently dead-ends on "read more".
- Nothing mechanically detects "these two changes should have been two releases".
