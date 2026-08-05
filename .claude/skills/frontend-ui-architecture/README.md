# frontend-ui-architecture — sources and rationale

This document is not part of the skill payload. It records **where the skill's
rules come from**, **where credible sources disagree**, and **why each contested
call went the way it did**, so the skill can be argued with rather than just
obeyed.

Research date: **2026-08-03**. Skill version at time of writing: **1.0.0**.

Roughly 60 URLs were opened and read across seven topic clusters. Sources that
could not be retrieved are listed honestly at the end rather than paraphrased
from memory.

## Why this skill exists separately

`.claude/skills/react-best-practices/` already covers React code quality —
derived state, key props, effect misuse, memoization. It devotes a few lines to
structure under "Code Organization (MEDIUM)".

Two problems made extending it the wrong move:

1. **Different concern.** Placement and decomposition is a distinct question from
   "is this component written correctly", and merging them produced a skill that
   answered neither thoroughly.
2. **Different stack.** `react-best-practices` was written for Vite + Tailwind +
   Axios + react-router: it references Vite `manualChunks`, Axios interceptors,
   `resetKeys={[location.pathname]}`, and states "no inline `style={}` objects".
   The actual `client/` is Next.js 15 App Router + `src/lib/api.ts` + TanStack
   Query, and its styling convention is **deliberately** inline style objects in
   per-component `styles.ts`. Several existing rules contradict the codebase.

So: `frontend-ui-architecture` owns placement and decomposition;
`react-best-practices` remains the code-level anti-pattern catalogue;
`next-best-practices` remains framework mechanics. Its stack-specific
inaccuracies are noted here but were deliberately left untouched — fixing them
is a separate task.

## Contested calls and how they were decided

Nine questions had credible sources on both sides. The skill gives one answer to
each; here is the reasoning.

### 1. Feature-based organization vs a flat `components/`

**Decision: organize by feature/route; type-folders only inside the shared layer.**

Bulletproof React, Robin Wieruch, Feature-Sliced Design and Sandro Roth all
argue for feature grouping. Josh Comeau argues the opposite, and not casually —
his position is that "real life isn't nicely segmented", feature boundaries grow
arbitrary as products evolve, and re-categorizing costs more than it saves.

The two camps optimize for different failure modes: Comeau optimizes for *not
having to re-file things* when the product shifts; the feature camp optimizes for
*deletability and blast radius*. Wieruch's "delete the feature" test is the
sharpest articulation of the latter and is what tipped the decision — plus the
fact that `client/` already does route-based colocation, so the alternative would
have meant recommending a structure the codebase does not use.

### 2. Barrel files

**Decision: one `index.ts` per component/feature folder as its public API; no
broad or chained barrels.**

This is the sharpest contradiction in the entire research set, and no position
satisfies every source:

- **Bulletproof React** calls barrel files an anti-pattern outright (Vite
  tree-shaking).
- **Atlassian** measured the cost in production: removing them cut build minutes
  75%, dropped triggered unit tests from 1,600 to 200, and sped TypeScript
  analysis by over 30%.
- **Feature-Sliced Design** makes a public API per slice *mandatory* — the
  methodology structurally depends on the thing Bulletproof bans.
- **Josh Comeau** uses them and rejects the performance argument as negligible
  ("under 1% of parsed modules").
- **Wieruch** says they are "getting out of fashion" yet still requires a public
  API per feature, leaving the mechanism ambiguous.

The reconciliation: Atlassian's measured pain came from *cascading* and
*aggregating* barrels, not from a single small folder-level one. A per-folder
barrel is what makes `helpers.ts` and `constants.ts` private, which the whole
boundary model in `placement.md` depends on. So: few, coarse, explicit, never
`export *`, never chained.

Open question nobody in the set tested: whether a **type-only** barrel is exempt.
`export type` re-exports erase at build time, so the bundler cost mostly
evaporates — but the TypeScript-server parse cost may not.

### 3. Container/presentational

**Decision: do not split into two components; extract a hook.**

Settled by primary source. Dan Abramov added a retraction to his own 2015
article in 2019: *"I don't suggest splitting your components like this anymore…
Hooks let me do the same thing without an arbitrary division."* patterns.dev
concurs. A large volume of 2024–2026 tutorial content still teaches the original
form; the primary source outweighs it.

