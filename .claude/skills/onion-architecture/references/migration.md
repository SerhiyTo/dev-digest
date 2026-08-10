# Migration: the violations that exist today and how to retire them

This file exists so the skill describes the codebase rather than a fiction. All
of these are known, none of them block new work, and none of them should be
fixed opportunistically in the middle of an unrelated change. Pick one, do it on
its own branch, keep the behaviour identical.

The shipped ruleset marks these `warn` and everything else `error`, so a clean
tree reports **0 errors and 35 warnings**. Any error is something you just
introduced.

## Run the check

```bash
cd server
cp ../.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs \
   .dependency-cruiser.cjs
npx depcruise --config .dependency-cruiser.cjs src
```

`dependency-cruiser@^17` is already a dependency (it also backs
`src/adapters/depgraph/`), so nothing needs installing. Add
`"arch": "depcruise --config .dependency-cruiser.cjs src"` to the scripts if you
want it as `pnpm arch` — note `server/package.json` is `skip-worktree` here, so
coordinate that change.

The config resolves through `tsconfig.json` paths, so it follows
`@devdigest/shared` and `@devdigest/reviewer-core` and checks those too.
`core-stays-pure` currently reports nothing, which is worth knowing: the pure
core really is pure apart from §7.

## 1. Four fat-route modules

`modules/pulls/routes.ts` (366 lines), `modules/settings/routes.ts` (98),
`modules/polling/routes.ts` (68), `modules/workspace/routes.ts` (34) — plus
`modules/settings/feature-models.ts` — import `drizzle-orm` and `db/schema` and
query inside the handler. No service, no repository, no seam below HTTP, which
is why none of them has a unit test.

Order that keeps each step green:

1. Create `repository.ts`. Move the queries verbatim, one method per query,
   keeping the `workspaceId` scope. The handler now calls `repo.x()`.
2. Create `service.ts` taking the repository. Move everything that is not
   request parsing or status selection.
3. Name the rules. In `pulls` the GitHub sync loop is a use case
   (`syncPullsFor(repo)`), and its decisions — which PRs are new, what counts as
   changed — are `domain.ts` material.
4. The handler ends at parse → one call → status.

Do `workspace` first; it is 34 lines and establishes the shape.

Rule: `legacy-fat-routes`.

## 2. `platform/container.ts` imports from `modules/`

`container.ts` imports `AgentsRepository`, `ReviewRepository`, `RepoIntelService`
and `repo-intel/types.ts`, so `platform` depends on `modules` while every module
depends on `platform`. It is the one place where the arrow points outward, and
it is the direct cause of three of the four reported cycles
(`repo-intel/service.ts → container.ts → repo-intel/service.ts` and friends).

Fix: move those constructions to `app.ts` and decorate the instance, or have
each slice publish its own decorator via `fp()`. `wiring.md` covers the
trade-off. Behaviour does not change; `container.agentsRepo` becomes
`app.agentsRepo`.

Rules: `platform-not-to-modules`, `no-circular`.

## 3. Services take the whole container

`repos/service.ts:36`, `agents/service.ts:54`, `repo-intel/service.ts:104`,
`reviews/service.ts:33` are all `constructor(private container: Container)`, and
each then does `new XRepository(container.db)` internally. Ten files import
`platform/container.js` outside the composition root.

This is the service-locator problem: dependencies are invisible at the
constructor and nothing below the container can be substituted. Migrate one
service at a time using the five steps in `wiring.md`. `repos` is the smallest
and cleanest starting point.

`modules/_shared/context.ts` is a borderline case — it is composition-root
helper code used by every `routes.ts`. Either move it under the allowed paths or
change it to take the two things it needs.

Rule: `container-only-in-composition-root`.

## 4. No repository interfaces

Services import concrete repository classes. Add `ports.ts` per slice as part of
step 3 above — only the methods that slice calls, not a mirror of the class.

No rule fires for this; it is what makes §3 worth doing.

## 5. Schema row types outside ring 3

`modules/repos/helpers.ts`, `modules/reviews/diff-loader.ts` and
`modules/reviews/run-executor.ts` import `../../db/schema.js` for its inferred
types. `modules/agents/helpers.ts` imports `AgentRow`/`AgentVersionRow` from its
own `repository.ts`, which makes a cycle because `repository.ts` imports
`isConfigChange` back out of `helpers.ts`.

These are type-only imports, so nothing breaks at runtime — but a pure helper
whose signature is defined by the current migration is not actually pure, and
the cycle is the proof.

Fix: name the type in `db/rows.ts` (which exists for exactly this) or declare
the small shape the helper actually needs. The agents cycle disappears the
moment `helpers.ts` stops importing from `repository.ts`.

Rules: `legacy-schema-types-outside-ring-3`, `no-circular`.

## 6. Duplicated pure logic between `platform/` and `reviewer-core/`

`platform/grounding.ts`, `platform/prompt.ts`, `platform/structured.ts` and
`platform/prompts.ts` shadow `reviewer-core/src/grounding.ts`,
`reviewer-core/src/prompt.ts` and `reviewer-core/src/llm/structured.ts`.

Two copies of the grounding gate is a correctness risk, not just duplication —
the gate is what drops findings that do not cite a real diff line. Determine
which copy is live (grep the call sites), delete the other, and record the
finding in `server/INSIGHTS.md`.

No rule fires for this; duplication is invisible to an import graph.

## 7. A concrete adapter lives inside the pure core

`OpenRouterProvider` is in `reviewer-core/src/llm/openrouter.ts` and is imported
by `platform/container.ts:22`. It is the one thing in that package that
constructs an HTTP client, which makes the "pure core" claim conditional.

Fix: move it to `server/src/adapters/llm/openrouter.ts` and keep `LLMProvider`
(the port) in `vendor/shared/adapters.ts`. Check the CI runner that also
consumes `reviewer-core` before moving — if it needs a provider, it should
construct its own adapter against the same port.

`core-stays-pure` does not flag this, because the import points *into* the core
rather than out of it. The rule catches the worse direction; this one needs a
human.

## 8. A route still parses by hand

`modules/reviews/routes.ts:32` calls `RunRequest.parse(req.body ?? {})` instead
of declaring the schema on the route. That bypasses the validator compiler and
the error handler's 422 mapping. Move it into `schema: { body: RunRequest }` and
give the body a default at the schema level.

## 9. Cross-slice reach-through

`modules/repos/service.ts` imports `INDEX_JOB_KIND` and `REFRESH_JOB_KIND` from
`../repo-intel/constants.js`. `adapters/astgrep/index.ts` and
`adapters/depgraph/index.ts` import `MAX_SIGNATURE_CHARS` / `SUPPORTED_EXT` from
the same file, so two adapters depend on a feature slice.

Job kinds are shared vocabulary — ring 0 or `modules/_shared/`. Adapter limits
belong to the adapter that enforces them.

Rules: `legacy-cross-slice-imports`, `legacy-adapters-to-modules`.

## Ordering

If you are picking one: **§3 on `repos` first.** It is small, it proves the port
pattern, and it is what makes every subsequent use-case test possible. §1 on
`workspace` is the second cheapest. §2 and §7 are structural and best done
together on a quiet branch. §5 is mostly mechanical and removes two cycles. §6
needs investigation before it needs code.

As each one lands, delete its entry from the `LEGACY` block at the top of
`.dependency-cruiser.cjs` so the rule flips from `warn` to `error` and cannot
regress.
