# Placement: folders, boundaries, import direction

## Organize by feature, not by file type

A `components/` + `hooks/` + `utils/` split at the root scales badly for one
reason: changing one feature makes you edit four folders, and reading one
feature makes you open four folders. Group by what the code is *for* instead.

```
✅  app/repos/[repoId]/pulls/
      page.tsx  constants.ts  helpers.ts  styles.ts
      _components/FilterBar/  PRRow/  FindingsHoverCard/

❌  components/FilterBar.tsx
    components/PRRow.tsx
    hooks/usePullFilters.ts
    utils/pullHelpers.ts
    constants/pulls.ts
```

Type-folders are fine *inside* the shared layer, where there is no feature to
group by — that is what `src/lib/` and `src/components/` are.

Josh Comeau argues the opposite (keep a flat `components/`, because feature
boundaries go stale as products change). It is a real argument and worth knowing,
but the majority position and this repo both go the other way. See `README.md`.

## The delete test

The fastest way to check whether a boundary is real:

> Pick a feature folder. Imagine deleting it. How much else breaks?

If deleting one feature breaks five others, the boundary leaked and the code is
feature-shaped only on the surface. Nothing outside a feature should depend on
its internals — only on what its `index.ts` exports.

## Promotion and demotion

Code moves in both directions, and the trigger is concrete:

- **Promote** when a *second, unrelated* module needs it. Not when you suspect
  it might. Two callers inside the same feature is not a promotion signal.
- **Demote** when something in the shared layer turns out to have one consumer.
  It is not shared; it is misplaced, and living in shared makes people assume
  changing it is dangerous.

This is why starting local is cheap and starting shared is expensive: promoting
is a file move, while unwinding a shared abstraction that three features shaped
differently is a refactor.

## Dependency direction

```
shared  →  feature  →  route / page
```

- Shared code knows nothing about any feature.
- A feature never imports another feature. If two features need the same thing,
  that thing belongs in shared; if they need each other's *behaviour*, compose
  them one level up, at the route.
- Routes may import anything below them.

Cross-feature imports are the failure that turns a codebase into a graph you
cannot delete from. When one appears, you have three honest options: hoist the
shared piece up, compose at the route level, or admit the two features are one
feature and merge them. Sneaking the import in is the only wrong answer.

Teams that care can enforce this mechanically with ESLint
`import/no-restricted-paths`, which is what Bulletproof React recommends.

## Public API per folder

Every component or feature folder exposes an `index.ts`. Everything else in the
folder is an implementation detail you can rename, split or delete without
touching a single caller.

```ts
// AgentCard/index.ts
export { AgentCard } from "./AgentCard";
export type { AgentCardProps } from "./AgentCard";
```

The value is not shorter imports — it is that `helpers.ts` and `constants.ts`
stay private. When outsiders import `AgentCard/helpers`, the folder no longer
has a boundary.

**Where to stop:** one barrel per folder is a public API. A root barrel that
re-exports the entire app is a build-time problem — see `utils-and-types.md`.

## Nesting depth

Two levels below the feature, then stop:

```
✅  _components/RunTraceDrawer/_components/TraceBody/
❌  _components/A/_components/B/_components/C/
```

A third level is not a nesting problem, it is a signal that the top component
owns too much. Split it into siblings at the route level instead of burying
things deeper.

## Colocated tests

Tests live next to the code: `AgentCard.tsx` and `AgentCard.test.tsx` in the
same folder. A parallel `tests/` tree drifts, hides which files lack coverage,
and makes moving a component a two-place edit.

## Framework note: Next.js App Router

Next.js is explicitly unopinionated about all of this, so the conventions above
are the project's, not the framework's. Two mechanics worth knowing:

- Colocation is safe by default — a folder is not routable until it contains
  `page.tsx` or `route.ts`.
- `_folder` (private folder) opts a subtree out of routing entirely. Since
  colocation is already safe, its real value is separating UI from routing and
  avoiding collisions with future Next.js file conventions. `(group)` organizes
  routes without affecting the URL.
