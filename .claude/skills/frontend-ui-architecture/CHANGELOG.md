# Changelog

All notable changes to the `frontend-ui-architecture` skill.
Versioning follows [Semantic Versioning](https://semver.org/):

- **major** — a default answer reverses, or the reference layout changes in a way
  that invalidates links from other skills
- **minor** — new rules, new reference file, expanded coverage
- **patch** — corrections, clarifications, source updates

## 1.0.0 — 2026-08-03

Initial release. Splits code *placement and decomposition* out of
`react-best-practices`, which stays a code-level anti-pattern catalogue.

**Added**

- `SKILL.md` — a one-page decision table (16 default answers), five generating
  principles, a placement decision procedure, a routing map to the references,
  and the dev-digest project profile.
- `references/placement.md` — feature vs type organization, the delete test,
  promotion/demotion, dependency direction, public API per folder, nesting depth.
- `references/components.md` — responsibility-based splitting, why
  container/presentational is retired, `children`/slots, compound components,
  boolean-prop smells, render props in 2026, purity.
- `references/logic.md` — domain/application/UI logic, the pure-function-first
  rule, over-extraction limits, service layers and lightweight DI, validation vs
  domain rules, the server/client boundary.
- `references/state.md` — server vs client state, where state lives, state
  shaping, context as DI, memoization under React Compiler, the Effect table.
- `references/constants-and-config.md` — domain constants vs env config vs
  feature flags, magic values, env handling.
- `references/utils-and-types.md` — why `utils.ts` is not a location, type
  placement ladder, the barrel-file middle position, file naming.
- `references/styling-and-ui.md` — primitives vs feature components, design
  tokens, style placement, a11y layering, i18n as a structural boundary.
- `references/examples.md` — good/bad pairs drawn from `client/`.
- `README.md` — annotated bibliography of ~60 sources, nine contested calls with
  reasoning, remaining open conflicts, and unreachable sources recorded honestly.
- `evals/evals.json` — three trigger/behaviour test prompts.

**Known deliberate divergences from `react-best-practices`**

- Styling: this skill follows the codebase (inline style objects in a colocated
  `styles.ts`); `react-best-practices` says "no inline `style={}` objects",
  which was written for a Tailwind + Vite stack this project does not use.
- Memoization guidance is updated for React Compiler v1.0 (stable 2025-10-07).
