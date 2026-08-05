---
name: breaking-change
description: Finds a breaking change in the diff and runs it out safely - detect which public surface a change touched, stage it as expand → migrate → contract across separate releases, prove the migration with a cross-package grep, and block the PR when a break lands undeclared. Use this skill whenever a change edits, renames, narrows or deletes something a consumer already depends on - a Zod contract under vendor/shared, an HTTP route or response field, a Drizzle column or a migration, an export from reviewer-core/src/index.ts - and whenever the user asks "is this a breaking change", "how do I roll this out", "can I ship this in one PR", "what do I have to do before deleting this", "how do I drop this column", or why a PR was blocked for a contract change. Trigger it even when nobody says the words: a rename, a removal, a newly required field or a dropped column IS a breaking change, and the rollout sequence is what decides whether it costs anything. Owns detection, the release sequence, database expand-and-contract, and the pre-merge gate; delegates the MAJOR/MINOR/PATCH verdict to semver-discipline and the deprecation marker and removal window to deprecation-policy.
version: 1.0.1
metadata:
  scope: shared
  tags: [breaking-change, rollout, expand-and-contract, migration, detection, database, gate, api-evolution]
---

# Breaking Change

A break is never a decision. It is a diff that looked like tidying: the field had
a better name, the column was obviously unused, the export was internal. It
compiles, the tests pass, and the thing that fails is somewhere the compiler was
never invited — a deployed client, a row written last March, a bundle in
`agent-runner/` built from a different tree.

Three skills stand between that diff and an outage, and they are not
interchangeable:

| Question | Skill |
|---|---|
| Is this breaking, and is it MAJOR / MINOR / PATCH? | `semver-discipline` |
| How do I mark it, and how long must it live? | `deprecation-policy` |
| **Did the diff touch a surface, in what order do I ship it, and what stops it from merging?** | **this skill** |

Load `semver-discipline` first for the verdict. Come here for the sequence.

## The default answers

| Question | Default answer |
|---|---|
| Can a break ship in one PR? | No. `expand → migrate → contract`, and announcement and removal never share a release |
| Which step is skipped in practice? | **migrate** — it has no code of its own, only evidence. That is why the evidence is mandatory |
| What proves a migration is done? | A cross-package `rg` over `server/src client/src reviewer-core/src e2e`, output pasted in the PR |
| Does a green `pnpm typecheck` prove anything? | No. Three packages, three lockfiles; the mirror satisfies the compiler, not the deployed client |
| Is updating the `client/` mirror a migration? | No. The mirror is not a consumer — the browser holding last week's bundle is |
| How do I rename a database column? | Two migrations, never one. `ADD` + backfill + switch reads, then `DROP` in a later PR |
| Can `expand` and `contract` be the same migration file? | No. They must be independently deployable and independently revertible |
| Where does the marker and the date go? | `deprecation-policy`. Do not invent a second format here |
| What version does each step get? | `semver-discipline`. This skill only enforces that the three steps are three releases |
| The surface is internal and `grep` says zero callers? | Delete it, paste the grep. `deprecation-policy`'s module-local tier |
| What does this skill block on? | Exactly one thing: a removal or narrowing with no expand step and no marker |
| Is a declared, dated, staged break a finding? | No. That is the procedure working |
| A rollout is not atomic — what follows? | Old code and the new schema coexist for minutes. Every step must be correct in both states |

## The four surfaces and how to detect them

A surface is public when something that is not rebuilt by this PR depends on its
shape. That is a fact about deployment, not about the `export` keyword.

```bash
BASE=$(git merge-base HEAD origin/main)
```

| Surface | Detect with | The consumer that is not recompiled |
|---|---|---|
| Zod contracts | `git diff "$BASE" -- server/src/vendor/shared/contracts/ \| grep '^-' \| grep -v '^---'` | A browser on the previous bundle; LLM structured output |
| HTTP API | `git diff "$BASE" -- 'server/src/modules/*/routes.ts' \| grep -E "^-.*(app\.(get\|post\|put\|patch\|delete)\|reply\.(code\|status))"` | `client/` fetch call sites, `e2e/`, external callers |
| Database | `git diff "$BASE" -- server/src/db/migrations/ \| grep -Ei '^\+.*(DROP (COLUMN\|TABLE\|CONSTRAINT)\|RENAME\|SET NOT NULL\|ALTER COLUMN .* TYPE)'` | Rows already written; the process mid-rollout |
| Package exports | `git diff "$BASE" -- reviewer-core/src/index.ts server/src/vendor/shared/index.ts \| grep '^-.*export'` | The CI runner, which bundles `reviewer-core` from outside this tree |

**A removed line is a fact, not a judgement.** Detection never goes to a model —
`git diff` answers it, at zero token cost. It is tuned to miss nothing rather
than to be precise, so a reflowed or reordered line reports as a hit; clearing
that costs a second of reading, and the alternative costs an outage. Judgement
starts only after a hit, and even then `semver-discipline`'s tables do most of
the work. The full command set, the noise-clearing step, and how to catch the
changes that leave no removed line are in `references/detection.md`.

