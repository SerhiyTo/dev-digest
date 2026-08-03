# Fastify: keeping the framework in ring 4

## Fastify is the delivery mechanism

Martin's phrasing is the one to hold onto: "the web is a detail." An HTTP route
is one way to reach a use case; a job handler, a CLI and a test are others. The
moment a use case knows about `req`, those other callers stop being possible.

So the boundary is concrete: **`FastifyInstance`, `FastifyRequest`,
`FastifyReply` and the `fastify` import appear only in ring 4** — `routes.ts`,
`app.ts`, `server.ts`, and `fp()` wiring plugins.

Collina is honest that this separation "is very hard to actually separate" in
practice, and he is right that the API contract matters more than purity. The
rule earns its keep anyway, because in this repo the second caller already
exists: `JobRunner` invokes the same logic with no HTTP anywhere in sight.

## A handler does four things

Parse (via schema), call one service method, choose a status code, return. If a
handler is doing a fifth thing, that thing belongs inward.

```ts
app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
  const { workspaceId, userId } = await getContext(app.container, req);
  const { repo, created } = await service.add(workspaceId, userId, req.body.url);
  reply.status(created ? 201 : 200);
  return repo;
});
```

`modules/repos/routes.ts` is the reference shape in this repo. Note the service
returns `{ created }` rather than a status code — the *decision* is a rule, the
*HTTP encoding of it* is delivery. That split is what lets a job handler reuse
`add()`.

The counter-example is `modules/pulls/routes.ts`: 366 lines, `drizzle-orm`
imported at the top, a GitHub sync loop inline in the handler. Nothing under it
can be called or tested. See `migration.md`.

## Encapsulation is the slice boundary; `fp()` is the wiring marker

`register()` creates an isolated context — decorators added inside are invisible
to the parent and to siblings, visible to children. `fastify-plugin` exists to
deliberately break that, publishing to the parent scope.

That gives a clean convention:

- **Bare plugin** (`export default async function xRoutes(app)`) = a feature
  slice. It consumes what the root provides and adds nothing globally.
- **`fp()`-wrapped plugin** = composition-root wiring. It decorates the instance
  so other slices can use the thing.

Anything every part of the app needs must be declared in the root scope — that
is why `app.decorate('container', container)` happens in `app.ts` before any
module registers, and why the error handler is installed before modules so
encapsulated plugins inherit it.

`fp()` takes a `dependencies: ['x']` array that Fastify checks **at boot, not at
runtime**. Use it on wiring plugins; a missing dependency then fails startup
instead of failing the first request that needs it.

## Type providers do not propagate across scopes

`.withTypeProvider<ZodTypeProvider>()` remaps the *current* context only. Every
encapsulated route plugin must re-apply it:

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
```

Forgetting this does not throw — you silently lose the inferred `req.body` type
and get `unknown`, which people then paper over with a cast or a manual
`Schema.parse()`. That is how re-parsing creeps back into handlers.

Pin `fastify-type-provider-zod@^4` here: v5+ targets Zod 4 and this repo is on
Zod 3.

## Validation belongs in the route `schema`, not in the handler body

`app.setValidatorCompiler(validatorCompiler)` in `app.ts` makes the Zod contract
drive both request validation and response serialization. Declaring the schema
means the framework parses before your code runs, and the error shape is
uniform.

A handler that calls `Contract.parse(req.body)` itself is doing the framework's
job and bypasses the error handler's 422 mapping — `modules/reviews/routes.ts`
still does this and should not. See `contracts.md` for why parsing exactly once,
at the edge, is the whole point.

## Errors are thrown inward and mapped outward

Ring 1–3 throw the typed errors from `platform/errors.ts` — `NotFoundError`,
`ValidationError`, `ExternalServiceError`. They carry meaning, not status codes.

`app.setErrorHandler` in `app.ts` is the single place that turns them into HTTP:
`AppError` → its `statusCode`, `ZodError` → 422, serialization failure → 500,
everything else → 500, always wrapped as `{ error: { code, message, details } }`.

A service that constructs a 404 response has reached outward. A service that
throws `NotFoundError` has not, and the same throw works unchanged when the
caller is a job.

## Modules register statically

`modules/index.ts` is a static registry, not `@fastify/autoload`, because native
dynamic `import()` of `.ts` files is not portable across tsx, the bundler and
vitest. Adding a slice means adding a line there. Keep it that way.

## What this buys in tests

Because `app.ts` exports `buildApp()` separately from `server.ts`'s `listen()`,
`app.inject()` runs the full plugin stack with no socket — the official Fastify
testing guidance. And because services take ports rather than the instance, the
layer below can be tested with no Fastify at all. See `testing.md`.
