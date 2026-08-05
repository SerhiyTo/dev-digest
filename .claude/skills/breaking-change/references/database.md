# Database — the surface with nowhere to put a marker

`deprecation-policy` covers symbols: it hangs a `@deprecated` marker on an
export, a prop, a contract field. A Postgres column has no such place. There is
no editor strikethrough for `reviews.score`, no tsserver warning, and no import
to grep in a `.sql` file.

So the database surface is versioned by **migration number**, and the
announcement is structural rather than textual: the old column exists, the new
column exists beside it, and the gap between the two migration numbers is the
window.

The consumer is also different in kind. It is not a package that can be
recompiled — it is every row already written and every process currently
running. A `DROP COLUMN` cannot be reverted by reverting the commit.

## Migrations in this repo

Forward-only, generated, never hand-edited:

```bash
cd server
# edit src/db/schema/*.ts
pnpm db:generate      # writes src/db/migrations/NNNN_name.sql
pnpm db:migrate
```

`pr-self-review` flags hand-edited generated SQL. An expand and a contract are
therefore two `db:generate` runs producing two files — the pairing is not a
convention you could shortcut even if you wanted to.

## What is safe in one migration

| Change | One migration? | Why |
|---|---|---|
| Add a nullable column | Yes | Old inserts omit it and still succeed |
| Add a column with a default | Yes | Postgres 11+ does not rewrite the table |
| Widen a type (`varchar(50)` → `text`, `int` → `bigint`) | Yes | Every existing row still fits |
| Drop a constraint | Yes | Strictly more writes are accepted |
| Add an index | Yes | Use `CONCURRENTLY` on a live table |
| Backfill without a schema change | Yes | Unless something reads the old values |
| **Add `NOT NULL` with no default** | No | Existing rows violate it; the migration fails or the old server's inserts do |
| **Drop a column** | No | Irreversible, and the old process still writes it during rollout |
| **Rename a column or table** | No | A rename is a drop plus an add, with the same rollout window |
| **Narrow a type** | No | Existing rows may not fit; the migration can fail mid-table |
| **Add `CHECK` / `UNIQUE`** | No | Fails on violating rows, and rejects writes that were valid a minute ago |
| **Change enum values** | No | Postgres cannot drop an enum value without a type rewrite |

## The three recipes

### Rename a column

```sql
-- 0016 expand
ALTER TABLE "reviews" ADD COLUMN "quality_score" integer;
```

Then, in the same expand release, the server writes **both** columns. Backfill
the existing rows, switch every read to the new column (that is the migrate
step, evidenced by grep), and only then:

```sql
-- 0018 contract, separate PR
ALTER TABLE "reviews" DROP COLUMN "score";
```

Three migration numbers, three deploys, one irreversible act at the end when
nothing depends on it.

### Add a required column

`NOT NULL` in one step fails twice over: on existing rows, and on the old
server's inserts during rollout. It is three steps.

```sql
-- 1. nullable
ALTER TABLE "skills" ADD COLUMN "origin" text;
-- 2. backfill, in batches on a large table
UPDATE "skills" SET "origin" = 'manual' WHERE "origin" IS NULL;
-- 3. only after every writer sets it
ALTER TABLE "skills" ALTER COLUMN "origin" SET NOT NULL;
```

Step 3 waits for the writers, not for the rows. A single old process still
inserting `NULL` makes it fail.

A column with a default collapses this to one step and is almost always the
better trade:

```ts
origin: text('origin').notNull().default('manual'),
```

### Add a constraint

Same shape as `NOT NULL`: add it `NOT VALID`, fix the violating rows, then
validate. The intermediate state accepts new writes under the constraint while
old rows are still being cleaned up.

```sql
ALTER TABLE "reviews" ADD CONSTRAINT "score_range" CHECK (score BETWEEN 0 AND 100) NOT VALID;
-- fix rows
ALTER TABLE "reviews" VALIDATE CONSTRAINT "score_range";
```

## Enums

This repo declares enums as `text` with a Drizzle `enum` list rather than as
Postgres enum types:

```ts
type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
```

That is a meaningful advantage — adding a value is a code change with no DDL —
but it moves the whole problem into the type system, where the direction rule
from `semver-discipline` applies unchanged:

- **Adding a value** is safe for what the database accepts, and breaking for
  every consumer that matches the union exhaustively.
- **Removing a value** is breaking in both directions, and the rows holding it do
  not disappear because the type no longer lists them. Migrate the data first,
  then the type.

A value removed from the list while rows still hold it produces a row that fails
to parse on read — the failure surfaces far from the change that caused it.

## Where the schema and the contract disagree

A Drizzle row type and a Zod contract are two surfaces describing the same data,
and only one of them is enforced by the database. `onion-architecture` requires
mapping at the repository boundary precisely so that they can move
independently.

Use that: a column rename does **not** have to become a contract rename. Map the
new column to the old contract field name during expand, and the client is
unaffected by a change that never reached it. Two separate breaks are two
separate sequences; running them together doubles the risk for no gain.

## Before writing the migration

```bash
BASE=$(git merge-base HEAD origin/main)
git diff "$BASE" -- server/src/db/migrations/ \
  | grep -Ei '^\+.*(DROP (COLUMN|TABLE|CONSTRAINT)|RENAME|SET NOT NULL|ALTER COLUMN .* TYPE|ADD CONSTRAINT)'
```

A hit means the PR needs a partner migration and a separate release — or an
explicit statement of why the table is empty. Empty tables are intentional in
this repo, and "no rows exist yet" is a legitimate answer that must be *said*
rather than assumed.
