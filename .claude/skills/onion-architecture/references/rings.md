# Rings: the dependency rule and what lives in each

## The rule is about imports, not calls

Onion has exactly one hard rule, and it is a statement about the `import`
graph: **source dependencies point inward only.** Ring 1 may not name ring 3.
Ring 3 may name ring 1 freely.

At runtime the arrows go both ways — a use case obviously ends up executing SQL.
That is fine, and it is the whole point: the call goes out through an interface
the *inner* ring declared, so the inner ring never learned the name of the thing
implementing it. Palermo's phrasing: "inner layers define interfaces, outer
layers implement interfaces."

The practical consequence is a test: **can you compile and run ring 0–2 with
`server/src/adapters`, `server/src/db` and `fastify` deleted from disk?** If yes,
the rule holds. If not, something inner imported something outer.

## Ring 0 — contracts and pure core

`server/src/vendor/shared/` and `reviewer-core/src/`.

Zod contracts, the port interfaces in `vendor/shared/adapters.ts`, and the
review engine. May import `zod` and each other; may import nothing else from
this repo. `reviewer-core/CLAUDE.md` already states this as "purity is the
contract" — the ring model just names why.

Ring 0 is shared across packages, so a change here is a change to `client/` too.
Everything in `vendor/shared/` must be mirrored to `client/src/vendor/shared/`
in the same commit.

## Ring 1 — domain

`modules/<feature>/domain.ts`, `modules/<feature>/ports.ts`.

The rules that would still be true if this were a CLI instead of an HTTP API:
what makes a review score a blocker, when a run counts as stale, how a severity
rolls up. Pure functions and plain types. No `async` unless the rule genuinely
needs it — a domain function that awaits is usually a use case in disguise.

`ports.ts` holds the interfaces this slice's use case depends on
(`ReviewStore`, `Clock`, `DiffSource`). They live here, not next to the
implementation, because the consumer owns the interface. That is the inversion.

Ring 1 imports ring 0 and nothing else. Not `drizzle-orm`, not `fastify`, not
`../../platform/container.js`, not a sibling slice.

## Ring 2 — use case

`modules/<feature>/service.ts`.

Orchestration: load, decide, persist, emit. It coordinates ports and calls into
ring 1 for the actual decisions. It knows there is a store; it does not know the
store is Postgres.

Two things do not belong here. **SQL** — that is ring 3. **`req`/`reply`** —
that is ring 4. A service that reads a header or sets a status code has absorbed
its caller's job, and the moment a second caller appears (a job handler, a CLI,
a test) that decision has to be undone.

Watch for the anemic-model failure here: if `service.ts` grows into a pile of
`if` statements over data with no `domain.ts` in sight, you have a transaction
script wearing a layered costume. That is Fowler's anemic domain model — you
paid for the structure and got none of the benefit.

## Ring 3 — infrastructure

`modules/<feature>/repository.ts`, `src/adapters/*`, `src/db/*`.

The implementations of ring 1's interfaces plus everything that talks to the
outside world: Drizzle, Octokit, simple-git, ripgrep, the LLM SDKs. This is
where a vendor's types are allowed to appear, and the only place.

A repository is scoped to one aggregate and is the sole writer of its tables.
`RepoRepository` is the only file that touches `repos`; that is what makes the
`workspaceId` tenancy guard actually a guard rather than a convention.

## Ring 4 — delivery and composition

`modules/<feature>/routes.ts`, `app.ts`, `server.ts`, `platform/container.ts`.

The HTTP shell and the wiring. Routes parse, call one service method, map the
result to a status code. The container constructs concrete classes and hands
them to services. Both are allowed to know about everything, because their whole
job is knowing about everything — and there is exactly one of each, so the
knowledge is contained.

Nothing may import `platform/container.ts` except ring 4. The moment a service
imports the container, every dependency in the system becomes invisible at the
constructor and the compiler stops helping you (Seemann, *Service Locator is an
Anti-Pattern*).

## An outer ring may call any inner ring directly

Ring 4 → ring 2 is normal. Ring 4 → ring 1 is fine when a route needs a pure
formatter. You do not need a service method whose body is
`return this.domain.x(a)` just to satisfy a diagram — Palermo explicitly
relaxed this, and the pass-through method is pure cost.

What you may not do is skip *inward*: ring 2 must not reach ring 3's concrete
classes, and ring 1 must not reach anything outward at all.

## Rings are not folders you must create

A slice that lists rows and returns them has no rules to put in `domain.ts` and
no second implementation to justify `ports.ts`. Creating empty files to look
compliant produces the mapping tax Seemann warns about with none of the payoff.

Add a ring when it starts paying: `domain.ts` when a rule appears in more than
one place or needs its own test; `ports.ts` when you want to test the use case
without Postgres, or when a second implementation is real. See
`slice-anatomy.md` for the thresholds.
