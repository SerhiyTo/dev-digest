---
name: onion-architecture
description: Backend layering and dependency direction for server/ and reviewer-core/ — decides which ring a route, service, repository, domain rule, port, contract or adapter belongs to, and forces dependencies to point inward. Use this skill whenever you add or change a backend endpoint, service, repository or Drizzle query, create a new module under server/src/modules/, wire something into the DI container, write a Zod contract, split a fat route handler, decide whether logic goes in a handler or a service, or answer any "where should this backend code live" question — including layering, ports and adapters, dependency inversion, repository boundaries, transaction handling and what may import what. Trigger it even when the user never says "architecture" and just asks where to put a query or how to structure an endpoint. Complements fastify-best-practices (framework mechanics), drizzle-orm-patterns (query syntax) and postgresql-table-design (schema); this skill owns layering, placement and import direction.
version: 1.0.0
metadata:
  scope: backend
  tags: [onion-architecture, clean-architecture, layering, dependency-inversion, ports-and-adapters, fastify, drizzle, backend]
---

# Onion Architecture

A backend decays in a specific way. A query goes into a handler because it is
two lines. A rule goes next to the query because it is right there. A service
takes the DI container because that is easier than listing what it needs. None
of these is wrong on the day it happens, and after a year the business rules
cannot be run, read or tested without Fastify and Postgres both booted. This
repo is partway down that road already: four route files query Drizzle directly,
and not one service can be constructed in a test.

This skill decides **which ring code belongs to and what may import what**. It
does not cover Fastify mechanics (`fastify-best-practices`), Drizzle query
syntax (`drizzle-orm-patterns`), or table design (`postgresql-table-design`).
For the frontend equivalent of these questions use `frontend-ui-architecture`.

## The default answers

Start here. If your question is on this list you have your answer; the reference
files are for the reasoning and the edge cases.

| Question | Default answer |
|---|---|
| Where does a database query go? | `repository.ts`. Never a route, never a service |
| Where does a business rule go? | `domain.ts` — pure, no repo, no framework imports |
| Where does orchestration go? | `service.ts` — coordinates ports, calls domain, no SQL |
| What does a route handler do? | Parse via schema, call one service method, pick a status |
| Can a service import `FastifyInstance`/`req`/`reply`? | No. Ring 4 only |
| Can a service import `drizzle-orm`? | No. Ring 3 only |
| What does a service take in its constructor? | The ports it uses — never `Container` |
| Where do port interfaces live? | `ports.ts` next to the consumer, or `vendor/shared/adapters.ts` |
| Where do Zod contracts live? | `vendor/shared/contracts/` — ring 0, mirrored to `client/` |
| Where is input validated? | Once, in the route `schema`. Inner rings receive parsed types |
| Where do domain invariants go? | `domain.ts`. Zod checks shape, rules decide permission |
| Can `$inferSelect` row types cross into the domain? | No. Map at the repository boundary |
| How do I do a transaction across repositories? | A unit-of-work port; the Drizzle type stays in ring 3 |
| Can one module import another module? | No. Share via `db/rows.ts`, container repos, or ring 0 |
| Where does the DI container get referenced? | `app.ts` and `routes.ts` only |
| How do I return a 404 from a service? | Throw `NotFoundError`; the error handler maps it |
| Do I always need `domain.ts` and `ports.ts`? | No — add them when they pay. `repository.ts` is never optional |

## The rings

**Source dependencies point inward only.** An outer ring may call any inner ring
directly — no pass-through methods to satisfy a diagram. What is forbidden is an
inner ring naming an outer one.

| Ring | Name | Lives in | May import |
|---|---|---|---|
| 0 | Contracts & pure core | `server/src/vendor/shared/`, `reviewer-core/src/` | `zod`, each other |
| 1 | Domain | `modules/<f>/domain.ts`, `ports.ts` | ring 0 |
| 2 | Use case | `modules/<f>/service.ts` | rings 0–1 |
| 3 | Infrastructure | `modules/<f>/repository.ts`, `src/adapters/*`, `src/db/*` | rings 0–2 |
| 4 | Delivery & composition | `modules/<f>/routes.ts`, `app.ts`, `server.ts`, `platform/container.ts` | everything |

The check that settles any argument: **could rings 0–2 compile with
`src/adapters`, `src/db` and `fastify` deleted?** If not, something inner
imported something outer.

## Four principles that generate the rest

Ordered — earlier ones win when they conflict.

**1. The dependency rule is absolute; the ring count is not.** Which rings a
slice has is a judgment call. Which direction they point is not. Skipping a ring
is a trade-off; inverting one is a defect.

**2. The consumer owns the interface.** A use case declares `RunStore` and the
repository implements it. That single inversion is what lets business rules
outlive the database, and it is why `ports.ts` sits in ring 1 rather than beside
the implementation.

**3. Rings must earn their place.** Empty `domain.ts` files and ports nobody
fakes are the mapping tax without the payoff, and they are how layering gets a
bad name. Add a ring when a rule needs its own test, when a second caller
appears, or when you want to run a use case without Postgres.

**4. Cohesion by slice, direction by ring.** The folder is the feature; the file
is the layer. Splitting by technical concern across the whole tree gives four
folders per change and nothing cohesive — which is the vertical-slice objection,
and it is correct. Slices answer it; rings keep the slices from welding
themselves to their tools.

