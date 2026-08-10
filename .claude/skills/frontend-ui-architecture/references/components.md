# Components: when to split, how to compose

## The split criterion is responsibility, not length

Ask: *can I describe what this component does in one sentence, without saying
"and"?* If yes, leave it alone no matter how long it is. If no, the sentence
usually tells you where the seam is.

Line count is a symptom worth noticing, never the rule. Splitting a coherent
300-line component into three pieces that must be read together makes it worse:
you traded one long file for three files plus the mental work of reassembling
them. Over-splitting has a real cost — more pieces to hold in your head when
you actually make a change.

Concrete signals that a second responsibility has moved in:

- The prop list grew past what you can hold in your head, or props cluster into
  groups where only one group is used at a time.
- A chunk of JSX has its own local state that nothing else in the file reads.
- You are writing `if (mode === 'edit')` around large branches of markup.
- A part of the tree maps cleanly onto a different piece of the data model.
- Different parts of the file change for different reasons, in different PRs.

React's own framing: build the component tree so each component matches one
piece of your data model. Well-shaped data tends to hand you the boundaries.

## Do not split into container + presentational

The 2015 pattern — a stateful wrapper feeding a dumb view — was retracted by its
own author in 2019: *"I don't suggest splitting your components like this
anymore… Hooks let me do the same thing without an arbitrary division."*

The goal it served is still right: separate complex stateful logic from markup.
The mechanism changed. **Extract a custom hook; the hook is the container.**

```tsx
// ✅ one component, logic named and testable
function PullList({ repoId }: Props) {
  const { pulls, filter, setFilter, isLoading } = usePullList(repoId);
  ...
}

// ❌ two components to achieve the same separation
function PullListContainer(props) { ...state...; return <PullListView {...} /> }
function PullListView(props) { ...markup... }
```

You still split into two components when the *markup* has two jobs, or when the
inner one is genuinely reused. Splitting purely to relocate state is what became
obsolete.

## Prop drilling means a missing component

Passing data through layers that do not use it is not a context problem first —
it usually means a component was never extracted. React's official ordering:

1. **Pass props.** Verbose is fine; explicit data flow is a feature, not a cost.
2. **Pass JSX as `children`.** Restructure so the data goes straight to the
   component that needs it.
3. **Only then, context.**

```tsx
// ❌ Layout must know about posts to pass them through
<Layout posts={posts} />

// ✅ Layout knows nothing; Posts gets its data directly
<Layout><Posts posts={posts} /></Layout>
```

A component with `children` has a hole its parent fills, and it does not need to
know what goes in it. That is the cheapest decoupling available in React, and it
is also what keeps a parent's re-render from dragging its children along.

## Too many props

Two distinct smells, two distinct fixes.

**Multiple booleans on one concern** create impossible states. What should
`<Button danger primary warning>` do? Whichever branch happens to be written
last wins — behaviour leaking implementation order.

```tsx
❌ <Button danger primary warning />
✅ <Button variant="danger" />
```

Collapse related booleans into one prop with an enumerated set of values, so the
type system rules out the nonsense combinations.

**A long config prop list** on something that renders sub-parts means the
consumer should be composing them instead:

```tsx
❌ <Select options={opts} disabledIds={[2]} renderLabel={...} groupBy={...} />
✅ <Select>
     <Select.Option value="a">Alpha</Select.Option>
     <Select.Option value="b" disabled>Beta</Select.Option>
   </Select>
```

This is the **compound component** pattern: a parent holds the shared state and
publishes it through context; the children consume it via a hook. `<select>` and
`<option>` are the mental model — neither is useful alone, together they are an
API. The payoff is that per-item concerns (`disabled`) live on the item instead
of becoming another array prop on the parent.

## Render props are not dead

Hooks replaced render props for sharing *logic* — `useMousePosition()` beats
`<MouseTracker render={...} />` and there is no argument left there. But render
props still do a job hooks do not: handing the consumer control over *rendering*.

Use one when a component owns behaviour (filtering, keyboard nav, ARIA) but
should not own what the items look like. Base UI 1.0 chose render props over
`asChild` for exactly this, and the React Compiler removed the old
inline-function performance objection. The counter-risk is wrapper hell — nested
render-prop components stacked several deep. If you are only passing content,
use `children`.

## Keep components pure

A component must not mutate anything that existed before it was called — not
props, not state, not context, not a module-level object. Mutating what you
created during this render is fine.

Side effects belong in event handlers. If there is genuinely no event to attach
to, an Effect is the last resort, not the first tool. This matters more than it
used to: purity is what lets React skip, cache and restart renders, and it is a
precondition for the compiler to memoize your component safely.

## File conventions

- One component per file, PascalCase, in a folder named after it.
- Sub-components used only by the parent are siblings in the same folder — not
  functions declared inside the parent's body, which recreate their identity on
  every render and quietly break memoization.
- Anything that returns JSX is a component: `PascalCase`, called as `<Thing />`,
  never a `renderThing()` helper.
