# Slice anatomy: the module folder and when to skip a ring

## The slice is the unit; the ring is the file

`server/src/modules/<feature>/` is one Fastify plugin and one business
capability. Rings live *inside* it as files, not as top-level folders.

This is deliberate. Bogard's objection to layered architecture is that it splits
by technical concern, so a single change touches four folders and nothing is
cohesive. Palermo's objection to pure vertical slices is that without a
dependency rule the business rules get welded to whatever tool is nearest.
Slices give cohesion, rings give direction, and you get both because a slice is
small enough that its rings are just files sitting next to each other.

## The full template

```
modules/<feature>/
  routes.ts       ring 4  HTTP only: schema, call one service method, status
  service.ts      ring 2  use case: orchestrate ports, call domain, no SQL
  domain.ts       ring 1  pure rules — no repo, no db, no fastify imports
  ports.ts        ring 1  interfaces the service depends on
  repository.ts   ring 3  the only file touching Drizzle for these tables
  helpers.ts      pure transforms too small to be rules (row → DTO, url parsing)
  constants.ts    literals: job kinds, secret names, limits
  index.ts        the plugin export registered in modules/index.ts
```

Large slices split a file into a folder rather than growing it — `reviews/` has
`repository/{pull,review,run}.repo.ts` behind `repository.ts`, and
`repo-intel/` has `pipeline/`. Splitting inside a ring is free; splitting
*across* rings is what the dependency rule governs.

## A slice may skip rings — it may not invert them

Skipping is a judgment call about payoff. Inverting is always a defect.

| Slice does | Rings it needs |
|---|---|
| Reads rows, returns DTOs | `routes` → `service` → `repository` |
| Has one non-trivial rule | add `domain.ts` |
| Needs a use-case test without Postgres | add `ports.ts` |
| Calls an external service | reuse a port from `vendor/shared/adapters.ts` |

Even the thinnest slice keeps `repository.ts`. A route that runs its own
`db.select()` has no seam below HTTP at all, which is why the four fat-route
modules in this repo have zero unit tests — there is nothing to call. See
`migration.md`.

## When `domain.ts` earns its place

Move a rule out of `service.ts` the moment any of these is true:

- The same decision appears in a second place (a route *and* a job handler).
- You want to test it without constructing the service.
- Describing it needs the word "because" — thresholds, precedence, eligibility,
  state transitions. `shouldRetry(run, now)`, `rollUpSeverity(findings)`.

Leave it inline when it is one comparison used once. A `domain.ts` containing
`export const isEmpty = (xs) => xs.length === 0` is noise.

The signal that you waited too long: `service.ts` is mostly `if`/`switch` over
data it just loaded, and the test for it needs a database. That is the anemic
domain model, and the fix is to name the rules and move them inward.

## When `ports.ts` earns its place

A port is worth declaring when you want to substitute the implementation. Two
substitutions are real in this repo: **tests** (a fake store instead of
Postgres) and **adapters that already vary** (three LLM providers behind
`LLMProvider`).

Declare only the methods this slice calls. A port with fourteen methods because
the repository has fourteen is not an abstraction, it is a copy — and it makes
every fake painful to write, which is the usual reason people stop writing them.

```ts
export interface RunStore {
  findStale(before: Date): Promise<StaleRun[]>;
  markFailed(id: string, reason: string): Promise<void>;
}
```

Ports for cross-cutting infrastructure already exist in
`server/src/vendor/shared/adapters.ts` — `LLMProvider`, `GitClient`,
`GitHubClient`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider`.
Reuse them; do not declare a second `GitClient` in a slice.

## Naming says the ring, not the pattern

`repository.ts`, `service.ts`, `routes.ts`, `domain.ts`, `ports.ts` are fixed —
the filename is how both a reader and the boundary checker know which rules
apply. Inside those files, name things after the domain: `reapStaleRuns`, not
`RunManagerHelper`; `severity.ts`, not `utils.ts`.

`helpers.ts` is the one deliberately generic name, and it is bounded: pure
transforms, no I/O, no rules with a "because". If `helpers.ts` starts holding
decisions, those decisions belong in `domain.ts`.

## One slice does not import another slice

Cross-slice imports are how a modular monolith quietly becomes a single
tangle — Collina's rule for modular Fastify is that a domain never reaches into
another domain's data.

Three legal ways to share:

1. **Shared row types** — `server/src/db/rows.ts` exposes `$inferSelect` types
   so a slice can name another slice's row without importing its repository.
2. **Shared repositories on the container** — `container.agentsRepo` and
   `container.reviewRepo` exist for entities more than one slice reads.
3. **Contracts** — anything genuinely common goes to ring 0
   (`vendor/shared/contracts/`), which every slice may import.

If you find yourself wanting `import { AgentsService } from '../agents/service.js'`,
the capability belongs to one slice or to ring 0 — not to both.

## The delete test

A slice is correctly bounded if you can delete its folder and remove its line
from `modules/index.ts`, and the only breakage is the routes it served. If
deleting it breaks three other slices, the boundary is in the wrong place.
