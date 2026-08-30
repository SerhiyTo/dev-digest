---
name: dependency-checker
description: 'Produces the dependency report for this repo: what every package depends on, how the packages depend on each other, what it all weighs, and — the part that decides whether anyone acts on it — which findings are worth fixing first. Use this skill whenever the question is about dependencies as a whole rather than one import: "перевір залежності", "що у нас важить", "які пакети зайві", "чому node_modules такий великий", "намалюй граф залежностей", "what depends on what", "do we have duplicate versions", "is this package still used", "which of these can we drop", "why do we have four copies of zod". Trigger it on a dependency audit, a version-drift question, an unused-package hunt, a bundle-weight complaint, an onboarding question about how the packages fit together, and before adding a dependency that might already be here under another name. Complements onion-architecture (which ring a file belongs to) and architecture-reviewer (what the current diff broke); this skill owns the repo-wide package inventory, the package-level graph, and the prioritisation. It reports and recommends — it never installs, removes or edits anything, and it never writes a file.'
version: 1.1.0
user-invocable: true
metadata:
  scope: shared
  tags: [dependencies, npm, pnpm, package-json, dependency-graph, bundle-size, version-drift, unused-dependencies, monorepo, inventory]
---

# Dependency Checker

Most dependency reports fail the same way. They enumerate. Forty-one packages in
`server/`, thirty in `client/`, a wall of version numbers, a `du` dump — every
statement true, nothing to do on Monday. The reader scrolls, thinks "we should
clean that up sometime", and closes the tab.

The report is only worth writing if it ends in an order of operations. So this
skill produces a fixed shape: an inventory, a graph, sizes, then **findings
ranked into four tiers**, then three to five things to actually do. The tiers
are the point. Everything before them exists to justify them.

Two habits keep it honest. **Every finding names a package and a file** — a
finding you cannot navigate to is a rumour. And **an empty P0 is a correct
answer**; a skill that audits things drifts toward finding something, and a
manufactured finding costs more than the silence it replaced.

## What this skill owns

| Question | Skill |
|---|---|
| What do we depend on, what does it weigh, what do we fix first? | **dependency-checker** (here) |
| Which ring does this file belong to; may it import that? | `onion-architecture`, `frontend-ui-architecture` |
| What did the current diff break? | `architecture-reviewer` (subagent) |
| Is this CVE exploitable here? | `security` |
| Does bumping this dependency break our consumers? | `semver-discipline` |
| May this PR merge? | `pr-self-review` |

The boundary with `onion-architecture` is the level: this skill draws the graph
**between packages**, that one governs imports **inside** a package. If a
finding is "`service.ts` should not import `drizzle-orm`", it is not this
skill's — hand it over.

**This skill never mutates anything.** It does not run `npm install`, does not
edit a `package.json`, does not delete a dependency, and does not write a report
file. It recommends; the user decides and acts.

## Collect first

```bash
node .claude/skills/dependency-checker/assets/collect-deps.mjs . > /tmp/deps.json
```

One JSON object: packages, external deps with sizes and import counts,
cross-package edges with `file:line` evidence, version drift, duplicate
installs, unused, phantom, misplaced. It reads `git ls-files`, so ignored trees
(build output, `server/clones/`, `node_modules`) never pollute the result.

Add `--audit` only when the user asks about vulnerabilities — it hits the
network and is slow.

The file runs to tens of KB. Read it in slices rather than whole; the query
recipes are in `references/collect.md`, along with the manual fallback for when
the script cannot run or `node_modules` is not installed.

**Do not trust a raw signal without reading the code behind it.** `unused` with
`confidence: "high"` is a candidate, not a verdict — open the package and
confirm. The false-positive classes that matter here are catalogued in
`references/findings-catalog.md`, and skipping that step is how a report ends up
recommending the deletion of something a config file loads by name.

## The report

Five sections, this order, these names. Nothing else at heading level 2.

````markdown
## Scope

Which packages were analysed, each one's package manager, whether its
`node_modules` was installed, and what was deliberately not looked at.
One line for audit if it was run: `pnpm/npm audit: 0 critical, 2 high, 5 moderate`.

Count the two kinds of dependency **separately and by name**: *external npm
packages* (what each `package.json` declares) and *internal cross-package links*
(tsconfig path aliases and relative imports between packages).

## Dependency graph

```mermaid
flowchart LR
```

Nodes are the repo's own packages. Edges are how they reach each other, labelled
with the mechanism. Conventions in `references/graph.md`.

## Size breakdown

| Package | Dependency | Installed | Type | Reaches a browser |
|---|---|---|---|---|

Heaviest first. End with a total per package and a total for the repo.

## Findings & Priorities

### P0 — breaks, or will break
### P1 — real cost, nothing broken yet
### P2 — hygiene
### Info — worth knowing, no action

