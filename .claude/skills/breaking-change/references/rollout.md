# Rollout — expand, migrate, contract

The sequence exists for one reason: **a deploy is not atomic.** Between the
moment the new server starts and the moment the last old process exits, two
versions of the code run against one database and one set of clients. Every
intermediate state has to be correct, and a single-PR break has no intermediate
state to be correct in.

## The three steps

### Step 1 — expand

Add the new thing beside the old one. The old path keeps working, **unchanged**.

- New field is added; the old field stays and keeps being written.
- New route is added; the old route still answers.
- New column is added nullable; nothing reads it yet.
- The marker goes on here — format and window from `deprecation-policy`.

What makes this step safe is that a consumer who ignores it entirely is
unaffected. If that is not true, it is not an expand step.

**Do not change behaviour while expanding.** "Deprecate it and fix the bug while
I'm in here" leaves the consumer with two problems and no stable reference
point. Freeze the old path; bug fixes only.

### Step 2 — migrate

Move every consumer in the repo. This step has no code of its own on the surface
being retired — which is exactly why it is the step that gets skipped.

The artifact is a grep that reached zero:

```bash
rg -n --type ts '\bdismissed_at\b' server/src client/src reviewer-core/src e2e
```

Paste the output in the PR. Three rules about it:

- **Cross every package.** Three packages, three lockfiles, and no compiler spans
  them. A green `pnpm typecheck` in `server/` says nothing about `client/`.
- **Search the string, not the symbol.** A route path lives inside a `fetch`
  template literal and no type system tracks it. Grep `'/pulls/'`, not a symbol.
- **Zero matches is the claim.** "I checked" is not evidence, and neither is a
  passing test suite — the tests were written against the same assumption.

For `reviewer-core` exports, a clean grep is necessary but not sufficient: the CI
runner documented in `reviewer-core/src/index.ts` bundles the package from
outside this tree, so nothing in this repo can see it.

### Step 3 — contract

Delete the old path. Its own PR, after the window in `deprecation-policy` has
closed, and never in the same release as the announcement.

The removal commit deletes the code **and** its marker. A marker left behind
after the symbol is gone points readers at nothing.

If the window has expired but callers remain: fix the callers, or extend the
date once, in writing. Removing on schedule with a live caller is the same
outage as a silent delete, just better documented.

## Why they cannot be merged

| Merged steps | What breaks |
|---|---|
| expand + contract | There is no version where both paths work, so no consumer can upgrade one step at a time |
| migrate + contract | The revert is unsafe: rolling back the code restores reads of something the migration already dropped |
| all three | Every problem above, plus a diff where the removal is invisible among the additions |

The compressed version always looks better in CI. That is the trap: green is
what a break looks like before it reaches a consumer.

## Deploy ordering

Within a single expand step, the order across processes matters:

```
1. migrate the database (additive only)   ← schema is ahead of every process
2. deploy the server                       ← writes both old and new
3. deploy the client                       ← reads the new
```

The invariant is that **the schema is always ahead and always backwards
compatible**. A process that has not restarted yet must still be able to write
what it was writing before. That is why the expand column is nullable: the old
server does not know it exists and inserts nothing into it.

Contract runs the same order in reverse — stop reading, stop writing, then drop.

## The two-deploy window

For the minutes between step 2 and step 3 of the ordering above, this is true
simultaneously:

- the old server writes `dismissed_at` and not `rejected_at`;
- the new server writes both;
- the client may receive a payload from either.

Consequences worth designing for:

- **Dual-write during expand.** If the new column is going to be read, the expand
  step writes both columns, or the backfill has a moving target.
- **Readers tolerate both.** A client that hard-fails on a missing
  `rejected_at` breaks against the old server. Read the new field, fall back to
  the old, for exactly one release.
- **No cutover flags.** A flag that switches reads from one field to another
  across a fleet is a distributed transaction with no coordinator. Deploy order
  is the mechanism; a flag is a wish.

## Rollback

Each step must revert on its own, and this is the property that makes the
sequence worth its cost:

| Step | Revert | Safe? |
|---|---|---|
| expand | remove the new field / route; leave the nullable column | Yes — nothing depended on it |
| migrate | restore reads of the old path | Yes — the old path was never removed |
| contract | restore the code | **No** — dropped column data is gone; a dropped route's 404s already happened |

Only the last step is irreversible, and by the time it runs nothing depends on
what it removes. That is the entire design.

## When the sequence is overkill

Do not apply this to something nothing consumes. `deprecation-policy`'s
module-local tier is the correct answer for a symbol used only inside its own
folder: paste the grep and delete it in one PR.

The line is drawn by reachability, not by size. A one-word rename on a
`vendor/shared/` contract gets the full sequence; a four-hundred-line refactor
inside one module gets none of it.