## Deciding where a new file goes

```
Is it SQL / Drizzle?                 → repository.ts, always
Is it an external service call?      → src/adapters/, behind a port in vendor/shared
Is it a decision with a "because"?   → domain.ts  (thresholds, eligibility, precedence)
Is it a pure transform, no rule?     → helpers.ts (row → DTO, url parsing)
Is it orchestration?                 → service.ts (load, decide, persist, emit)
Is it request/response shaped?       → routes.ts  (schema, one call, status code)
Is it a type crossing the wire?      → vendor/shared/contracts/  + mirror to client/
Is it an interface a service needs?  → ports.ts   (only the methods it calls)
Is it constructing a concrete class? → app.ts or routes.ts — the composition root
```

The trap at nearly every branch is that the outer ring is closer to hand. The
query is right there in the handler; the container is right there in the
constructor. Both cost nothing today and remove the seam you need later.

## Enforcing it

`assets/dependency-cruiser.onion.cjs` encodes the rules above as a
`dependency-cruiser` ruleset. `dependency-cruiser` is already a dependency of
`server/`, so this costs nothing to run:

```bash
cd server
cp ../.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs \
   .dependency-cruiser.cjs
npx depcruise --config .dependency-cruiser.cjs src
```

Rules covering new code are `error`; the nine documented pre-existing violations
are `warn` and each names its section in `references/migration.md`. A clean tree
reports **0 errors and 35 warnings**, so any error is something you just
introduced. Satisfying this ruleset is the definition of done for backend work —
not a code reviewer noticing.

## Where to read more

Read a reference when you need the reasoning, an edge case, or you are about to
argue with the table above.

| Read this | When |
|---|---|
| `references/rings.md` | The dependency rule, what belongs in each ring, why an outer ring may skip inward |
| `references/slice-anatomy.md` | The module folder template, when a ring earns its place, cross-slice sharing, the delete test |
| `references/wiring.md` | Ports, constructor injection, the composition root, migrating a service off `Container` |
| `references/fastify.md` | Thin handlers, plugin encapsulation, `fp()`, type-provider scope, error mapping |
| `references/persistence.md` | Drizzle at ring 3, row vs domain types, the transaction port, when a repository does not pay |
| `references/contracts.md` | Zod placement, parse-once, branded ids, contract vs domain vs row types |
| `references/testing.md` | What each ring lets you test without, fakes vs container overrides, `*.it.test.ts` |
| `references/migration.md` | The eight known violations, in what order to retire them, how to run the check |
| `references/examples.md` | Good/bad pairs drawn from real files in this repo |

Sources, dates and the reasoning behind every contested call are in `README.md`.
Several of these questions have credible experts on both sides — the README says
who disagrees and why this skill chose what it chose.

## Project profile: dev-digest

The rings above are general. This is how they map onto the two backend packages.
`server/CLAUDE.md`, `server/INSIGHTS.md` and `reviewer-core/CLAUDE.md` win if
they ever contradict this file.

| Kind | Location |
|---|---|
| Feature slice | `server/src/modules/<name>/` — one Fastify plugin, registered in `modules/index.ts` |
| Ports for external systems | `server/src/vendor/shared/adapters.ts` |
| Zod contracts | `server/src/vendor/shared/contracts/` |
| Adapters | `server/src/adapters/<kind>/` |
| Composition root | `server/src/app.ts` + `server/src/platform/container.ts` |
| Pure review engine | `reviewer-core/src/` — ring 0, imports `zod` and `@devdigest/shared` only |
| Cross-slice row types | `server/src/db/rows.ts` |

**Local rules that override the generic advice.**

- **No comments in new code** (root `CLAUDE.md`). Intent goes in names and
  types; "why" goes to the module's `specs/` or `INSIGHTS.md`.
  The trap is extraction: `service.ts`, `domain.ts` and `repository.ts` pulled
  out of an existing file are *new* files, and the JSDoc headers on their
  neighbours were written before this rule existed. Do not copy that style
  across — matching the surrounding code loses to the explicit rule here. Leave
  comments in place only in code you are not rewriting.
- ESM `.js` import specifiers on relative imports (230 of them). The exception
  is `src/db/schema/*`, which omits the suffix — match the file you are in
  rather than "fixing" either side.
- Contracts in `server/src/vendor/shared/` are canonical and must be **mirrored
  to `client/src/vendor/shared/` in the same commit**.
- Schema changes go `src/db/schema/*.ts` → `pnpm db:generate` → `pnpm db:migrate`.
  Never hand-edit generated migration SQL. Empty tables are intentional.
- Secrets only through `SecretsProvider`. Never `process.env` in feature code;
  `platform/config.ts` deliberately excludes secret keys.
- DB-backed tests are named `*.it.test.ts` — the CI lanes select on it.
- Modules are registered statically, not via `@fastify/autoload`, so the same
  code path works under tsx, the bundler and vitest.
- Pin `fastify-type-provider-zod@^4`; v5+ requires Zod 4 and this repo is Zod 3.
- `reviewer-core/` purity is a hard contract: never import DB, fs, GitHub or
  server code there. Everything external arrives injected.
- Before implementing a feature, check `server/specs/` for its spec.
- Nine known violations exist and are documented — read `references/migration.md`
  before concluding the codebase disagrees with this skill.
