---
name: frontend-ui-architecture
description: Frontend/React code architecture and file placement — decides where components, hooks, constants, helpers, types, styles and business logic belong, and how to break up a component that has outgrown itself. Use this skill whenever you create a new component, page or feature, move or rename frontend files, extract a hook or helper, refactor a large component, review a PR that adds UI files, or answer any "where should this code live" question — including folder structure, colocation, feature boundaries, shared vs local, barrel files, constants placement, and separating business logic from UI. Trigger it even when the user never says "architecture" and just asks where to put something. Complements react-best-practices (code-level anti-patterns) and next-best-practices (framework mechanics); this skill owns placement and decomposition.
version: 1.0.0
metadata:
  scope: frontend
  tags: [react, architecture, folder-structure, colocation, code-organization, refactoring]
---

# Frontend UI Architecture

Structure questions look subjective, so they get answered by whoever happens to
be typing. That is how a codebase ends up with three `utils.ts` files, a
`constants/` folder nobody reads, and a 600-line component that four people are
afraid to touch. This skill gives one answer per question, so the answer is the
same next week.

It decides **where code goes and how it is split**. It does not review code
quality — for anti-patterns inside a component (derived state, key props,
effects, memoization) use `react-best-practices`; for framework mechanics (RSC,
routing files, metadata, images) use `next-best-practices`.

## The default answers

Start here. If your question is on this list, you have your answer, and the
reference file is only for when you need the reasoning or an edge case.

| Question | Default answer |
|---|---|
| Where does a new component go? | Next to the thing that uses it. Only move it to shared when a **second** unrelated caller appears |
| By feature or by type (`components/`, `hooks/`, `utils/`)? | By feature/route. Type-folders only inside the shared layer |
| When do I split a component? | When it has a second responsibility — not at a line count |
| Presentational + container split? | No. Extract a hook instead; the hook *is* the container |
| Where does business logic live? | Pure functions in a named domain module. Hooks only wrap them for React |
| Function or hook? | If it calls no hook, it is a function. `getSorted`, never `useSorted` |
| Where do constants go? | Domain constants next to their feature; env/config centrally |
| `utils.ts`? | No. Name the module after its domain: `severity.ts`, `cost.ts`, `github-urls.ts` |
| Where do types go? | Where they are used. Promote only when a second module imports them |
| Barrel `index.ts`? | One per component/feature folder as its public API. Never a root barrel re-exporting everything |
| Where do styles go? | With the component, following whatever the project already does |
| Should I add `useMemo`/`useCallback`? | No, unless you measured. React Compiler handles it; never *remove* existing memoization |
| Where does data fetching go? | A custom hook in the data layer. Components call the hook, never `fetch` |
| How deep can folders nest? | Two levels below the feature. Deeper means the boundary is wrong |
| New abstraction layer? | Only when the code inside changes at a different rate than its caller |

## Five principles that generate the rest

When the table does not cover your case, derive the answer from these. They are
ordered — earlier ones win.

**1. Colocation.** Put code as close to where it is used as is reasonable.
Distance causes three specific failures: the far copy drifts out of sync, people
do not find it so they write a second one, and every edit becomes a
context-switch. This is why `constants.ts` sits inside the component folder
rather than in a global `constants/`.

**2. Promote on the second caller, demote on the first.** New code starts local.
The moment a genuinely unrelated module imports it, lift it one level. If
something in the shared layer turns out to have exactly one consumer, push it
back down. Structure is something you *discover*, not something you plan up
front — most premature shared folders are wrong guesses.

**3. One responsibility per unit.** The split criterion for a component, a hook
or a module is "can I describe it in one sentence without saying *and*". Line
count is a symptom, never the rule — a 300-line form that does one thing is
healthier than three 100-line pieces that must be read together.

**4. Dependencies point one way: shared → feature → route/page.** Shared code
knows nothing about features. A feature does not import another feature; if two
features need the same thing, it belongs in shared. Cycles here are what turn a
codebase into something you cannot reason about or delete from.

**5. A layer must earn its place.** Add indirection when the code behind it
changes at a different rate than its caller — not because a diagram says so.
A module is worth having when it hides a lot behind a small surface. If it
exposes nearly as much as it hides, inline it. On the frontend an extra layer
also costs bundle size, which the backend versions of this advice never mention.

## Deciding where a new file goes

