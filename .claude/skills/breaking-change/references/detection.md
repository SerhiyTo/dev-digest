# Detection — finding the break in the diff

Detection is deterministic. Whether a line was removed, whether a migration
contains `DROP COLUMN`, whether an export disappeared from a barrel — all of
these are `git diff` questions, answered at zero token cost. Judgement starts
*after* a hit.

Deterministic does not mean precise. The scans are tuned to miss nothing, and
they pay for it in noise: a line that was only reflowed, reordered or reindented
is a removed line to `grep` and nothing at all to a consumer. Every hit is
therefore a candidate until step 0 of *Reading a hit* below clears it. The cost
of that noise is a second of reading; the cost of a scan that skips the
ambiguous cases is the outage this skill exists to prevent.

Everything below anchors to the merge-base, so inherited debt is never reported
as something this branch introduced:

```bash
BASE=$(git merge-base HEAD origin/main)
```

## The four surface scans

**1. Zod contracts** — the vendored folder plus its barrel.

```bash
git diff "$BASE" -- server/src/vendor/shared/ | grep '^-' | grep -v '^---'
```

Any removed line here is a candidate. The common hits: a field deleted, a field
renamed (which shows as one `-` and one `+`), a `.optional()` or `.nullish()`
dropped, an enum member removed, an `export` gone from `index.ts`.

**2. HTTP API** — route registrations and status codes.

```bash
git diff "$BASE" -- 'server/src/modules/*/routes.ts' \
  | grep -E "^-.*(app\.(get|post|put|patch|delete)|reply\.(code|status)|schema:)"
```

Routes in this repo are registered statically, one call per operation, so a
removed or edited registration line is the whole signal. Path parameters matter
as much as paths: `/pulls/:id` changing meaning from a row id to an external id
is a break with no textual clue, which is why step 2 reads the diff rather than
trusting the grep.

**3. Database** — destructive DDL in generated migrations.

```bash
git diff "$BASE" -- server/src/db/migrations/ \
  | grep -Ei '^\+.*(DROP (COLUMN|TABLE|CONSTRAINT)|RENAME|SET NOT NULL|ALTER COLUMN .* TYPE|DROP DEFAULT|ADD CONSTRAINT)'
```

Note this one scans **added** lines: a migration is new SQL, and the destructive
act is a line being added to a new file. Also check the schema side, where the
same intent appears as a removed property:

```bash
git diff "$BASE" -- server/src/db/schema/ | grep '^-' | grep -v '^---'
```

A schema change with no matching migration, or a migration with no matching
schema change, is its own problem — `pr-self-review` already checks for
hand-edited migration SQL.

**4. Package exports** — the two barrels.

```bash
git diff "$BASE" -- reviewer-core/src/index.ts server/src/vendor/shared/index.ts \
  | grep '^-.*export'
```

Removing a symbol from a barrel while the file keeps it is still a removal:
the barrel is the surface.

## The changes that leave no removed line

The scans above catch deletions. These are the ones that arrive as pure
additions or as no diff at all, and they are the expensive half.

| Change | Shows up as | Find it with |
|---|---|---|
| New **required** request field | an added line | read every `+` in a request schema; a field with no `.optional()`/`.default()`/`.nullish()` |
| Tightened validation | an added `.min()`, `.email()`, `.regex()`, `.int()` | `git diff "$BASE" -- server/src/vendor/shared/ \| grep -E '^\+.*\.(min\|max\|email\|regex\|int\|uuid)\('` |
| `z.object` → `.strict()` | an added line | `git diff "$BASE" \| grep -E '^\+.*(strictObject\|\.strict\(\))'` |
| Changed default | one `-`/`+` pair inside `.default(...)` | `git diff "$BASE" \| grep -E '^[-+].*\.default\('` |
| New enum member in a **response** | an added line inside `z.enum([...])` | read the `+` lines; direction decides (`semver-discipline`) |
| Changed status code | `reply.code(...)` or a returned status | covered by the HTTP scan above |
| Renamed SSE event | a `-`/`+` pair in `contracts/trace.ts` | `git diff "$BASE" -- server/src/vendor/shared/contracts/trace.ts` |
| **Semantic change** | often no schema diff at all | the only signal is the implementation diff — see below |

### The semantic case

A value whose units, sign, timezone, sort order, or enum meaning changed is a
break that no scan finds: the schema is untouched, the types match, and the
tests pass because they assert a range.

The heuristic that works: when the diff changes an expression that produces a
value crossing a surface, ask whether an unchanged consumer would interpret the
new value the same way. If not, treat it as a rename — a new meaning gets a new
name, and the old name goes through the sequence like any other removal.

```bash
git diff "$BASE" -- server/src/modules/ | grep -E '^[-+].*(score|_at|count|total|ms|seconds|percent)'
```

That grep is a prompt for a human, not a verdict. It exists because these fields
are where the class concentrates.

## Reading a hit

A hit is a candidate, not a finding. Four questions, in order:

0. **Did the shape actually change?** A reflowed `z.enum([...])`, a reordered
   field, a reindented block — each produces a `-` line and changes nothing a
   consumer can observe. Compare the *parsed shape* before and after, not the
   lines:
   ```bash
   git diff "$BASE" --ignore-all-space -- server/src/vendor/shared/
   ```
   If the only difference is layout, stop here. Note that a reflow and a real
   change often arrive in the same hunk — widening an enum while wrapping it
   across three lines is one hunk and two facts. Read the `+` side before
   dismissing anything.

1. **Is the symbol reachable?** A `grep` decides, across every package:
   ```bash
   rg -n --type ts '\bdismissed_at\b' server/src client/src reviewer-core/src e2e
   ```
   A "private" helper re-exported from a barrel is public. A contract in
   `vendor/shared/` is public even with one caller, because the folder exists to
   be copied into another package.

2. **Is it breaking?** `semver-discipline`, and nothing invented here.

3. **Did the diff already handle it?** An expand step plus a marker means the
   procedure is being followed. That is not a finding.

## What detection deliberately does not do

It does not read `client/src/vendor/shared/` as a separate surface. The mirror is
required to be byte-identical and `pr-self-review`'s `check_contract_mirror`
already enforces that; scanning it twice would double every finding.

It also does not treat the mirror being updated as evidence of anything. Both
copies agreeing is necessary and not sufficient — the consumer that breaks is the
deployed client, and it holds neither copy.
