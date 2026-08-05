# Changelog

Versioning policy for this skill:

- **major** — a default answer reverses, or the ring model changes shape.
- **minor** — a new reference file, a new rule in the ruleset, a new row in the
  default-answers table.
- **patch** — wording, added sources, corrections to the migration inventory.

## 1.0.2 — 2026-08-03

**Added** (from iteration-2 eval evidence)

- `references/persistence.md` — "A rule hidden in a WHERE clause is a rule
  nobody reviews", with the live example from
  `reviews/repository/run.repo.ts`: `reapStaleRunningRuns` has no time
  predicate, so nothing about it is stale. Two agents asked to unit-test it
  both wrote green tests without noticing, and one pinned the missing
  predicate as intended behaviour. Neither the skill nor the ruleset caught
  it — an import graph cannot see inside a query.

**Known bad assertion**

- eval 3's "proposes a consumer-owned transaction port" penalises the correct
  answer. Both runs rightly declined a unit of work: the two repository files
  are query modules composed by one `ReviewRepository` over one `Db`, i.e. a
  split inside ring 3. Rewrite before reusing.

## 1.0.1 — 2026-08-03

**Fixed** (from iteration-1 eval evidence)

- The no-comments rule now names the extraction trap explicitly. Both eval-1
  runs added JSDoc headers to newly extracted files because the neighbouring
  files have them — those headers predate the rule, and matching surrounding
  style was beating the explicit instruction.
- Corrected the ESM claim: `.js` specifiers are the convention on 230 relative
  imports, but `src/db/schema/*` omits the suffix on 52. The skill said
  "everywhere", which would have prompted a wrong "fix".

**Added**

- Three eval prompts (3–5) targeting where the repo offers no example to copy:
  cross-repository transactions, a cross-slice import request, and unit-testing
  a service without Postgres. Iteration-1 showed 19 of 22 assertions passing in
  both configurations because the four healthy modules already model
  routes → service → repository.

## 1.0.0 — 2026-08-03

**Added**

- `SKILL.md` — the router: 17-row default-answers table, the five-ring model and
  the dependency rule, four ordered principles, a file-placement decision tree,
  the enforcement command, a routing table into `references/`, and a dev-digest
  project profile listing the local rules that override generic advice.
- `references/rings.md` — the dependency rule as a statement about imports,
  ring-by-ring contents, why an outer ring may call any inner ring directly, and
  why rings are not folders you must create.
- `references/slice-anatomy.md` — the module folder template, thresholds for
  when `domain.ts` and `ports.ts` earn their place, cross-slice sharing through
  `db/rows.ts` and container repositories, the delete test.
- `references/wiring.md` — ports over the container, constructor injection,
  the composition root, a five-step migration off `constructor(container)`,
  and when `@fastify/awilix` would be warranted.
- `references/fastify.md` — Fastify as the delivery mechanism, four-line
  handlers, `fp()` as the wiring marker, type providers not propagating across
  encapsulated scopes, schema-first validation, error mapping.
- `references/persistence.md` — Drizzle confined to ring 3, row types stopping
  at the repository boundary, the unit-of-work port for cross-repository
  transactions, and when a repository interface does not pay.
- `references/contracts.md` — parse once at the edge, contracts in ring 0,
  the contract/domain/row split, `z.infer` output semantics, branded ids,
  and why business invariants are not Zod's job.
- `references/testing.md` — what each ring lets you test without, hand-written
  fakes over module mocks, `ContainerOverrides` as the outer seam, the
  `*.it.test.ts` convention.
- `references/migration.md` — the nine pre-existing violations with file paths,
  fix order, and which rule flags each.
- `references/examples.md` — ten good/bad pairs drawn from real files.
- `assets/dependency-cruiser.onion.cjs` — 14 rules; new code at `error`,
  documented legacy at `warn`, with a `LEGACY` block to shrink as items land.
- `evals/evals.json` — three eval prompts with behavioural assertions.
- `README.md` — six contested calls with reasoning, 53 sources with type tags
  and dates, unretrievable sources, and the ruleset verification record.

**Verified**

- Ruleset against `server/src`: 0 errors, 35 warnings, 149 modules,
  462 dependencies. Planted violation produced 5 errors on the expected rules.

**Known deliberate divergences**

- From the official `fastify/demo`: its repository factory takes
  `FastifyInstance`; this skill takes the `Db` handle instead, citing Seemann
  and Palermo. The `fp()` + `decorate` + `dependencies` wiring pattern is kept.
- From `fastify-type-provider-zod`'s examples: schemas are declared in
  `vendor/shared/contracts/`, not inline in routes, because they are shared with
  `client/` and `reviewer-core/`.
- From canonical Palermo: rings are files inside vertical slices, not top-level
  folders. Reasoning in `README.md`, decision 1.