```
Is it a user-facing string?          → messages layer (i18n), never inline
Is it a fetch/mutation?              → data-layer hook, never in a component
Is it a value with a name?           → domain-specific? colocate with the feature
                                       environment/deployment? central config
Is it a pure function?               → named domain module (severity.ts, cost.ts)
Is it stateful React logic?          → custom hook, named for the use case
Is it a component?                   → used by one route?    → that route's folder
                                       used by 2+ features?  → shared components
                                       generic, no domain?   → UI primitives layer
```

The trap at every branch is guessing "we'll probably reuse this" and starting in
shared. Start local. Principle 2 will move it when reuse is real, and the move
is cheap; untangling a wrong shared abstraction is not.

## Where to read more

Read the reference only when you need the reasoning, an edge case, or you are
about to argue with the table above.

| Read this | When |
|---|---|
| `references/placement.md` | Folder structure, feature vs shared, import direction, public API, the "delete the feature" test |
| `references/components.md` | Splitting a component, composition, `children`/slots, compound components, too many props |
| `references/logic.md` | Business logic placement, function vs hook vs service, domain/application/UI split, server/client boundary |
| `references/state.md` | Where state lives, lifting, context, server vs client state, query keys, memoization |
| `references/constants-and-config.md` | Constants, magic values, env vars, feature flags |
| `references/utils-and-types.md` | Killing `utils`, naming modules, type placement, barrel files, file naming |
| `references/styling-and-ui.md` | UI primitives vs feature components, design tokens, styles placement, a11y and i18n as layers |
| `references/examples.md` | Good/bad pairs drawn from this repo |

Sources, dates and the reasoning behind every contested call are in `README.md`.
Several of these questions have credible experts on both sides; the README says
who disagrees and why this skill chose what it chose.

## Project profile: dev-digest

The principles above are general. This is how they are already implemented in
`client/` — follow the existing shape rather than importing a structure from
elsewhere. Verify against `client/CLAUDE.md` and `client/INSIGHTS.md`, which win
if they ever contradict this file.

**Component folder.** A component is a PascalCase folder, not a loose file. Add
only the files it needs:

```
AgentCard/
  AgentCard.tsx        the component
  AgentCard.test.tsx   colocated vitest test
  constants.ts         module-level constants for this component
  helpers.ts           pure functions for this component
  styles.ts            style objects / style functions
  index.ts             public API — the only thing outsiders import
```

`client/src/app/agents/_components/AgentCard/` has all six;
`client/src/components/severity-counts/` has four. Missing files are normal;
empty ones are not.

**Where each kind of code lives.**

| Kind | Location |
|---|---|
| Route-specific component | `src/app/<route>/_components/<Name>/` |
| Component shared across routes | `src/components/<kebab-case>/` |
| Generic UI primitive | `src/vendor/ui/` — vendored, treat as read-only |
| Data fetching | `src/lib/hooks/*` only, going through `src/lib/api.ts` |
| Domain logic | Named module in `src/lib/` — `severity.ts`, `cost.ts`, `github-urls.ts` |
| Shared contracts | `src/vendor/shared/` — mirror of the server copy, never diverge |
| User-facing strings | `messages/<locale>/*.json` via next-intl |

Route segments may also carry sibling `constants.ts` / `helpers.ts` / `styles.ts`
next to `page.tsx` — see `client/src/app/repos/[repoId]/pulls/`.

**Local rules that override the generic advice.**

- Styling is **inline style objects in `styles.ts`**, not utility classes. This
  is deliberate and repo-wide. `react-best-practices` says the opposite; it was
  written for a different stack and the codebase wins. `client/INSIGHTS.md`
  records the CSS-shorthand trap that comes with this choice — read it before
  writing a stateful style function.
- Data access goes **only** through `src/lib/hooks/*`. A `fetch` inside a
  component is a defect regardless of how small it is.
- Severity colours and icons have exactly one source: `SEV` in
  `src/vendor/ui/primitives/tokens.ts`. Hand-rolled `SEV_COLOR` copies already
  exist and have already drifted — do not add a third.
- There are two different `Severity` types: `@devdigest/ui` has four values
  (adds `INFO`), `@devdigest/shared` has the three-value contract enum. Build
  domain records off the shared one.
- Nesting stops at `_components/<Parent>/_components/<Child>/`. If you want a
  third level, the parent is doing too much.
- Before implementing a feature, check `client/specs/` for its spec.
