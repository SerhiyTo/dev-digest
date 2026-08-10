# Business logic: where it goes

## Three kinds of logic, three homes

Most "where does this go" arguments dissolve once you name which kind of logic
you are holding.

| Kind | What it is | Home |
|---|---|---|
| **Domain** | Rules and operations on your data. `getUserById`, `hasExceededLimit`, `sortBySeverity`, `costOfRun` | Pure functions in a named domain module |
| **Application** | Orchestration of a use case: call this, check that, then update this | A function that takes its dependencies as arguments; a hook wraps it for React |
| **UI** | What is open, what is hovered, which tab is active, how a value is formatted for display | The component, or a hook next to it |

The tell for domain logic is mundane. `users.find(u => u.id === shout.authorId)`
sitting inside JSX *is* domain logic. So is a ternary that decides whether a
badge is red. Neither looks like "business logic" until you need it in a second
place and copy it.

Pulling it out buys four things: it is unit-testable without rendering, every
branch becomes a named case instead of an inline ternary, it is reusable, and —
underrated — it becomes **greppable**. `getUserById` shows up in a search; an
inline `.find` does not.

## Pure function first, hook only if it needs React

The rule is mechanical and comes straight from React's docs: **if your function
calls no hook, it is not a hook.**

```ts
❌ function useSorted(items) { return items.slice().sort(); }
✅ function getSorted(items) { return items.slice().sort(); }
✅ function useAuth() { return useContext(AuthContext); }   // calls a hook → is one
```

This is not pedantry about naming. A plain function can be called anywhere —
inside a condition, in a loop, from a test, from another plain function. The
moment you name it `use*`, you have imposed the rules of hooks on code that did
not need them, and you have hidden from readers that nothing stateful happens.

So the decision is: write the logic as a pure function; add a hook only when it
must touch state, context, effects or the query cache. The hook then stays thin —
it wires React to logic that is testable without React.

```ts
// domain — pure, no React
export function countActiveBySeverity(findings: FindingRecord[]): SeverityCounts { ... }

// React binding — thin
export function useSeverityCounts(prId: string) {
  const { data } = usePullDetail(prId);
  return countActiveBySeverity(data?.findings ?? []);
}
```

## Do not over-extract

The official counterweight matters as much as the rule: *"You don't need to
extract a custom Hook for every little duplicated bit of code. Some duplication
is fine."* Wrapping a single `useState` in `useFormInput` is ceremony.

Two related pieces of guidance:

- **Name hooks for concrete use cases, not mechanisms.** `useChatRoom(options)`,
  `useMediaQuery(query)`, `useIntersectionObserver(ref, opts)` are good.
  `useMount(fn)`, `useUpdateEffect(fn)` are not — they are wrappers around the
  Effect API itself, the linter cannot check their dependencies, and the code
  inside them stops reacting to prop and state changes.
- A good abstraction makes calling code *more* declarative by constraining what
  it can do. An over-generic hook with eight options constrains nothing and
  costs a reader more than the duplication it removed.

## Should this be a service layer?

Sometimes. The honest test is not a diagram, it is: **does this code change at a
different rate than its caller?** If the API transport changes on a different
schedule than the screens, splitting transport from logic pays for itself. If
they always change together, the split is filing, not architecture.

The complementary test is depth: a module earns its keep when it hides a lot
behind a small surface. If it exposes nearly as much as it hides, inline it.

A common, low-ceremony version of dependency injection for testability: write
the use case as a function whose second parameter is its dependencies, then let
a thin hook supply the real ones.

```ts
export async function replyToPull(input: Input, deps: Deps) { ... }

export function useReplyToPull() {
  return useCallback((input: Input) => replyToPull(input, { api, notify }), []);
}
```

Two caveats worth stating, both raised by the people who advocate this pattern:

- Mocked dependencies drift from real signatures. Unit tests keep passing while
  the app breaks, so this does not remove the need for integration coverage.
- On the frontend, layers also cost bundle size — an argument that does not
  exist in the backend versions of this advice. Start unlayered and add a layer
  when something concrete hurts, not in anticipation.

## Data fetching

All fetching goes through custom hooks; components never call `fetch` or an HTTP
client directly. Even a single `useQuery` is worth wrapping — it gives the
query key one home, keeps the return type in one place, and lets you change the
implementation without touching call sites.

Colocate the hook, its types and its query key together in the feature. A
central `constants/queryKeys.ts` separates the key from every place that uses it,
which is exactly the drift colocation exists to prevent.

## Validation and domain rules are not the same thing

A shared schema (Zod) is the right home for **shape and simple constraints**, and
types should be inferred from it (`z.infer`) rather than maintained beside it.
One schema, consumed by the form, the API boundary, and the server.

But a schema cannot own:

- asynchronous checks (is this name already taken)
- authorization (may this user do this)
- multi-step workflows and invariants (has this account exceeded its daily limit)

Those are domain functions. The short version: **UI validation consumes domain
rules; it does not own them.** And client validation is never a security
boundary — the server re-validates regardless.

## The server/client boundary

In the App Router this stopped being a convention and became a build-time
constraint, which is worth using deliberately:

- `"use client"` marks a **module-graph boundary**, not a single file.
  Everything a client module imports, and every component it directly renders,
  joins the client bundle. You do not re-annotate children.
- The escape hatch: components passed as `children` or props are *not* in that
  graph. `<ClientModal><ServerCart /></ClientModal>` keeps the
  server component on the server. This is how you stop one interactive leaf from
  pulling a subtree client-side.
- Push the boundary down. Mark `<Search />` as client, not `<Layout />`.
- Server-side belongs: data access, secrets, heavy dependencies. Client-side
  belongs: state, effects, event handlers, browser APIs, and custom hooks.
- `server-only` / `client-only` turn a wrong import into a build error. That is
  stronger enforcement than any hand-rolled layer, and it is worth reaching for
  before inventing an `infrastructure/` folder.
- Props crossing the boundary must be serializable — you cannot simply pass a
  service instance down.