One finding per bullet. Every one names a package and a file or a
`package.json` field. Empty tiers are stated, not omitted:
`**P0** — none.`

## Summary

3–5 numbered actions in priority order. Each is something a person can do this
week, with the file it happens in.
````

## The tiers

| Tier | The test | Anchors |
|---|---|---|
| **P0** | Something is broken now, or the next routine action breaks it | phantom dependency (imported, never declared — it works by accident through hoisting); a deep import reaching past a package's public entry point; version drift on a package that carries a contract across a boundary; `critical`/`high` from audit |
| **P1** | Nobody is blocked, but it costs — bytes, install time, or a future incident | unused declared dependency; a heavy runtime dependency that reaches the browser; a dependency in the wrong section (`devDependencies` but imported at runtime); two packages doing one job |
| **P2** | Hygiene. Right to fix, wrong to fix today | version drift on dev-only tooling; a build-critical tool left unpinned; a dependency earning its install for one call site |
| **Info** | A fact the reader should hold, not a task | totals, counts, and deliberate decisions that look like problems — record them so the next run does not re-report them |

Two rules on top of the table. **Drift is tiered by what the package carries,
not by how many versions there are**: five copies of `@types/node` is P2 because
nothing crosses a boundary on it, while two copies of a schema library whose
types cross a package boundary is P0 because the two copies produce
structurally-identical-but-incompatible types. And **anything you could not
verify goes in Info with the reason** — never silently upgraded to a finding to
make the report look productive.

## Good and bad

**1. The finding you cannot navigate to**

```markdown
❌ P1 — Some dependencies appear to be unused and could be removed.
```
```markdown
✅ P1 — `@fastify/autoload` is declared in `server/package.json:20` under
   `dependencies` and imported nowhere: no match in the 253 tracked source
   files, no mention in `scripts`, no bin invoked. Recommend removing it and
   running `pnpm -C server install` to confirm the build still passes.
```

**2. Disk size read as bundle size**

```markdown
❌ P1 — `mermaid` is 75.3 MB, our heaviest client dependency. Consider dropping it.
```
```markdown
✅ Info — `mermaid` is 75.3 MB installed, but installed size is disk, not
   payload: `client/src/components/mermaid-diagram/MermaidDiagram.tsx:75` pulls it
   through `await import("mermaid")` inside an effect, so it lands in a lazy chunk
   that only a page rendering a diagram fetches. Worth a real bundle measurement
   before treating it as a cost.
```

Installed size answers "how long does CI spend installing"; bundle size answers
"how long does a user wait". Never let one stand in for the other, and never
report a bundle number you did not measure.

**3. The unranked list**

```markdown
❌ Findings:
   - three copies of `@types/node`
   - `testcontainers` looks unused
   - `next` is very large
```
```markdown
✅ **P1** — `testcontainers` unused in `server/package.json:48` …
   **P2** — `@types/node` resolves to five versions across six packages …
   **Info** — `next` is 152.6 MB installed, the single largest package …
```

Three facts in a row is a list. The tier is what turns it into a decision, and
without one the reader has to redo the analysis to know where to start.

**4. Taking an unused-dependency signal at face value**

```markdown
❌ P1 — `pino-pretty` is declared in `server/package.json` but never imported.
   Remove it.
```
```markdown
✅ Info — `pino-pretty` is never imported, but `server/src/app.ts:57` names it
   as a pino transport target (`{ target: 'pino-pretty' }`), which pino resolves
   at runtime. It is required. Not a finding.
```

A grep for imports cannot see a dependency loaded by name. Transports, plugin
strings, config-file references and tools invoked by their bin all look
identical to a dead package until you open the file.

**5. Acting instead of recommending**

```markdown
❌ I removed `testcontainers` from `server/package.json` and reinstalled.
```
```markdown
✅ **Recommend removing** `testcontainers` from `server/package.json:48`
   (`@testcontainers/postgresql` is the one actually imported, in the `.it.test.ts`
   lane). Say the word and I will make the edit.
```

The skill's output is a report. Removing a dependency is a change to the repo
with its own review path, and the person who asked for an audit did not ask for
an edit.

**6. Naming a structure the repo does not have**

```markdown
❌ The workspace packages share `zod` through the root `node_modules`, so hoisting
   already deduplicates it.
```
```markdown
✅ These are six independent packages with six lockfiles and no workspace root.
   Nothing is hoisted or shared: `zod` is installed four times, once per package,
   and they agree on 3.25.76 only because the ranges happen to resolve the same
   way. Cross-package imports go through tsconfig `paths`, not through
   `node_modules`.
```

Getting this wrong invalidates every size number and every dedup recommendation
in the report. Check for a workspace root before assuming one.

## Rules that generate the rest

