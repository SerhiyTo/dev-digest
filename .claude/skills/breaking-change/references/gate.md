# The gate — five steps, one blocker

A rule nobody checks is a rule that does not exist. This skill is enforceable
because detection is mechanical and the required artifacts are things that either
appear in the diff or do not.

## The five steps

### 1. detect

Run the four surface scans from `references/detection.md` against the
merge-base. Output is a list of candidate hits: file, line, the removed or added
line. No judgement yet.

If the branch is `main`, or there is no merge-base, stop and say so. Reporting
"clean" when nothing was examined is worse than reporting nothing.

### 2. classify

For each candidate, get the verdict from `semver-discipline` —
`.claude/skills/semver-discipline/references/breaking-catalog.md` has a row for
nearly every case. Anything that comes back MAJOR is a break and moves to step 3.
MINOR and PATCH are recorded and dropped.

Do not re-derive the taxonomy here. Two skills disagreeing about whether a
nullable response field is breaking is worse than either answer.

### 3. require

Each break needs artifacts present **in this diff**:

| The break is | Required |
|---|---|
| a removal or rename | the new path added in the same diff (expand), and a marker per `deprecation-policy` |
| a contract step (deleting an already-deprecated path) | the `rg` evidence showing zero remaining consumers, and the window closed |
| a destructive migration | a partner expand migration, or a stated reason the table is empty |
| a semantic change | the new name; a value whose meaning changed keeps no old name |
| a newly required request field | a `.default()` or `.optional()`, or an expand step |

The asymmetry is deliberate: an *expand* needs almost nothing, a *contract*
needs everything. That is the incentive the gate is trying to create.

### 4. verify

Re-read the diff for each required artifact. Two specific checks that catch most
false positives:

- **Was it already like this at the merge-base?** Inherited debt is not a
  finding. `contracts/trace.ts`'s mirror drift predates every current branch.
- **Is the "removal" a move?** A symbol that left one file and appeared in
  another, still exported from the same barrel, changed nothing observable.

```bash
git show "$BASE:server/src/vendor/shared/contracts/review-api.ts" | grep dismissed_at
```

### 5. report

One finding per undeclared break, in the shape `pr-self-review` already
consumes — `Severity` from `server/src/vendor/shared/contracts/findings.ts`,
never a parallel scale:

```
CRITICAL  contracts/review-api.ts:31
  `FindingRecord.dismissed_at` is removed with no replacement field in this diff.
  Consumer: client/src/app/repos/[repoId]/pulls/helpers.ts reads it.
  Expected: add `rejected_at` alongside, mark `dismissed_at` per deprecation-policy,
            drop it in a later PR.
```

A finding without a named consumer and a named file is a guess. If step 4 could
not name one, the honest report is that the surface changed and the consumer is
unknown — as a WARNING.

## Severity

**CRITICAL is exactly one case: a removal or narrowing that ships with no expand
step and no marker.**

| Situation | Level |
|---|---|
| Removal / rename / narrowing, nothing added, no marker | CRITICAL |
| Destructive migration with no partner expand | CRITICAL |
| Break is declared and staged, window still open | not a finding |
| Contract step with no `rg` evidence in the PR | WARNING |
| Window expired, callers still present | WARNING |
| Marker malformed or missing a date | WARNING — and it is `deprecation-policy`'s call |
| Surface changed, no consumer identified | WARNING |
| Semantic change suspected, not confirmed | WARNING, never CRITICAL |

Everything speculative is at most WARNING. "Might be", "could potentially", "if
this isn't handled elsewhere" — none of those blocks a merge. A gate that fires
on maybes gets bypassed on certainties.

**Zero findings is a valid and good answer.** Most PRs touch no public surface at
all.

## Integration with pr-self-review

`pr-self-review` owns the merge path; this skill supplies the finding. The
routing row:

| Pattern | Auditor |
|---|---|
| `server/src/vendor/shared/**`, `server/src/modules/*/routes.ts`, `server/src/db/schema/**`, `server/src/db/migrations/*.sql`, `reviewer-core/src/index.ts` | `breaking-change` |

Two things not to duplicate. `check_contract_mirror` in `preflight.sh` already
proves the two vendored copies agree — do not re-report drift. And the same step
0 already flags hand-edited migration SQL.

Bypass goes through `pr-self-review`'s existing mechanism:

```
/pr-self-review ack <id> "table is empty in every environment; verified in psql"
```

An ack expires when its file changes. A gate with no exit gets uninstalled, and a
gate whose exit leaves no record is not a gate.

## Running it standalone

Nothing here requires the full review flow. On a branch, before opening anything:

```bash
BASE=$(git merge-base HEAD origin/main)
git diff "$BASE" --name-only | grep -E 'vendor/shared|routes\.ts|db/(schema|migrations)|reviewer-core/src/index\.ts'
```

An empty result means this skill has nothing to say about the branch. That is
the common case, and it costs one command to establish.
