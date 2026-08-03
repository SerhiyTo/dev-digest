# Contracts: where Zod lives and what crosses a boundary

## Parse once, at the edge

Alexis King's framing is the useful one: a parser turns less-structured input
into more-structured output, and the anti-pattern is *shotgun parsing* —
validation smeared across every layer because no layer trusts the previous one.

So: **Zod runs in the route `schema`, and inner rings receive already-parsed
types.** A service that re-runs `Contract.parse()` on its own argument is
telling you the type it declared is a lie. Fix the type, not the parse.

The reverse mistake is worse and quieter: a service that accepts `unknown` or a
loose `Record<string, string>` because "the route already checked." Declare the
narrow type; the route's schema is what makes it true.

## Contracts are ring 0

`server/src/vendor/shared/contracts/*.ts` holds the Zod schemas, and
`vendor/shared/adapters.ts` holds the port interfaces. Both are the innermost
ring: they depend on `zod` and on nothing else in this repo.

That placement is what lets `reviewer-core/` and `client/` both import them
without importing the server. It also means a change here is a change to three
packages — **anything edited in `server/src/vendor/shared/` must be mirrored to
`client/src/vendor/shared/` in the same commit.**

There is no authoritative source that prescribes where Zod schemas belong in a
layered architecture; this placement follows from Martin (only simple data
structures cross boundaries), King (parse at the boundary), and Three Dots Labs
(each ring keeps its own structures). `README.md` records that reasoning.

## Three kinds of type, three homes

| Kind | What it is | Home |
|---|---|---|
| Contract / DTO | The wire shape the client can rely on | ring 0, `vendor/shared/contracts/` |
| Domain type | What a rule operates on | ring 1, `domain.ts` |
| Row type | What a table looks like today | ring 3, `repository.ts` / `db/rows.ts` |

They are frequently identical at the start, and that is fine — do not write
three copies and a mapper on day one just to have the layers. Split them when
they start to diverge, which they do at predictable moments: a column is added
that the API must not expose, the wire needs a computed field, a rule needs a
narrower type than the table can express.

The conversion happens in `helpers.ts` (`toRepoDto`), not in the route and not
in `domain.ts`.

## `z.infer` gives you the output type

With `.transform()` in a schema, `z.input` and `z.output` differ, and
`z.infer` is the **output**. This matters at a boundary: the handler receives
post-transform data, and `fastify-type-provider-zod` serializes the response
against the output type too. If a contract transforms, be explicit about which
side you mean rather than letting `z.infer` decide for you.

Async refinements force `parseAsync`, which the route schema path does not use —
keep contracts synchronous.

## Branded primitives keep unparsed strings out of ring 1

`.brand<T>()` makes a type nominal: an unbranded `string` is no longer
assignable to `RepoId`. Branding is static only — it changes nothing at runtime,
and you can only obtain a branded value by parsing.

```ts
export const RepoId = z.string().uuid().brand<'RepoId'>();
export type RepoId = z.infer<typeof RepoId>;
```

Now `getReviewsFor(id: RepoId)` cannot be called with a raw request string, and
the compiler enforces "parse at the edge" instead of a code review doing it.

Use it where a mix-up is plausible and would be silent: ids of different
entities, tokens, workspace scoping. Do not brand every string — the cost is
real (every construction site needs a parse) and for a `title` the payoff is
nothing.

## Domain invariants are not Zod's job

Zod checks *shape and format*: is this a UUID, is this one of three enum values,
is this number non-negative. That is a boundary concern and it is complete at
the edge.

*Business* invariants — this run may not be marked failed after it succeeded,
this severity roll-up ignores unknown values, this budget is exceeded — are
rules, and rules live in `domain.ts`. Trying to express them as Zod refinements
drags business logic into ring 0, where it becomes visible to the client
package.

The clean division: Zod proves the input is well-formed; ring 1 decides whether
it is allowed.

## Contract evolution is append-only in some places

`run_traces.trace` is frozen jsonb, so any new `RunTrace`/`RunStats` field must
be `.nullish()` — old rows will not have it. `server/specs/` records this
convention per feature; check the spec for the feature before changing a
contract.

More generally: contracts are the thing three packages agreed on. Widening
(adding an optional field) is cheap; narrowing or renaming is a coordinated
change across `server/`, `client/` and `reviewer-core/` in one commit.
