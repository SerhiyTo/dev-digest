# Wiring: ports, constructor injection, and the composition root

## The container is a ring-4 object

`server/src/platform/container.ts` builds concrete adapters from config and
secrets. That is composition, and composition is the outermost ring's job.

The rule that keeps it honest is Seemann's: **a DI container may be referenced
only from the composition root.** In this repo that means `app.ts` and each
slice's `routes.ts`. Anything else importing `Container` has turned it into a
service locator.

## Declare ports, not the container

This is the single highest-value change the skill asks for, so it is worth
being precise about why.

```ts
export class ReviewService {
  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
  }
}
```

Two separate problems. First, the constructor tells you nothing — the
dependencies are hidden inside method bodies, so adding one is invisible at
every call site and the compiler cannot help. Seemann's point in *Service
Locator is an Anti-Pattern* is exactly this: you trade compile-time errors for
runtime ones. Second, `new ReviewRepository(...)` inside the constructor means
there is no seam at all: you cannot substitute the repository even if you want
to, so every test needs a real Postgres.

```ts
export class ReviewService {
  constructor(
    private readonly runs: RunStore,
    private readonly llm: LLMProvider,
    private readonly clock: Clock,
  ) {}
}
```

Now the constructor is the dependency list, adding one breaks compilation at
every call site (which is the point), and a test passes three small fakes.

## `ports.ts` holds the interfaces, ring 3 holds the implementations

The interface belongs to the consumer, not the provider — this is what makes the
dependency arrow point inward. `ports.ts` (ring 1) declares `RunStore`;
`repository.ts` (ring 3) declares `class RunRepository implements RunStore`.
The service imports the interface and never the class.

Keep the port to the methods this slice actually calls (`slice-anatomy.md`
explains why a mirror-image port is worse than none).

## The composition root is `app.ts` plus each `routes.ts`

`routes.ts` is allowed to reach into the container because it *is* part of the
root:

```ts
export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ReviewService(
    new RunRepository(app.container.db),
    await app.container.llm('openrouter'),
    systemClock,
  );
  ...
}
```

Everything concrete is named in one place, per slice, and everything below is
substitutable. If a slice's construction grows past a handful of lines, move it
into a `fastify-plugin`-wrapped plugin that decorates the instance — that is the
pattern `fastify/demo` uses, and `fp()` is precisely the marker for "this is
wiring, publish it to the parent scope."

## The container must not import from `modules/`

`platform/container.ts` currently imports `AgentsRepository`,
`ReviewRepository` and `RepoIntelService`. That makes `platform` (inner
infrastructure) depend on `modules` (slices), which is a cycle and the one place
where the arrow in this repo points outward.

Two ways out, both fine:

- Construct these in `app.ts` and decorate the instance with them, so the
  composition root — not the container — knows about slices.
- Have each slice register its own decorator via `fp()`, so `agents` publishes
  `app.agentsRepo` itself and no central file lists them.

Prefer the second when the slice is the only owner; prefer the first for things
several slices share.

## Migrating a service off the container

Do it one service at a time; nothing else has to change while you do.

1. Add `ports.ts` with the interfaces the service actually uses.
2. Change the constructor to take those ports. Keep the method bodies identical.
3. In `routes.ts`, construct the dependencies from `app.container` and pass them
   in. The container is still doing the work — it just stopped being a
   parameter.
4. Delete `private container: Container` and let the compiler find the
   leftovers.
5. Write one unit test with fakes. If that test is awkward, the port is wrong,
   not the test.

`ContainerOverrides` stays useful for adapter-level substitution in integration
tests; this change is about the layer *below* it.

## When to reach for `@fastify/awilix`

The hand-rolled container is a deliberate choice, not a shortcut — Seemann calls
this Pure DI and argues it is often better than a container library. Keep it.

Revisit only on concrete pressure: you need request-scoped instances, or
lifecycle disposal, or the wiring in `app.ts` has become genuinely hard to read
(the usual threshold people report is a few dozen services). `@fastify/awilix`
is the official escape hatch and gives `app.diContainer` plus `request.diScope`.
Note that awilix's `cradle` is itself a service locator, so adopting it does not
remove the rule above — it just moves where you have to enforce it.