## The sequence

```
expand     add the new field / route / column beside the old one.
           Old path keeps working, unchanged. Marker goes on here.

migrate    move every in-repo consumer. The PR carries the grep output
           showing the count reached zero.

contract   delete the old path. Its own PR, its own release,
           never before the window closes.
```

Three properties earn the extra PRs: each step deploys alone, each step reverts
alone, and the risky step is the one where nothing depends on the thing being
deleted any more.

**The rollout is not atomic.** For the minutes between deploys, the old server
runs against the new schema and the new server against old rows. Every step has
to be correct in *both* states — which is the real reason `expand` cannot be
merged into `contract`, and why a column is added nullable before anything writes
to it. Ordering, rollback and the two-deploy window are in `references/rollout.md`.

**Migration evidence, verbatim:**

```bash
rg -n --type ts '\bdismissed_at\b' server/src client/src reviewer-core/src e2e
```

Zero matches is the artifact. A claim that "nothing uses it" is not.

## Database — the surface nobody else covers

`deprecation-policy` explicitly excludes schema and migrations, and a column has
no `@deprecated` to hang a marker on. The version of a database surface is its
**migration number**, and expand-and-contract is two files by construction:

```sql
-- 0016_add_quality_score.sql   ← expand. nullable, no backfill yet, no reads
ALTER TABLE "reviews" ADD COLUMN "quality_score" integer;

-- 0018_drop_score.sql          ← contract. separate PR, after reads moved
ALTER TABLE "reviews" DROP COLUMN "score";
```

| Change | Safe in one migration? |
|---|---|
| Add nullable column, or column with a default | Yes |
| Add `NOT NULL` with no default | No — add nullable, backfill, then `SET NOT NULL` |
| Drop or rename a column | No — expand and contract, and the drop is irreversible |
| Narrow a type (`text` → `varchar(50)`) | No — existing rows may not fit |
| Add a `CHECK` or unique constraint | No — fails on violating rows, rejects previously valid writes |
| Add an index | Yes — `CONCURRENTLY` on a live table |

Migrations here are forward-only and generated; hand-editing the SQL is flagged
by `pr-self-review`. Backfills, enum changes and the `NOT NULL` three-step are in
`references/database.md`.

## Good and bad

Each pair is defensible from inside the diff and wrong from outside it. More, on
real files in this repo, in `references/examples.md`.

**1. The rename that "updates both sides"**

```ts
// ❌ one PR: contracts/review-api.ts + the client mirror + every call site
-  accepted_at: z.string().nullable(),
+  acknowledged_at: z.string().nullable(),
```
```ts
// ✅ expand — both fields ship; the old one is marked per deprecation-policy
export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
});
```

The red version passes typecheck, passes `check_contract_mirror`, and passes
review. It breaks the browser tab that was already open — the only consumer that
matters here, and the only one no check in this repo can see.

**2. The drop that "the code no longer uses"**

```sql
-- ❌ 0016_drop_score.sql — one file, one PR
ALTER TABLE "reviews" DROP COLUMN "score";
```
```sql
-- ✅ 0016 expand, then 0018 contract in a later PR
ALTER TABLE "reviews" ADD COLUMN "quality_score" integer;
```

Even with zero readers in the repo, the deploy is not atomic: for a few minutes
the old server writes `score` to a schema that no longer has it. And the data is
gone in a way no revert recovers.

**3. The barrel cleanup**

```ts
// ❌ reviewer-core/src/index.ts — "nothing in server/ imports this"
-  export { gateTriggered, countBlockers } from './output/to-review.js';
```
```bash
# ✅ prove it across all three packages first, then remove and say so
rg -n --type ts '\b(gateTriggered|countBlockers)\b' server/src client/src reviewer-core/src e2e
# → 0 matches, output pasted in the PR
```

Per `reviewer-core/src/index.ts`, the CI runner consumes this package and bundles
it with `@vercel/ncc` — and that runner is **not in this tree**, so no grep here
can see it. "The server compiles" is not evidence, and for `reviewer-core`
exports a clean grep is necessary rather than sufficient.

**4. The required field**

```ts
// ❌ every existing caller becomes invalid the moment this deploys
export const RunRequest = z.object({
  agentId: z.string().optional(),
  all: z.boolean().optional(),
  groundingMode: z.enum(['strict', 'loose']),
});
```
```ts
// ✅ same feature, no break — a default preserves the old behaviour
export const RunRequest = z.object({
  agentId: z.string().optional(),
  all: z.boolean().optional(),
  groundingMode: z.enum(['strict', 'loose']).default('strict'),
});
```

**5. The silent one**

