# Persistence: Drizzle at ring 3 and nowhere else

## Drizzle is honest about being a detail

Drizzle's own docs say it "lets you build your project the way you want, without
interfering with your project or structure," and that "if you know SQL, you know
Drizzle." It is a typed SQL layer, not a domain model — which is exactly why it
belongs in the outer ring, and exactly why it will not stop you putting it
anywhere. The discipline has to come from you.

Palermo's original motivation was that data-access technology churns while
business rules do not. That is not hypothetical here: this repo has already
lived through a schema barrel, a `rows.ts` extraction, and eleven migrations.

**The rule: `drizzle-orm` and `db/schema` may be imported by `repository*.ts`,
`src/db/*`, and infrastructure in `src/platform/` (the `JobRunner` owns the
`jobs` table). Nowhere else.**

## The repository is the only writer of its tables

One repository per aggregate, and it owns those tables completely.
`RepoRepository` is the only file touching `repos`; that is what turns the
`workspaceId` scope from a convention into an actual tenancy guard, because
there is no second query path that could forget it.

```ts
export class RepoRepository {
  constructor(private db: Db) {}

  async getById(workspaceId: string, id: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row;
  }
}
```

The constructor takes `Db`, not `Container` and not `FastifyInstance`. The
official `fastify/demo` passes `FastifyInstance` into its repository factory;
that is one layer of leak this skill deliberately does not copy — keep the
`fp()` + `decorate` wiring, take the handle.

## Row types stop at the repository boundary

`$inferSelect` gives you the shape of a table. That shape is a database
artifact: it changes when you add a column, it is `snake_case` mapped, and it
carries nullability that only exists because of a migration ordering.

Three Dots Labs' rule from a production system is the one to follow: **each ring
keeps its own data structures**, so fields can evolve independently. Concretely:

- `RepoRow` (`$inferSelect`) is fine *inside* `repository.ts`.
- The service receives either the row or a slice type — but the moment a rule in
  `domain.ts` needs it, map it. `domain.ts` naming a Drizzle-inferred type
  re-couples ring 1 to the schema.
- What crosses the HTTP boundary is the Zod contract from ring 0, produced by a
  mapper in `helpers.ts` (`toRepoDto`). Never serialize a row directly.

`server/src/db/rows.ts` exists so a slice can name another slice's row type
without importing its repository. Use it; do not add a cross-slice repository
import.

## Transactions cross repositories through a port

This is the strongest objection to the whole pattern, and it deserves a real
answer. Freestone's version: "if your repository needs to take a `Transaction`
parameter, you've lost your abstraction" — because now the caller holds a
Drizzle type and the interface was decorative.

The answer (Nikolov's, and it works): the use case gets a **transaction port**
that exposes only what a use case can meaningfully do, and the Drizzle
transaction type never leaves ring 3.

```ts
export interface UnitOfWork {
  run<T>(work: (tx: SliceStores) => Promise<T>): Promise<T>;
}
```

Ring 3 implements it over `db.transaction`, handing the callback a set of
stores already bound to the transaction. The service writes
`await this.uow.run(async ({ runs, findings }) => { ... })` and imports nothing
from Drizzle.

Do not build this before you need it. A single-repository write does not need a
unit of work; `db.transaction` inside one repository method is correct and
simpler.

## When the repository does not earn its place

Freestone's critique lands when a "repository" is a grab-bag of query methods
with no aggregate boundary — at that point it is an indirection tax with no
substitution benefit, and reading `db.select()` directly would be clearer.

The honest test: **if the only consumer is one service and you would never write
a fake for it, the port is decorative.** Keep the repository file (it is what
makes tenancy and table ownership checkable) but skip the interface in
`ports.ts` until a fake is genuinely wanted.

What is *not* an acceptable simplification is putting the query in `routes.ts`.
That removes the seam entirely rather than removing an abstraction.

## A rule hidden in a WHERE clause is a rule nobody reviews

The failure this ring separation is really guarding against is subtler than a
query in a handler. When a decision lives in SQL, it stops looking like a
decision — nobody unit-tests it, and a reviewer reads the method name instead of
the predicate.

`reviews/repository/run.repo.ts` has a live example. `reapStaleRunningRuns` sets
`status = 'failed'` on every row where `status = 'running'` — there is no time
threshold anywhere, so nothing about it is actually *stale*. It happens to be
defensible because `app.ts` calls it once at boot, when a running row really is
orphaned. But the name promises a rule that does not exist, and
`ReviewService.reapStaleRuns()` is a one-line delegation, so there is nothing to
test and nothing to read.

Two agents asked to unit-test that method both wrote green, fast tests without
noticing. One of them pinned the missing predicate as intended behaviour.

So when a repository method name contains a judgement — `stale`, `expired`,
`eligible`, `active`, `orphaned` — check whether the judgement is in the WHERE
clause. If it is, the query may return the *facts*; the *rule* belongs in
`domain.ts` where it has a name, a test, and a reason.

## The `Db` handle is constructed once

Drizzle's relational queries require the client to be initialised with the whole
schema graph, so there is exactly one `createDb()` call and the handle is passed
down. Never construct a second one, and never import a module-level singleton
into a slice — `db/client.ts` returns a handle, `app.ts` owns it, and
`onClose` closes it.

## Schema changes have one path

Edit `src/db/schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate`. Never
hand-edit a file in `src/db/migrations/` — they are generated and already
applied to existing databases. Migrations are not run on boot.

The schema deliberately contains every table up front, including empty ones for
later course lessons. Do not delete them.

## Aggregates and NULL semantics in this repo

Two things `server/INSIGHTS.md` records that a rule in `domain.ts` must respect:
`findings.severity` is plain `text` with no enum or CHECK, so any roll-up has to
tolerate unknown values; and `findings` has no `pr_id`, so per-PR aggregates
join through `reviews` and must stay NULL-preserving rather than coercing with
`?? 0`. Read that file before writing an aggregate.