Note the retraction is of the *prescription*, not the *goal* — separating complex
stateful logic from markup is still right.

### 4. File naming and casing

**Decision: PascalCase for component files/folders, kebab-case for everything
else, lowercase for framework-reserved names — matching `client/` as it is.**

Three incompatible authorities: Google's TypeScript style guide mandates
`snake_case` files; Next.js's own reserved filenames are kebab-case
(`not-found`, `global-error`); React tradition is PascalCase for components.
Next.js explicitly declines to arbitrate: *"choose a strategy that works for you
and your team and be consistent across the project."*

The only genuinely load-bearing constraint anyone demonstrates is the
case-sensitivity hazard (Linux vs macOS/Windows), which rules out *mixing*, not
any particular choice. So the decision was made on consistency with the existing
codebase rather than on authority.

### 5. Hook vs plain function

**Decision: no hook call inside → not a hook. `getSorted`, never `useSorted`.**

Uncontested; stated directly by react.dev, with `useSorted` given as the explicit
🔴 example. Included because it is one of the most frequently violated rules in
practice.

### 6. Manual memoization

**Decision: do not add `useMemo`/`useCallback` by default; never strip existing
memoization casually.**

React Compiler reached stable v1.0 on 2025-10-07 and is generally available.
react.dev's guidance for existing code is explicit: leave existing memoization in
place, because *"removing it can change compilation output"* — a previously
memoized value may be a dependency of an Effect elsewhere, causing over- or
under-firing. The `preserve-manual-memoization` lint rule enforces this.

Worth stating clearly: the compiler removes the *performance* argument for manual
memoization but changes none of the structural guidance. Purity, minimal state,
no derived state and no Effect anti-patterns remain load-bearing — they are
preconditions for the compiler to memoize safely.

### 7. `utils/`

**Decision: no global `utils`; name modules after their domain. Per-component
`helpers.ts` is fine.**

Sergey Sova's argument — that `utils`/`helpers` names communicate nothing and so
nothing stops them growing — is the strongest form of this. Kettmann independently
notes "utility files easily turn into a dumping ground". Against this, Bulletproof
React ships both a root `utils/` and a per-feature one, and Next.js lists `utils`
as a normal placeholder.

The distinction the sources do not draw explicitly, and which this skill adds: a
**scoped** helper file behind a folder's public API cannot become a dumping
ground, because it is not importable from elsewhere. The anti-pattern is the
global one. `client/src/lib/` already demonstrates the good version — named
domain modules (`severity.ts`, `cost.ts`, `github-urls.ts`), no `utils.ts`.

### 8. Constants

**Decision: domain constants colocate with the feature; environment/config
centralizes.**

No single source states this, but it is the only position that reconciles all
three: Semaphore wants a root `constants/` directory; TkDodo insists query keys
(which are constants) colocate in the feature and explicitly *not* in a central
file; Bulletproof splits the difference with `config/` for global config and env.

The unifying idea is to file constants by **what governs them** rather than by
their shape. A severity ordering is governed by the product; an API base URL is
governed by the deployment.

### 9. How many layers

**Decision: start unlayered; a layer is earned by a different rate of change.**

Alex Kondov gives the two best heuristics: start with everything in the
component ("the first draft of a text"), and use *deep vs shallow modules* — a
module worth keeping hides a lot behind a small surface; a shallow one should be
inlined. Bespoyasov, though an advocate of clean architecture on the frontend,
lists its costs candidly, including one with no backend analogue: **bundle size**.

react.dev provides the official brake from the other direction: over-abstract
hooks "introduce more problems than they solve", and "some duplication is fine".

Two things the architecture literature mostly misses, both worth knowing:

- **RSC partially obsoletes the debate.** `"use client"` module-graph boundaries
  plus `server-only`/`client-only` now enforce mechanically what the 2021–2024
  clean-architecture-for-React articles simulated by hand. Every architecture
  source in the set either predates or ignores this.
- **Kondov's "Purism Leaks Logic"**: a strictly RESTful backend forces the
  frontend to become the driver of business logic. How much logic lives on the
  client is partly an API design question, not only a frontend hygiene question.

## Additional conflicts worth knowing (not decided by this skill)