```ts
// ❌ the signature is identical; the meaning inverted
-  const score = raw.score;        // 0..100, higher is better
+  const score = 100 - raw.score;  // now: lower is better
```
```ts
// ✅ a new meaning gets a new name, and the old one goes through the sequence
riskScore: z.number().int().min(0).max(100),
```

No compiler, no schema, and no test asserting a range catches this. Renaming is
the only mechanism that reaches the consumer, which is why a semantic change is
treated as a rename even when nothing in the shape moved.

**6. The three steps compressed into one PR**

```markdown
❌ "Added rejected_at, migrated the client, dropped dismissed_at. All green."
```
```markdown
✅ PR 1 (expand)    add `rejected_at`; mark `dismissed_at`; both ship
   PR 2 (migrate)   move client reads; rg output attached, 0 remaining
   PR 3 (contract)  drop `dismissed_at`, after the window
```

All-green is exactly what the compressed version looks like. It is also
un-revertible: rolling back the deploy restores code that reads a field the
migration already dropped.

## The gate

```
1. detect     git diff vs merge-base over the four surface patterns
2. classify   semver-discipline → the verdict per changed element
3. require    MAJOR ⇒ expand step present, marker per deprecation-policy,
              and for a contract step the rg evidence
4. verify     re-read the diff for those artifacts
5. report     one finding per undeclared break
```

**CRITICAL is exactly one case: a removal or narrowing that ships with no expand
step and no marker.** Everything else is WARNING. A declared, dated, staged break
is not a defect, and blocking it would teach people to route around the gate —
which costs more than the break did. Step detail, the report shape and the ack
path are in `references/gate.md`.

## Where to read more

| Read this | When |
|---|---|
| `references/detection.md` | Every detection command per surface, and the changes that leave no removed line |
| `references/rollout.md` | The three steps in detail, deploy ordering, the two-deploy window, rollback, what evidence counts |
| `references/database.md` | Migration pairs, backfills, `NOT NULL` in three steps, enums, constraints, indexes |
| `references/gate.md` | The five steps, severity, the report, ack, integration with `pr-self-review` |
| `references/examples.md` | Good/bad pairs on real files in this repo, one per surface |
| `semver-discipline` (skill) | Whether it breaks at all, and the version bump |
| `deprecation-policy` (skill) | The marker format and how long the old path must live |

`README.md` records the contested calls and what was rejected.

## Project profile: dev-digest

Root `CLAUDE.md` and each `<module>/CLAUDE.md` win if they contradict this file.

| Thing | Where |
|---|---|
| Contracts | `server/src/vendor/shared/contracts/*.ts`, barrel at `vendor/shared/index.ts` |
| Contract mirror | `client/src/vendor/shared/` — same commit, byte-identical |
| Routes | `server/src/modules/*/routes.ts` |
| Schema + migrations | `server/src/db/schema/*.ts`, `server/src/db/migrations/*.sql` |
| Engine exports | `reviewer-core/src/index.ts` |
| Mirror enforcement | `pr-self-review/assets/preflight.sh` → `check_contract_mirror` |

**Local rules that override the generic advice.**

- **Nothing here is published and every package sits at `0.0.0`.** There is no
  dist-tag protecting anyone; the sequence is the entire protection.
- **The mirror check is not a compatibility check.** `check_contract_mirror`
  proves the two copies agree, which is necessary and not sufficient. It cannot
  see the deployed client, and a mirrored rename passes it cleanly.
- **`reviewer-core/` has a consumer this repo cannot grep.** `server/` is the
  visible one; `reviewer-core/src/index.ts` documents a CI runner that bundles
  the package with `@vercel/ncc`, and that runner is not in this tree. Treat a
  clean grep as necessary, not sufficient, before removing an export.
- Migrations are forward-only; hand-editing generated SQL is flagged. Expand and
  contract are two `pnpm db:generate` runs.
- `z.object` strips unknown keys, so adding a response field is safe here.
  Check for `.strict()` before relying on that.
- A `z.infer` type is part of the surface: editing a schema edits an exported
  TypeScript type that `client/` compiles against.
- `RunEventKind` in `contracts/trace.ts` is a wire format *and* a storage
  format: it rides every SSE message on `/runs/:id/events`, and whole runs are
  persisted as jsonb `RunTrace` documents. Changing one of its values breaks
  open connections and every trace already written.
- `contracts/trace.ts` carries a mirror drift that predates any current branch.
  Do not report it as a break this diff introduced.
- **On the no-comments rule.** Root `CLAUDE.md` forbids comments in new code and
  carves out exactly one exception: a `@deprecated` marker block, in the shape
  `deprecation-policy` specifies and containing nothing else. That exception does
  not extend to explaining a rollout inline — the reasoning goes in the module's
  `specs/`. And it cannot reach the *database* at all, which is why a column is
  versioned by its migration number here instead: there is nowhere on a column to
  put a marker.
