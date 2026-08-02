# State: where it lives

## Server state and client state are different things

Treating them the same is the single most expensive structural mistake in a
React app.

| | Server state | Client state |
|---|---|---|
| Owns it | The server | The browser |
| Examples | Pulls, findings, agents, settings | Open tab, expanded row, draft text, theme |
| Can go stale | Yes, at any moment | No |
| Home | A query cache, reached through custom hooks | `useState` / `useReducer`, or a small store if genuinely global |

Two consequences that come up constantly:

- **Do not copy server data into `useState`.** The copy silently opts out of
  background updates, and now you own reconciling them.
- **Do not use the query cache as a general state manager.** A background
  refetch will overwrite whatever you wrote into it.

## Deciding where a piece of state goes

1. Is it derivable from props or other state? Then it is **not state** — compute
   it during render. This is the most common source of bugs in React code: two
   values that must agree, kept in two places.
2. Does it come from the server? Query hook.
3. Otherwise: find every component that reads it, find their closest common
   parent, put it there. Not higher.

"Not higher" is load-bearing. Lifting state above where it is needed re-renders
everything in between and makes the app feel slow long before any profiler is
involved. Transient things — form fields, hover, which row is expanded — belong
as far down as possible, never in a global store.

It is normal to move state up or down as you learn the shape. That is not churn,
it is the process.

## Shaping state

- **Group what always changes together.** Two `useState` calls you always set in
  the same line want to be one.
- **Make impossible states unrepresentable.** `isSending` + `isSent` allows a
  fourth combination that means nothing; `status: 'typing' | 'sending' | 'sent'`
  does not.
- **No redundant state.** Anything computable during render should be computed.
- **No duplicated state.** Store `selectedId`, then find the object during
  render. Storing the object gives you two copies that drift.
- **Avoid deep nesting.** Flatten to id → object with child ids; updating nested
  state means copying the whole parent chain.
- **Do not mirror a prop into state.** `useState(color)` initializes once and
  then ignores the prop. If you genuinely want to ignore updates, say so in the
  name: `initialColor`, `defaultColor`.

Reach for `useReducer` when several handlers update the same state in similar
ways, or when you keep getting bugs from incorrect updates. Reducers are pure
functions, so they are trivially testable in isolation, and each action should
describe one user interaction — `reset_form`, not five `set_field` calls.

## Context is dependency injection, not a store

Before using context, try the two cheaper things in order: pass props, then
restructure so you pass JSX as `children`. Deep prop passing usually means a
component was never extracted — see `components.md`.

When context is right (theme, current account, routing, a genuinely shared
reducer), the pattern is:

- Two contexts, one for state and one for `dispatch`, so components that only
  dispatch do not re-render when state changes.
- One provider component that owns the reducer and nests both providers.
- Custom hooks for reading — `useTasks()`, `useTasksDispatch()`. These earn the
  `use` prefix because they call `useContext`.
- **Many scoped domain providers, not one global one.** A provider placed as
  close as possible to the subtree that needs it keeps the re-render radius
  small and keeps the dependency visible.

## Memoization

Default: **do not add `useMemo` / `useCallback` by hand.** The React Compiler
(stable since v1.0, October 2025) memoizes components and hooks automatically,
and at a granularity manual memoization cannot reach — including conditionally
and after early returns.

Manual memoization is still worth it in three narrow cases: the calculation is
measurably slow and its inputs rarely change; the value is passed to a `memo`
component; or it feeds another hook's dependency array. Measure before assuming
— under roughly 1ms, it is not worth the readability cost.

**Do not strip existing memoization** on a whim. Removing it can change what the
compiler emits, and a value you un-memoize may be a dependency of an Effect
somewhere, which then over- or under-fires. The `preserve-manual-memoization`
lint rule exists precisely to catch this.

Most of the time the real fix is structural rather than memoization:

- Let a wrapper accept `children` so its state updates do not re-render them.
- Keep state local instead of lifting it.
- Keep rendering pure — a visual artifact on re-render is a bug to fix, not a
  reason to memoize.
- Remove Effects that set state. Chains of Effect-driven updates cause more
  performance problems than missing `useMemo` ever did.

## Effects

An Effect synchronizes with an **external system**. If no external system is
involved, you almost certainly do not need one. The recurring cases:

| Instead of an Effect that… | Do this |
|---|---|
| computes state from props/state | compute during render |
| caches an expensive calculation | `useMemo` |
| resets all state when a prop changes | pass a different `key` |
| adjusts some state when a prop changes | set it during render |
| shares logic between two handlers | extract a function both call |
| sends a POST on user action | put it in the event handler |
| chains computations | derive during render, or do it in one handler |
| notifies the parent of a state change | update both in the same handler |
| subscribes to an external store | `useSyncExternalStore` |

Fetching in an Effect is legitimate, but needs cleanup to avoid race
conditions — which is one more reason fetching belongs in a hook that already
handles it.