- **Nesting depth.** FSD mandates three levels (layer/slice/segment) before you
  reach a file; Wieruch says "avoid nesting more than two levels". Both cannot be
  satisfied in a large FSD app. This skill follows Wieruch.
- **Cross-feature coupling escape hatches.** Everyone forbids cross-feature
  imports; nobody agrees on the release valve. Bulletproof offers none (hoist or
  compose at app level); FSD has official `@x` cross-import notation; Wieruch
  proposes a `relations/` folder to make coupling visible; Roth argues
  Bulletproof's lack of a valve is exactly why its dependencies go opaque.
- **CSS-in-JS and RSC status is contested.** Next.js's guide (updated 2025-07-28)
  lists runtime CSS-in-JS as Client-Components-only with Emotion unsupported;
  Comeau (updated 2026-02-15) says styled-components v6.3.0+ supports RSC
  natively. Both current-ish, they disagree. Check current docs.
- **shadcn's form API has moved** from `Form`/`FormField`/`FormItem` to
  `Field`/`FieldLabel`/`FieldError` + React Hook Form's `Controller`, and now
  supports three form libraries behind one field layer.
- **Render props are not deprecated.** The strongest 2026 source argues they
  survive for rendering control (not logic sharing), with Base UI 1.0 choosing
  them over `asChild` and the React Compiler neutralizing the perf objection.
- **Testing philosophy.** Kettmann explicitly rejects "mostly integration" for
  branchy logic, preferring fast unit tests over extracted functions; Kent C.
  Dodds' trophy argues the opposite. They are largely arguing about different
  code — Dodds defends against unit-testing *components*, Kettmann unit-tests
  extracted *non-React functions*, which Dodds also permits. The residual
  disagreement is whether extracting logic *in order to* unit-test it is good
  design. Kettmann concedes the failure mode: mock/real signature drift means
  unit tests pass while the app breaks.

## Reproducing the evals

`evals/evals.json` holds three prompts with assertions. The workspace they were
run in is not committed. Two things that cost time the first run:

- **The skill-creator scripts need Python ≥3.10.** The system `python3` on this
  machine is 3.9.6 and fails with `TypeError: unsupported operand type(s) for |`
  on `dict | None` annotations. Use a pyenv interpreter directly, e.g.
  `~/.pyenv/versions/3.13.3/bin/python3`.
- **`aggregate_benchmark.py` expects a nested run layout**, not the flat one the
  skill-creator instructions describe. It looks for
  `eval-*/<config>/run-N/grading.json` and reads counts from a `summary` object
  (`passed`, `failed`, `total`, `pass_rate`) — a `grading.json` with only
  top-level `passed`/`total` silently aggregates to 0%. The eval viewer reads the
  flat layout, so keep both: `grading.json` at the config level and a copy under
  `run-1/`.

### Iteration 1 result (2026-08-03)

100% pass rate with the skill vs 89.7% without, at effectively equal time and
tokens (186.6s vs 183.1s; 71,933 vs 73,868 tokens).

The honest caveat: **eval-0 scored 8/8 in both configurations and discriminates
nothing.** `client/`'s conventions are legible enough from `client/CLAUDE.md`
and neighbouring files that a baseline agent reproduces them unaided, so
assertions like "uses next-intl" or "colocated `styles.ts`, not Tailwind"
measure the repo's documentation, not the skill. The two assertions that did
separate the configurations were the `use*` naming rule and premature promotion
of a constant to a new shared module. A future iteration should replace eval-0's
assertions with checks on things the codebase does not already advertise — the
delete-the-feature test, or the primitive-vs-feature-component boundary.

---

# Sources

Type key: **[O]** official docs · **[E]** recognized-expert blog ·
**[R]** reference repo/methodology · **[C]** community/practitioner ·
**[M]** production measurement

## A. Project structure and folder architecture

