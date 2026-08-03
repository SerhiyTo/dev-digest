# onion-architecture — sources and rationale

This document is not part of the skill payload. It records where the skill's
claims come from, which of them are contested, and how the contested ones were
decided. Research done 2026-08-03; every URL below was fetched, not taken from a
search snippet.

---

## Contested calls and how they were decided

### 1. Rings inside slices, or a global four-layer split?

**Decision: rings inside slices.** `server/src/modules/<feature>/` stays the
top-level unit; the rings are files within it.

A global `domain/ application/ infrastructure/ presentation/` split is the
canonical Palermo shape and it is what most Clean Architecture repos show
(Nikolov's `nextjs-clean-architecture`, `pvarentsov/typescript-clean-architecture`).
It was rejected on two grounds. First, cost: it means rewriting every module,
the static plugin registry and the Fastify encapsulation model, for a benefit
that the ring *direction* already delivers. Second, cohesion: Bogard's vertical
slice argument — that layering by technical concern makes every change touch
four folders and leaves nothing cohesive — is correct, and it is the failure
mode a course codebase is most likely to hit.

The reconciliation is not novel. Graça argues for components as the primary
split with layers inside them; Stemmler's TypeScript structure is subdomains at
the top with use cases and entities inside; the Node.js Best Practices repo
recommends components at the root with `entry-point / domain / data-access`
within. Three independent traditions land in the same place.

### 2. Do we keep repositories at all?

**Decision: yes, always the file; the interface only when a fake is wanted.**

Freestone's 2026 critique is the strongest counter-argument and it is not
wrong: most "repositories" are method grab-bags with no aggregate boundary, and
a typed query builder like Drizzle already gives you most of what the pattern
was invented to provide. His sharpest point — "if your repository needs to take
a `Transaction` parameter, you've lost your abstraction" — is answered in the
skill by Nikolov's unit-of-work port rather than dismissed.

The file stays mandatory anyway for a reason specific to this repo: the
`workspaceId` tenancy scope is only a guard if there is exactly one query path
per table. Four fat-route modules already prove what happens without it. What
the skill does concede to Freestone is that the *interface* in `ports.ts` is
optional until a fake is genuinely wanted — a port with one implementation and
no test double is the decorative kind he is describing.

### 3. Where do Zod schemas belong?

**Decision: contracts in ring 0, parsed once at the route, invariants in ring 1.**

This is the weakest-sourced position in the skill and it is worth being honest
about that: **no authoritative source prescribes where Zod schemas belong in a
layered architecture.** Neither the Zod docs nor Fastify's say anything about
layers, and `fastify-type-provider-zod`'s own examples declare schemas inline in
routes, which fights a shared contracts folder.

The position is assembled: Martin (only simple data structures cross
boundaries), King (parse at the boundary, never shotgun-parse), Bazaglia
(validation in the API layer, before the use case), Stemmler (business
invariants belong to value objects in the domain), Three Dots Labs (each layer
keeps its own structures). The split it produces — Zod proves well-formedness,
ring 1 decides permission — follows from all five without contradicting any.

The repo also forces part of the answer: contracts are already vendored in
`server/src/vendor/shared` and mirrored into `client/`, so ring 0 is where they
physically are.

### 4. Constructor injection versus the existing container parameter

**Decision: constructor injection with named ports; the container is ring 4 only.**

Seemann's *Service Locator is an Anti-Pattern* is the direct citation and it
applies literally — the current `constructor(private container: Container)`
hides every dependency and trades compile-time errors for runtime ones.

Worth noting the official Fastify demo does *not* follow this: its repository
factory takes `FastifyInstance`. The skill deliberately deviates and says so in
`fastify.md`, citing Seemann and Palermo rather than pretending Fastify
recommends it. What the skill keeps from the demo is the `fp()` + `decorate` +
`dependencies: []` wiring pattern, which is genuinely good.

Seemann's *Pure DI* is why the hand-rolled container is treated as a deliberate
choice rather than something to replace with awilix.

### 5. How strict should the enforcement be?

**Decision: `dependency-cruiser` ruleset, pre-existing violations at `warn`.**

The alternative considered was `eslint-plugin-boundaries`, which gives
editor-time feedback and a nicer whitelist model. It lost because the repo has
no ESLint at all, while `dependency-cruiser@^17` is already a dependency (it
backs `src/adapters/depgraph/`), so the ruleset costs nothing to adopt.

Baselining the nine known violations as `warn` rather than adding exceptions
means they stay visible and countable. The instruction in `migration.md` — delete
the entry from `LEGACY` as each one lands, so the rule flips to `error` — is
what stops the baseline from becoming permanent.

### 6. Should the skill require `domain.ts` in every slice?

**Decision: no.** Seemann's *Is Layering Worth the Mapping?* is the honest
counterweight: layering has a real, recurring cost, and a ring that exists to
satisfy a diagram pays it for nothing. Three Dots Labs report explicitly not
refactoring a service that had no meaningful application logic.

The risk of the opposite call is Fowler's anemic domain model — services full of
`if` statements over data, with all the cost of a domain model and none of the
benefit. The skill's compromise is thresholds rather than a mandate: a rule
moves inward when it has a second caller, needs its own test, or has a
"because".

---

## Additional conflicts worth knowing (not decided by this skill)

- **Collina is candid** that separating business logic from HTTP "is very hard
  to actually separate" and that the API contract matters more. The skill quotes
  this rather than hiding it; the rule earns its keep here because `JobRunner`
  is already a second, non-HTTP caller.
- **Trilon's NestJS+Drizzle guidance** deliberately keeps the query builder in
  services. That is a coherent position for a codebase without a second caller
  or a tenancy guard; it is not this codebase.
- **Vitest's own docs** say nothing about preferring injection over `vi.mock`.
  The "hand-written fakes over module mocks" advice in `testing.md` is Seemann's
  and Fowler's, not Vitest's, and is labelled as such.

---

# Sources

Type key: **[O]** official docs / primary source · **[E]** recognized expert ·
**[R]** reference repo or methodology · **[C]** community practitioner

## A. Onion, Clean, Hexagonal — the canon

1. **[O]** Jeffrey Palermo, *The Onion Architecture: Part 1*, 2008-07-29.
   <https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/>
   The origin. "All code can depend on layers more central, but code cannot
   depend on layers further out from the core." "The database is not the center.
   It is external."
2. **[O]** Palermo, *Part 2*, 2008-07-30.
   <https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/>
   Outer classes depend on interfaces defined inward, resolved at the
   composition root. Source for `ports.ts` living in ring 1.
3. **[O]** Palermo, *Part 3*, 2008-08-04.
   <https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/>
   The four tenets, and the relaxation the skill relies on: "any outer layer can
   directly call any inner layer" — no pass-through methods.
4. **[O]** Palermo, *Part 4: after four years*, 2013-08-19.
   <https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/>
   Onion requires neither full DDD nor an IoC container. Supports the "rings must
   earn their place" principle.
5. **[O]** Robert C. Martin, *The Clean Architecture*, 2012-08-13.
   <https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html>
   The Dependency Rule; "the web is a detail, the database is a detail"; only
   "isolated, simple data structures are passed across the boundaries."
6. **[O]** Alistair Cockburn, *Hexagonal Architecture*, 2005-09-04.
   <https://alistair.cockburn.us/hexagonal-architecture/>
   Ports and adapters; the stated intent is testing "in isolation from its
   eventual run-time devices and databases," which is the framing of
   `testing.md`.
7. **[E]** Herberto Graça, *DDD, Hexagonal, Onion, Clean, CQRS — how I put it all
   together*, 2017-11-16.
   <https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/>
   Ports are interface specifications inside the core; components (subdomains)
   are the primary split with layers inside them. Primary source for decision 1.
8. **[E]** Graça, *Onion Architecture*, 2017-09-21.
   <https://herbertograca.com/2017/09/21/onion-architecture/>
   Onion = ports and adapters plus DDD's internal layers.
9. **[E]** Martin Fowler, *Repository* (PoEAA catalog), 2003.
   <https://martinfowler.com/eaaCatalog/repository.html>
   "Mediates between the domain and data mapping layers using a collection-like
   interface." Source for "a repository returns domain objects, not rows."

## B. The counter-arguments

10. **[E]** Jimmy Bogard, *Vertical Slice Architecture*, 2018-04-19.
    <https://www.jimmybogard.com/vertical-slice-architecture/>
    "Minimize coupling between slices, and maximize coupling in a slice."
    Layered abstractions are "appropriate in a minority of the typical requests."
11. **[E]** Derek Comartin, *Restructuring to a Vertical Slice Architecture*,
    2021-09-01.
    <https://codeopinion.com/restructuring-to-a-vertical-slice-architecture/>
    Layering splits by technical concern and yields low cohesion; "things that
    change together belong together."
12. **[E]** Martin Fowler, *AnemicDomainModel*, 2003-11-25.
    <https://martinfowler.com/bliki/AnemicDomainModel.html>
    "They incur all of the costs of a domain model, without yielding any of the
    benefits." The failure mode `domain.ts` exists to prevent.
13. **[E]** Mark Seemann, *Is Layering Worth the Mapping?*, 2012-02-09.
    <https://blog.ploeh.dk/2012/02/09/IsLayeringWorththeMapping/>
    The mapping tax; "if you want layering, the separation must be strict."
    Basis for decision 6.
14. **[E]** Jay Freestone, *You Might Not Need the Repository Pattern*,
    2026-05-23.
    <https://www.jayfreestone.com/writing/you-might-not-need-the-repository-pattern/>
    "If your 'repository' needs to take a `Transaction` parameter, you've lost
    your abstraction." Basis for decision 2 and for the unit-of-work port.
15. **[E]** Three Dots Labs, *Is Clean Architecture overengineering?* (podcast
    transcript, n.d.).
    <https://threedots.tech/episode/is-clean-architecture-overengineering/>
    Not worth it for trivial domains and tiny teams; "scenarios forcing
    unnecessary interfaces with single implementations."
16. **[E]** Miłosz Smółka, *Introducing Clean Architecture*, 2020-09-01
    (updated 2026-02-02).
    <https://threedots.tech/post/introducing-clean-architecture/>
    Production report. "Outer layers can refer to inner layers, but not vice
    versa," and each layer keeps its own data structures so fields evolve
    independently. Source for the contract/domain/row split in `contracts.md`.

## C. Node and TypeScript application

17. **[E]** Khalil Stemmler, *Clean Node.js Architecture*, 2019-06-06.
    <https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/>
    Policy vs detail; interfaces in the domain, concrete adapters in
    infrastructure.
18. **[E]** Stemmler, *Repository, DTO, Mapper*, 2019-06-20.
    <https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/>
    `domain/repositories/IVinylRepo.ts` vs `infrastructure/repositories/VinylRepo.ts`
    plus a mapper; DTOs are the API contract, deliberately decoupled from the DB
    schema.
19. **[E]** Stemmler, *Application-layer use cases*, 2019-06-25.
    <https://khalilstemmler.com/articles/enterprise-typescript-nodejs/application-layer-use-cases/>
    Subdomains at the top level, use cases inside. Precedent for decision 1.
20. **[E]** Stemmler, *Value Objects*, 2019-04-12.
    <https://khalilstemmler.com/articles/typescript-value-object/>
    Business invariants belong to the domain, not to scattered service checks.
    Half of decision 3.
21. **[E]** Alexis King, *Parse, don't validate*, 2019-11-05.
    <https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/>
    "Use a data structure that makes illegal states unrepresentable"; shotgun
    parsing is the anti-pattern. The other half of decision 3.
22. **[R]** Yoni Goldberg et al., *Node.js Best Practices* (continuously
    updated). <https://github.com/goldbergyoni/nodebestpractices>
    Components at the root, `entry-point / domain / data-access` inside; never
    leak `req`/`res` into domain logic.
23. **[E]** Remo H. Jansen (author of InversifyJS), *Implementing the Onion
    Architecture in Node.js with TypeScript*, 2018-04-10.
    <https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad>
    Interfaces in the domain, bindings at the composition root.
24. **[C]** André Bazaglia, *Clean Architecture with TypeScript: DDD, Onion*,
    2019-09-29. <https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/>
    Input validation in the API layer, before the use case runs. The
    "validate at the HTTP edge" position in decision 3.

## D. Fastify

25. **[O]** *Plugins Guide*. <https://fastify.dev/docs/latest/Guides/Plugins-Guide/>
    Encapsulation: changes inside `register` "will not be reflected in the
    context's ancestors"; `fastify-plugin` exists "to avoid this behavior."
    Anything global must be declared in the root scope.
26. **[O]** *Decorators*. <https://fastify.dev/docs/latest/Reference/Decorators/>
    The `dependencies` array is checked "before the server instance boots, not
    during runtime."
27. **[O]** *Type Providers*. <https://fastify.dev/docs/latest/Reference/Type-Providers/>
    "The provider types don't propagate globally" — every encapsulated route
    plugin must re-apply `.withTypeProvider<ZodTypeProvider>()`.
28. **[O]** *Testing*. <https://fastify.dev/docs/latest/Guides/Testing/>
    "Separating concerns makes testing easy"; the `app.ts`/`server.ts` split and
    `inject()`.
29. **[R]** `fastify/demo`. <https://github.com/fastify/demo>
    Official best-practice app. `plugins/external` vs `plugins/app`; repositories
    registered via `fp()` + `decorate` + `dependencies`; handlers contain no SQL.
    Its repository factory takes `FastifyInstance` — the one thing this skill
    deliberately does not copy.
30. **[E]** Matteo Collina, *Building a Modular Monolith with Fastify*, Node
    Congress, 2023-04-14.
    <https://gitnation.com/contents/building-a-modular-monolith-with-fastify>
    Structure by domain, forbid cross-domain database access, "little bits of
    sub-apps." Also the candid admission that separating business logic from HTTP
    is very hard.
31. **[O]** `@fastify/awilix`. <https://github.com/fastify/fastify-awilix>
    The official DI escape hatch: `app.diContainer`, `request.diScope`, lifecycle
    disposal. Its `cradle` is itself a service locator, which is why adopting it
    would not retire the rule.

## E. Drizzle and persistence

32. **[O]** *Drizzle overview*. <https://orm.drizzle.team/docs/overview>
    "Lets you build your project the way you want, without interfering with your
    project or structure"; "if you know SQL, you know Drizzle." The reason it
    belongs at ring 3 and the reason it will not stop you.
33. **[O]** *SQL schema declaration*. <https://orm.drizzle.team/docs/sql-schema-declaration>
    Schema may live in one file or many — "all the freedom." Note honestly: the
    docs do **not** prescribe separating schema from queries. That is this
    skill's addition, argued from Palermo and Fowler.
34. **[O]** *Relational queries*. <https://orm.drizzle.team/docs/rqb>
    The client must be initialised with the whole schema graph — why there is
    exactly one `Db` handle, constructed in the composition root.
35. **[O]** *Goodies*. <https://orm.drizzle.team/docs/goodies>
    `$inferSelect` / `$inferInsert`; the type-level basis for row → domain
    mapping.
36. **[E]** Lazar Nikolov, *Atomic Repositories in Clean Architecture and
    TypeScript*, Sentry blog, 2024-10-03.
    <https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/>
    The best Drizzle-specific source: repository interfaces with "no
    database-related imports allowed," and an `ITransaction` port so use cases
    orchestrate atomicity without importing Drizzle. Source for the unit-of-work
    answer in `persistence.md`.
37. **[R]** Nikolov, `nextjs-clean-architecture`.
    <https://github.com/nikolovlazar/nextjs-clean-architecture>
    Companion repo. Entities / application / infrastructure / interface-adapters
    with Drizzle confined to infrastructure; unit tests use mock repositories
    satisfying application-layer interfaces, no DB.
38. **[C]** Mirsad Halilčević, *NestJS + DrizzleORM: a great match*, Trilon,
    2025-02-20. <https://trilon.io/blog/nestjs-drizzleorm-a-great-match>
    Deliberately keeps the query builder in services — the pragmatic camp this
    skill argues against, included so the disagreement is visible.

## F. Zod and contracts

39. **[O]** Zod v3 documentation. <https://v3.zod.dev/>
    `.brand<T>()`: "plain/unbranded data structures are no longer assignable to
    the inferred type of the schema." And "`z.infer` returns the OUTPUT type."
40. **[O]** `fastify-type-provider-zod`.
    <https://github.com/turkerdev/fastify-type-provider-zod>
    Schema-first route validation and serialization. Version mapping: v4.x → Zod
    3, v5–v6 → Zod 4, v7+ → Zod 4.2+. This repo must stay on `^4`.

## G. Dependency injection

41. **[E]** Mark Seemann, *Service Locator is an Anti-Pattern*, 2010-02-03.
    <https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/>
    Hidden dependencies, runtime failures instead of compile errors, and
    silently breaking changes. The direct citation for banning
    `constructor(container: Container)`.
42. **[E]** Seemann, *Composition Root*, 2011-07-28.
    <https://blog.ploeh.dk/2011/07/28/CompositionRoot/>
    "A DI Container should only be referenced from the Composition Root."
43. **[E]** Seemann, *Pure DI*, 2014-06-10.
    <https://blog.ploeh.dk/2014/06/10/pure-di/>
    Container-free DI is "in many cases better than DI with a DI Container."
    Why the hand-rolled container is treated as a choice, not a shortcut.
44. **[O]** `awilix`. <https://github.com/jeffijoe/awilix>
    PROXY vs CLASSIC modes; the docs note that using the cradle "is actually the
    same as calling `container.resolve()`."
45. **[O]** `tsyringe`. <https://github.com/microsoft/tsyringe>
    Decorator-based DI requiring `reflect-metadata` and `emitDecoratorMetadata`
    — awkward under this repo's ESM + tsx pipeline, and interfaces need explicit
    tokens.

## H. Testing

46. **[E]** Martin Fowler, *TestPyramid*, 2012-05-01.
    <https://martinfowler.com/bliki/TestPyramid.html>
    Broad-stack tests are brittle, slow, expensive and non-deterministic enough
    to "undermine trust." Endorses the subcutaneous tier, which maps onto ring 2.
47. **[O]** Testcontainers for Node. <https://node.testcontainers.org/>
    and the PostgreSQL module
    <https://node.testcontainers.org/modules/postgresql/> —
    `getConnectionUri()`, `snapshot()` / `restoreSnapshot()`.
48. **[O]** Testcontainers, *Global setup*.
    <https://node.testcontainers.org/quickstart/global-setup/>
    "globalSetup runs in a different global scope than test files" — pass
    connection info via `provide`/`inject()`.
49. **[O]** Vitest, *globalSetup*. <https://vitest.dev/config/globalsetup>
    Confirms the same constraint and the `ProvidedContext` typing.
50. **[C]** Nikola Milovic, *Integration testing Node + Postgres with Vitest and
    Testcontainers*, 2025-04-15.
    <https://nikolamilovic.com/posts/integration-testing-node-postgres-vitest-testcontainers/>
    Container per test file, migrations once, `restoreSnapshot()` per test.
    "Never use a different DB for development/testing than what you use in
    production."

## I. Enforcement tooling

51. **[O]** `dependency-cruiser`. <https://github.com/sverweij/dependency-cruiser>
    and the rules reference
    <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>
    `forbidden` / `allowed` / `required` rule schema, severities, `pathNot`
    whitelisting.
52. **[O]** `dependency-cruiser` rules tutorial.
    <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md>
    The capture-group peer-folder pattern
    (`from: '(^features/)([^/]+)/'`, `to: { path: '^$1', pathNot: '$1$2' }`) that
    the skill's `no-cross-slice-imports` rule is built on.
53. **[O]** JS Boundaries (`eslint-plugin-boundaries` v6 docs).
    <https://www.jsboundaries.dev/docs/rules/dependencies/>
    The alternative considered in decision 5: element types by path pattern,
    `default: "disallow"` whitelist mode, capture templating. Rejected only
    because this repo has no ESLint.

---

## Sources that could not be retrieved

- `https://www.answeroverflow.com/m/1147439990683488268` — Drizzle Discord
  thread on typing `db | Transaction` in repository signatures. HTTP 403. This
  likely contains maintainer commentary on exactly the problem `persistence.md`
  answers with a unit-of-work port; worth revisiting.
- `https://github.com/fastify/help/issues/284` — "What is best practice for
  dependency injection?" The issue body was retrievable, maintainer comments
  were not. Retrieve with `gh issue view 284 -R fastify/help --comments`.
- `https://v3.zod.dev/?id=brand` — client-rendered, returned no content. The
  `v3` branch raw README was used instead; cite `https://v3.zod.dev/` for humans.
- `https://github.com/sverweij/dependency-cruiser/blob/main/doc/recipes/README.md`
  — 404, no such directory. The equivalent content is in the rules tutorial.
- `https://github.com/pvarentsov/typescript-clean-architecture` — retrieved, but
  the README states no dependency rule and ships no enforcement, so it is a
  structural example only and is not cited in the skill.
- `dependency-cruiser`'s `real-world-samples.md` — retrieved, but contains no
  onion or layering example, only graph-visualisation configs. Not cited.

## Verification performed

The shipped ruleset was run against `server/src` on 2026-08-03:
**0 errors, 35 warnings, 149 modules, 462 dependencies cruised** — the warnings
being exactly the nine documented migration items. A deliberately planted
violation (a `domain.ts` importing `drizzle-orm`, `fastify` and a sibling
slice's constants) produced 5 errors across `ring-1-domain-stays-pure`,
`ring-2-service-not-to-framework`, `drizzle-only-in-ring-3` and
`no-cross-slice-imports`, then was removed.

`core-stays-pure` reports nothing, which independently confirms
`reviewer-core/`'s purity claim in the direction the graph can see.