**Internal and external dependencies are two different kinds, and the report
says which it means.** An npm package is a version you chose and can change in
one line; an internal link is a coupling a person maintains by hand, invisible
to every dependency tool, and it fails in a way no lockfile explains. Count them
separately in `Scope`, keep npm packages out of the graph, and never put both in
one list — a reader who cannot tell which kind a finding is cannot tell who
fixes it.

**A finding without a location is not a finding.** Package name plus a file, a
line, or a `package.json` field. If you cannot cite it, you have not verified it
— put it in Info with the reason, or leave it out.

**Size is a cost only where it is paid.** Disk in CI, bytes in the browser,
seconds in an install. Say which one, and never quote a bundle number you have
not measured.

**Recommend; do not execute.** No installs, no removals, no edits to a
`package.json`, no file written.

**An empty tier is a result.** Write `**P0** — none.` and mean it.

## Where to read more

| Read this | When |
|---|---|
| `references/collect.md` | Running the collector, the JSON shape, slicing it, and the manual fallback per package manager |
| `references/findings-catalog.md` | Every finding type: how to detect it, its default tier, how to word it, and the false positives that look identical |
| `references/graph.md` | Mermaid conventions for the package graph — what to draw, what to leave out |
| `mermaid-diagram` (skill) | Mermaid syntax itself |
| `onion-architecture` (skill) | Import direction *inside* a package |

## Project profile: dev-digest

Root `CLAUDE.md` and each `<module>/CLAUDE.md` win if they contradict this file.

**Six packages, not four.** Root `CLAUDE.md` documents four modules; the repo
has six package roots, and a report that covers four is incomplete:

| Package | Manager | Lockfile | Notes |
|---|---|---|---|
| `server/` | pnpm | `pnpm-lock.yaml` | Holds the canonical `src/vendor/shared` that three other packages import |
| `client/` | pnpm | `pnpm-lock.yaml` | The **only** package whose dependencies reach a browser |
| `reviewer-core/` | npm | `package-lock.json` | Pure engine; pins `zod` to its own `node_modules` via tsconfig `paths` |
| `e2e/` | npm | `package-lock.json` | Dev-only, no runtime dependencies |
| `mcp/` | npm | `package-lock.json` | Same `zod` pin as `reviewer-core` |
| `evals/` | pnpm | `pnpm-lock.yaml` | Not in root `CLAUDE.md`; its `src/` is harness code, so importing `vitest` there is correct |

**Not a workspace, and this is the single most consequential fact.** Six
lockfiles, no root `package.json`, no hoisting. Every shared dependency is
installed once per package — `typescript` six times, `zod` four times — so
"deduplicate" is not available as a recommendation without proposing a
workspace, which is a much larger change than a dependency report should smuggle
in. Say the cost; do not quietly propose the restructure.

**Packages reach each other through tsconfig `paths`, never through
`node_modules`.** The edges that exist:

- `server` → `reviewer-core` via `@devdigest/reviewer-core` → `../reviewer-core/src/`
- `reviewer-core` → `server` via `@devdigest/shared` → `../server/src/vendor/shared/`
- `mcp` → `server` via `@devdigest/shared`, same target
- `client` → its own `src/vendor/shared` (a **mirror**, not the canonical copy) and `src/vendor/ui`

So `server/src/vendor/shared` is a de-facto shared package that no `package.json`
declares, and `client/src/vendor/shared` is a hand-maintained copy of it that
must move in the same commit. Neither shows up in any dependency tool. Draw both
in the graph.

**Aliases that point into `node_modules` are pins, not internal edges.**
`reviewer-core/tsconfig.json` and `mcp/tsconfig.json` map `zod` to their own
`./node_modules/zod` on purpose, so a second copy elsewhere cannot produce a
second, incompatible `z.infer` type. Report it as Info. It is a fix, not a bug.

**Local specifics worth knowing:**

- `server/clones/` is where the product clones the repositories it reviews. It is
  gitignored and contains entire third-party applications. Never count it — a
  filesystem walk that includes it will invent dozens of phantom dependencies
  from someone else's Nuxt app. The collector uses `git ls-files` for this reason.
- `dependency-cruiser` is a **runtime** dependency of `server/`, used by the
  product itself in `server/src/adapters/depgraph/`. It is not dev tooling here,
  and its binary is available at `server/node_modules/.bin/depcruise` if you want
  a file-level cross-check.
- `@types/*`, `tailwindcss`/`postcss`/`@tailwindcss/postcss` (loaded by
  `postcss.config.mjs`), `pino-pretty` (a pino transport named by string),
  `@vscode/ripgrep` (wanted for its binary), and anything invoked by its bin from
  `scripts` are all never-imported-by-design. The collector already accounts for
  each; do not re-report them.
- Everything is `private: true` at `0.0.0`. Nothing is published, so there is no
  registry consequence to any of this — the cost is entirely install time, disk,
  browser payload, and the chance that two copies of one type stop matching.