1. **[R]** Bulletproof React — Project Structure — Alan Alickovic
   <https://raw.githubusercontent.com/alan2207/bulletproof-react/master/docs/project-structure.md>
   Unidirectional flow `shared → features → app`; no cross-feature imports;
   barrel files named an anti-pattern; enforcement via ESLint
   `import/no-restricted-paths`.
   Companions: [components-and-styling.md](https://raw.githubusercontent.com/alan2207/bulletproof-react/master/docs/components-and-styling.md),
   [state-management.md](https://raw.githubusercontent.com/alan2207/bulletproof-react/master/docs/state-management.md)
   (five state categories; "localize the state as closely as possible").
2. **[O]** Feature-Sliced Design — <https://feature-sliced.design/docs/get-started/overview>
   · [Layers](https://feature-sliced.design/docs/reference/layers)
   · [Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
   Layers → slices → segments; seven fixed layers; imports only "strictly below";
   slices cannot use same-layer slices; **mandatory public API per slice**.
3. **[E]** React Folder Structure Best Practices [2026] — Robin Wieruch, updated 2026-05-05
   <https://www.robinwieruch.de/react-folder-structure/>
   Structure as a **progression**, not a choice; promotion/demotion rule; the
   "delete the feature" test; no more than two levels of nesting.
4. **[E]** Delightful React File/Directory Structure — Josh W. Comeau, updated 2025-12-03
   <https://www.joshwcomeau.com/react/file-structure/>
   The dissenting view: flat `components/<Name>/`, `.helpers.ts`/`.types.ts`
   suffixes, explicit rejection of feature-based organization and of the
   barrel-file cost argument.
5. **[C]** Project Standards — React Handbook, Eric Diviney
   <https://reacthandbook.dev/project-standards>
   "Don't spend more than 5 minutes trying to plan a folder structure";
   intra-file ordering; `function` declarations over arrow consts for components.
6. **[O]** Project structure and organization — Next.js v16.2.12, updated 2026-07-22
   <https://nextjs.org/docs/app/getting-started/project-structure>
   Next.js is **unopinionated**; colocation safe by default; `_folder` private
   folders and `(group)` route groups; three equally-blessed strategies;
   "`components` and `lib` … their naming has no special framework significance".
7. **[E]** Colocation — Kent C. Dodds, 2019-06-17
   <https://kentcdodds.com/blog/colocation>
   "Place code as close to where it's relevant as possible"; the three failure
   modes of separation: drift, discovery failure, friction.
8. **[C]** How to structure your React projects — Sandro Roth, 2023-02-16
   <https://sandroroth.com/blog/project-structure/>
   The only source that compares the methodologies head-to-head; critiques
   Bulletproof (opaque inter-feature deps, circular-reference risk); prefers FSD.

## B. Official React docs — decomposition, state, logic

9. **[O]** <https://react.dev/learn/thinking-in-react> — five steps; single-responsibility split criterion; three tests for "this is not state".
10. **[O]** <https://react.dev/learn/you-might-not-need-an-effect> — the canonical list of 12 Effect anti-patterns.
11. **[O]** <https://react.dev/learn/reusing-logic-with-custom-hooks> — the `use` rule; "some duplication is fine"; `useMount` named as an anti-pattern.
12. **[O]** <https://react.dev/learn/choosing-the-state-structure> — five principles; "don't mirror props in state".
13. **[O]** <https://react.dev/learn/sharing-state-between-components> — lifting procedure; controlled vs uncontrolled.
14. **[O]** <https://react.dev/learn/passing-data-deeply-with-context> — the gate before context: props, then `children`; "you forgot to extract some components".
15. **[O]** <https://react.dev/learn/scaling-up-with-reducer-and-context> — two contexts (state + dispatch); many scoped providers rather than one global store.
16. **[O]** <https://react.dev/learn/keeping-components-pure> — purity; side effects in handlers; Effects as last resort.
17. **[O]** <https://react.dev/learn/extracting-state-logic-into-a-reducer> — when a reducer earns its place; one action per interaction.
18. **[O]** <https://react.dev/reference/react/useMemo> — "should you add useMemo everywhere"; five principles that make memoization unnecessary; the ~1ms measurement threshold.
19. **[O]** <https://react.dev/learn/react-compiler/introduction> — what the compiler does and does not memoize.
20. **[O]** <https://react.dev/blog/2025/10/07/react-compiler-1> — v1.0 stable, 2025-10-07.
21. **[O]** <https://react.dev/reference/eslint-plugin-react-hooks/lints/preserve-manual-memoization>
22. **[O]** <https://react.dev/reference/rsc/server-components> — what belongs on the server; `"use server"` is not a Server Component marker.
23. **[O]** <https://react.dev/learn/passing-props-to-a-component> — the `children`-as-a-hole metaphor.

## C. Non-component code: utils, constants, types, barrels, naming

24. **[C]** Why utils & helpers is a dump — Sergey Sova, 2021-11-23
    <https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo>
    Replace unnamed `utils`/`helpers` with purpose-named internal libraries that
    carry documentation and tests.
25. **[M]** How We Achieved 75% Faster Builds by Removing Barrel Files — Tim Sebastian, Atlassian, 2025-06-26
    <https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files>
    −75% build minutes; 1,600 → 200 triggered unit tests; TS highlighting >30%
    faster. Mechanism: dependency-graph inflation and false CI blast radius.
    Concedes barrels retain value for published packages with a real boundary.
26. **[C]** How To Organize Constants in a Dedicated Layer in JavaScript — Antonello Zanini, Semaphore, 2023-12-13
    <https://semaphore.io/blog/constants-layer-javascript>
    Named groups via `Object.freeze`; segregate by mutability — env from
    `process.env`, domain constants hardcoded.
27. **[O]** Google TypeScript Style Guide — <https://google.github.io/styleguide/tsguide.html>
    `snake_case` files; `namespace` disallowed; `export type` when re-exporting
    types; `CONST_CASE` only at module level. **Says nothing about barrel files** —
    worth knowing, since it is often cited as if it did.
28. **[C]** How to Organize Type Definitions in a TypeScript Project — OpenReplay, 2026-03-04
    <https://blog.openreplay.com/organize-typescript-type-definitions/>
    Ladder: inline → `module.types.ts` → `src/types/` → package. `.d.ts` only for
    ambient. Anti-patterns: one global `types.ts`, `I`-prefixes, `Type` suffixes.
29. **[C]** Kebab-Case Filenames and PascalCase Classes — Adarsh Hasnah
    <https://dev.to/adarshasnah/kebab-case-filenames-and-pascalcase-classes-naming-conventions-that-scale-7dp>
    `<domain>.<responsibility>.ts`; the one genuinely load-bearing argument is
    filesystem case-sensitivity (Linux vs macOS/Windows).
30. **[C]** Beyond Environment Variables: When to Use Feature Flags — ConfigCat, 2025-07-25
    <https://configcat.com/blog/feature-flags-vs-environment-variables/>
    Env = startup, no segmentation, strings only. Flags = runtime, targeting,
    kill switches. Zombie flags as debt. *Bias: vendor sells flag management.*

## D. Business logic, layering, DI

31. **[C]** Path To A Clean(er) React Architecture, Part 6 — Business Logic Separation — Johannes Kettmann, 2024-06-21
    Original dead: `https://profy.dev/article/react-architecture-business-logic-and-dependency-injection`
    Archive: <https://web.archive.org/web/20250215163006/https://profy.dev/article/react-architecture-business-logic-and-dependency-injection>
    Mirror: <https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g>
    Use cases in `src/application/`; DI as a second `dependencies` parameter; the
    hook is only the injection mechanism. Author concedes the layer is not "clean".
32. **[C]** Part 5 — Infrastructure Services & DI For Testability, 2024-06-07
    <https://web.archive.org/web/20240607162328/https://profy.dev/article/react-architecture-infrastructure-services-and-dependency-injection>
    Splits `api.ts` (transport) from `service.ts` (logic, DTO mapping).
33. **[C]** Part 7 — Domain Logic, 2024-07-05
    <https://web.archive.org/web/20240705182123/https://profy.dev/article/react-architecture-domain-logic>
    `users.find(u => u.id === ...)` inside JSX is already domain logic; the
    underrated payoff is **greppability**, not only testability.
34. **[E]** Hexagonal-Inspired Architecture in React — Alex Kondov, 2022-11-30
    <https://alexkondov.com/hexagonal-inspired-architecture-in-react/>
    Key claim: **the browser is an infrastructure layer too**; the custom hook is
    the port.
35. **[E]** Clean Architecture in React — Alex Kondov, 2024-02-09
    <https://alexkondov.com/full-stack-tao-clean-architecture-react/>
    The most balanced source in the set. Start unlayered; deep vs shallow modules
    as the test for whether a layer earns its keep; layers justified by differing
    **rates of change**; "Purism Leaks Logic".
36. **[C]** Clean Architecture on Frontend — Alex Bespoyasov, 2021-09-02
    <https://bespoyasov.me/blog/clean-architecture-on-frontend/>
    A proponent who lists the costs candidly, including **bundle size** — the one
    argument with no backend analogue.
37. **[E]** Presentational and Container Components — Dan Abramov, 2015, **retracted 2019**
    <https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0>
38. **[C]** Presentational/Container Pattern — patterns.dev (Lydia Hallie, Addy Osmani)
    <https://www.patterns.dev/react/presentational-container-pattern/>
    Confirms hooks achieve the same result without the wrapper.
39. **[C]** One Zod Schema for UI, API, and Types — Aditya Dewaskar, 2026-02-03
    <https://adewaskar.medium.com/one-validation-schema-multiple-runtimes-zod-ui-backend-8d48d9db8d15>
    Types inferred from the schema, never maintained alongside. **The limit**: Zod
    owns shape and simple constraints; async checks, permissions and multi-step
    workflows stay in the domain layer.
40. **[O]** Server and Client Components — Next.js v16.2.12, updated 2026-06-23
    <https://nextjs.org/docs/app/getting-started/server-and-client-components>
    `"use client"` is a **module-graph** boundary; `children` as the escape hatch;
    `server-only`/`client-only` turn the boundary into a build error;
    boundary-crossing props must be serializable.

## E. Data and state

41. **[E]** Practical React Query — Dominik Dorfmeister (TkDodo, TanStack Query maintainer), 2020-11-16, updated 2023-10-21
    <https://tkdodo.eu/blog/practical-react-query>
    Always wrap `useQuery` in a custom hook; never copy server state into local
    state; the query cache is not a state manager.
42. **[E]** Effective React Query Keys — TkDodo, 2021-06-13, updated 2022-04-23
    <https://tkdodo.eu/blog/effective-react-query-keys>
    Key factory **in the feature folder**, not a central `constants/queryKeys.ts`;
    keys generic → specific; put state in the key instead of calling `refetch()`.

## F. Composition, the UI layer, styling, forms, a11y, i18n

43. **[E]** Compound Components with React Hooks — Kent C. Dodds, 2019-02-18
    <https://kentcdodds.com/blog/compound-components-with-react-hooks>
44. **[E]** Intro to Compound Components — Epic React
    <https://www.epicreact.dev/workshops/advanced-react-patterns/intro-to-compound-components>
    The `<select>`/`<option>` analogy; names the props-explosion escape route.
45. **[E]** Advanced React Component Patterns — Kent C. Dodds, 2017-12-05
    <https://kentcdodds.com/blog/advanced-react-component-patterns>
    Catalogue: HOCs, render props, prop collections and getters, state
    initializers, control props. Historically important, dated.
46. **[E]** Multiple Boolean Props Are a Code Smell — Kyle Shevlin, 2020-08-28
    <https://kyleshevlin.com/multiple-boolean-props-are-a-code-smell/>
    Boolean clusters create impossible states; collapse into one enumerated prop.
47. **[C]** Render Props Are Not Dead — Maryan Mats, 2026-04-08
    <https://maryanmats.com/blog/render-props-are-not-dead/>
    Hooks replaced render props for logic, not for rendering control. Base UI 1.0
    (MUI, Dec 2025) chose render props over `asChild`; the React Compiler removes
    the memoization objection.
48. **[C]** React render props vs custom hooks — LogRocket, 2022-09-16
    <https://blog.logrocket.com/react-render-props-vs-custom-hooks/>
    The counterweight: "wrapper hell" from over-applied render props.
49. **[O]** shadcn/ui — Docs — <https://ui.shadcn.com/docs>
    "This is not a component library. It is how you build your component library."
    Open Code: the primitive layer is yours to edit, not a dependency to fight.
50. **[O]** shadcn/ui — components.json — <https://ui.shadcn.com/docs/components-json>
    The `ui` / `components` / `lib` / `hooks` / `utils` aliases are effectively a
    formalized primitive-vs-feature boundary.
51. **[O]** shadcn/ui — Theming — <https://ui.shadcn.com/docs/theming>
    Tokens as CSS variables under `:root` / `.dark`; `X` ↔ `X-foreground` pairs;
    dark mode overrides variables, component classes never change.
52. **[O]** shadcn/ui — Forms / React Hook Form — <https://ui.shadcn.com/docs/forms/react-hook-form>
    Current API is `Field`/`FieldLabel`/`FieldError` + RHF `Controller`. Zod
    schema first, type via `z.infer`. `data-invalid` + `aria-invalid` + conditional
    `FieldError` are the stated a11y requirements.
53. **[O]** CSS — Next.js, updated 2026-03-20 — <https://nextjs.org/docs/app/getting-started/css>
    Tailwind for most styling; CSS Modules where utilities fall short; global CSS
    only for truly global. Import order = CSS order; verify with `next build`.
54. **[O]** CSS-in-JS — Next.js, updated 2025-07-28 — <https://nextjs.org/docs/app/guides/css-in-js>
    Runtime CSS-in-JS supported **in Client Components only**; Emotion still
    listed as in progress; requires a style registry + `useServerInsertedHTML`.
55. **[E]** CSS in React Server Components — Josh W. Comeau, 2024-04-15, updated 2026-02-15
    <https://www.joshwcomeau.com/react/css-in-rsc/>
    Best explanation of the mechanism. **Conflicts with #54**: claims
    styled-components v6.3.0+ supports RSC natively.
56. **[O]** Styling with utility classes — Tailwind — <https://tailwindcss.com/docs/styling-with-utility-classes>
    Component boundary = style boundary; `@apply` for anything non-trivial is the
    named anti-pattern; utilities over inline styles because "every value is a
    magic number".
57. **[O]** Theme variables — Tailwind v4 — <https://tailwindcss.com/docs/theme>
    Design tokens as `@theme` variables; namespaces `--color-*`, `--spacing-*`,
    `--radius-*`; each token emits both a CSS variable and utility classes.
58. **[O]** Accessibility — Radix UI Primitives — <https://www.radix-ui.com/primitives/docs/overview/accessibility>
    Roles, focus and keyboard belong to the primitive layer; the accessible
    **name** stays with the feature. That seam is where a11y hands off to i18n.
59. **[O]** Accessible Names and Descriptions — W3C WAI-ARIA APG
    <https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/>
    Priority: visible text → native HTML → `aria-labelledby` → `aria-label`.
    Visible text is preferred partly because it "reduces language translation
    requirements". Warning: `aria-label` on a role that names from child content
    hides that content from assistive technology.
60. **[O]** Messages — next-intl — <https://next-intl.dev/docs/usage/messages>
    "Provide the lowest common denominator" for a namespace.
    *Honest gap: this page does not specify where message files live on disk —
    the component-name-as-namespace convention comes from community practice.*

## G. Testing as a consequence of logic placement

61. **[E]** Testing Implementation Details — Kent C. Dodds, 2020-08-17
    <https://kentcdodds.com/blog/testing-implementation-details>
    False negatives on refactor, false positives on broken wiring; "users" means
    both end-users and the developers consuming your component's API.
62. **[E]** Write tests. Not too many. Mostly integration. — KCD, 2019-07-13
    <https://kentcdodds.com/blog/write-tests>
    The Testing Trophy; warns against over-testing units in isolation.
63. **[E]** How to test custom React hooks — KCD, 2020-03-22
    <https://kentcdodds.com/blog/how-to-test-custom-react-hooks>
    Prefers testing through a real component, but explicitly sanctions
    `renderHook` for complex hooks. *The common paraphrase "Dodds says don't test
    hooks separately" is an overstatement — do not propagate it.*

## Sources that could not be retrieved

Recorded rather than paraphrased, so nothing here rests on unverified content:

- `https://react-hook-form.com/get-started` and `/advanced-usage` — **HTTP 403**.
  React Hook Form's official docs were not verified directly; everything about
  RHF in this skill comes from shadcn/ui's documentation.
- `https://blog.serghei.pl/posts/where-your-types-live-matters/` — **HTTP 403**.
- `https://profy.dev/*` — **the domain is offline**: no A record remains (MX
  records still resolve). Content was recovered from the Wayback Machine and
  cross-checked against the author's dev.to cross-posts; both URLs are cited above.
- MVVM-for-React: no credible primary source was found. The available material is
  SEO/tutorial content whose only claim ("the custom hook is the ViewModel") is
  identical to Kondov's hook-as-port argument. Treated as a relabeling, not a
  distinct architecture, and not cited in the skill.
