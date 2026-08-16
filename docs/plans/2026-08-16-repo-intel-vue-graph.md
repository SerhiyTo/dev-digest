# Development Plan: Vue SFC support + a working import graph (`repo-intel`)

## Context

Blast Radius (L04) shipped and works, but on a real Nuxt codebase
(`Maze-Logic/kst-booking-front`) it answers only half its question: it lists
**what changed** and reports **0 callers** for everything. The cause is not in
`modules/blast/` — it is that `repo-intel`'s import graph for that repo is
completely empty:

| repo | index status | `file_edges` | refs with `decl_file` |
|---|---|---|---|
| `Maze-Logic/kst-crm` | full | 28 | 46 |
| `Maze-Logic/kst-booking-front` | partial | **0** | **0** |

`references.decl_file` is resolved *through* `file_edges`
(`repository.ts:386-425`), so zero edges ⇒ zero callers, always.

Three independent causes were found, **all reproduced directly** against the
clone — not inferred.

---

## Root cause 1 — Nuxt aliases resolve to nothing

`DepCruiseGraph.buildEdges` (`adapters/depgraph/index.ts:62-67`) passes
`tsConfig: { fileName: <root>/tsconfig.json }` when that file exists. It does
exist — but in a Nuxt 4 repo it is a project-references stub:

```json
{ "files": [], "references": [{ "path": "./.nuxt/tsconfig.app.json" }, …] }
```

No `compilerOptions`, no `paths`, and `.nuxt/` **does not exist** in a clone
(Nuxt generates it during `nuxt prepare`). `tsconfig-paths-webpack-plugin`
reads only the single file it is handed and does not follow `references`
(`dependency-cruiser/src/main/resolve-options/normalize.mjs:81-121`).

Reproduced:
```
{"module":"~/stores/useUserStore","resolved":"~/stores/useUserStore","couldNotResolve":true}
```

This is not a corner case in this codebase — it is essentially all of it:

| import form | count |
|---|---|
| `~/…` | **344** |
| bare (external) | 93 |
| relative | 3 |

## Root cause 2 — type-only imports are erased before extraction

Independent of aliases, and easy to miss. The adapter never sets
`tsPreCompilationDeps` / `parser: 'tsc'`, so dependency-cruiser extracts
dependencies from **type-stripped, transpiled JS** — where `import type` has
already been deleted (`dependency-cruiser/src/extract/tsc/extract.mjs:7-13`).

Reproduced on a *relative* (alias-free) type import: `dependencies: []`.

This matters more than it looks: the PR that prompted this work
(kst-booking-front#44) is almost entirely type work, and its central import is
literally `import type { DebtItem } from '~/types/debt'`. **Fixing aliases
alone would not have produced that edge.**

## Root cause 3 — `.vue` never enters the pipeline

`SUPPORTED_EXT` (`modules/repo-intel/constants.ts:14`) has no `.vue`, so
`walkClone` drops all 103 SFCs before anything else runs
(`pipeline/walk.ts:100-101`). For a Nuxt app that is where the callers live.

## A fourth finding — the failure is silent

`graphFailed` is set only when `buildEdges` **throws**
(`pipeline/full.ts:214-221`). A cruise that completes and returns modules whose
dependencies were all filtered out as `couldNotResolve` is indistinguishable
from a healthy graph: `edgesWritten: 0` is recorded in `stats` but gates
nothing. This repo's `status: 'partial'` is caused by something unrelated — a
single `parseDegraded` entry (`content.config.ts`, ENOENT: present on `main`,
absent on `develop`).

The module's own doc comment (`depgraph/index.ts:9-11`) says a broken tsconfig
"degrades to `[]`" via its try/catch. In this failure it never reaches that
try/catch. The comment describes a mechanism that is not the one that fired.

---

## What the fixes actually buy — honest calibration

**`parseReferences` records only `call_expression`, `new_expression` and JSX
elements.** A type used in a type position is not a reference. So for
kst-booking-front#44's 12 changed symbols:

| symbol | kind | callers after this work |
|---|---|---|
| `useDriverDebts` | function | **2** — real, `app/pages/profile/debts.vue:38,46` |
| `debtsKey` | function | 0 (module-private) |
| `DebtItem`, `DebtType`, `DebtStatus`, `DebtsFetchParams`, `DebtListResponse` | type/interface | **0 — by construction** |
| the 5 `Salary*` types | type/interface | **0 — by construction** |

So this plan turns "0 callers, always" into "callers for *called* symbols". For
a types-heavy PR that is still mostly zeros. Phase 3 addresses that, and is the
part that actually makes Blast Radius useful on a TypeScript codebase — it
should not be treated as optional polish.

---

## Phase 1 — make the graph work (no Vue yet)

Repo-agnostic; fixes every TS project, not just Nuxt.

**T1.1 — extract type-only imports.** In `adapters/depgraph/index.ts`, add
`tsPreCompilationDeps: true` to the cruise options. Cheapest single change with
the widest effect; needs no new dependency.

**T1.2 — resolve aliases without a build.** Pass
`resolveOptions.alias` (a native `enhanced-resolve` field dependency-cruiser
passes straight through — `types/resolve-options.d.mts`) instead of relying on
`tsConfig`. Compute the map per clone in a new small helper:

```ts
// Nuxt 4 defaults srcDir to <root>/app; Nuxt 3 defaults it to <root>.
// Detect rather than hardcode: presence of app/ plus an explicit srcDir in
// nuxt.config.* if one is declared.
{ '~': srcDir, '@': srcDir, '~~': root, '@@': root }
```

Only apply it when the clone looks like a Nuxt project, so non-Nuxt repos
(`kst-crm`, which works today via plain relative imports) are untouched.

**T1.3 — stop the silent failure.** Record an explicit graph-health signal:
when `walk.files.length` is non-trivial and `edgeRows.length === 0`, mark the
index degraded with a reason (`graph_empty`) rather than letting it read as
healthy. Also correct the misleading doc comment at `depgraph/index.ts:9-11`.

**Verify:** `edgesWritten > 0` for kst-booking-front's `.ts` files, and
`kst-crm` keeps its 28 edges / 46 resolutions.

## Phase 2 — Vue SFC support

**T2.1 — add `@vue/compiler-sfc@^3` to `server/package.json`** (pnpm). One
dependency serves both paths: it is also the exact package
dependency-cruiser feature-detects to switch on its **built-in** `.vue` support
(`dependency-cruiser/src/extract/helpers.mjs`, `transpile/vue-template-wrap.cjs`).
No `extensions` config is needed — `scannableExtensions` is computed from what
is require-able.

**T2.2 — `.vue` into `SUPPORTED_EXT`.** One constant, but it flows through
**eight** gates: `walk.ts:100`, `full.ts:137`, `incremental.ts:118` and `:147`,
`astgrep parseChangedFiles:616`, `depgraph hasSupportedExt:47-53`,
`service.ts:589` (phantom gate), plus a **separate hardcoded `CODE_EXT`** in
`adapters/codeindex/ripgrep.ts:25` that is *not* derived from the constant and
must be updated in step.

**T2.3 — a `parseVueSfc` path in the astgrep adapter.** `@ast-grep/napi@0.43.0`
has **no `Lang.Vue`** (its enum is `Html, JavaScript, Tsx, Css, TypeScript`),
and no maintained Vue tree-sitter grammar parses embedded script. Also
`parseSymbols` walks only top-level `root.children()`, so an HTML grammar would
not reach declarations inside `<script>` anyway. Therefore: extract the script
block(s) and parse the *text* with the existing grammars.

```ts
const { descriptor, errors } = parseSFC(source, { filename: file });
for (const block of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
  const lineOffset = block.loc.start.line - 1;   // file-absolute already
  const root = parse(langFor(block), block.content).root();
  // …existing walkers; every emitted line += lineOffset
}
```

Three details that are load-bearing:
- `block.loc.start.line` is **file-absolute**, so the shift is a flat add — no
  byte counting, no source maps.
- Parse `<script>` and `<script setup>` **separately**, each with its own
  offset. Concatenating them (what dependency-cruiser does internally for its
  own import-only needs) destroys line correctness.
- Do **not** use `compileScript` — it macro-expands `defineProps`/`defineEmits`
  and returns transformed text, which would need a source-map round trip.

**T2.4 — carve out Nuxt auto-imports from the phantom gate.** `useI18n()`,
`computed()`, and every composable auto-imported from `app/composables`/`utils`
are ordinary calls with **no import statement**. The phantom gate treats
"called but not declared or imported" as a phantom API
(`astgrep/index.ts:477-482`), so without a carve-out every legitimate Nuxt
auto-import becomes a false finding. Seed an allowlist from the repo's own
`composables/` + `utils/` directories, mirroring Nuxt's `imports.dirs`.

**T2.5 — bump `INDEXER_VERSION` 2 → 3.** Compared in exactly one place
(`incremental.ts:78`); a bump forces one full reindex per repo, which is
required because the parser's shape changed.

**Expected effect:** ~103 more files indexed for this repo (162 → ~265) and,
critically, the edges *from* SFCs — which is where callers live.

**Calibrate the symbol expectation:** `<script setup>` bodies are mostly
`const x = computed(...)`. `isFunctionLike` correctly rejects a `computed()`
call, so those are **not** symbols. `.vue` files will contribute many
references and edges but few declarations. That is exactly what Blast Radius
needs, but it means "symbols indexed" will not jump the way file count does.

## Amendment (2026-08-16, after Phase 1 shipped)

Phase 1 landed and works: kst-booking-front went **0 → 209 edges** and
**0 → 75 resolved references**, `partial → full`; kst-crm unchanged at 28/46
(no regression). PRs #24/#32/#45 now show real callers where every PR
previously showed zero.

**But the first verification measured no change at all**, and the reason is an
operational gap worth recording: `POST /repos/:id/resync` runs the *incremental*
path, which short-circuits on `currentSha === state.lastIndexedSha`
(`incremental.ts:97-106`) and returns `sha_unchanged` **without rebuilding the
graph**. After a change to *how* the graph is built — as opposed to a change in
the code being indexed — every existing repo therefore keeps its stale, empty
graph indefinitely, and a resync reports success while doing nothing. The 209
edges only appeared after forcing a full reindex.

The one mechanism that forces a rebuild is `INDEXER_VERSION`, compared at
`incremental.ts:78`. It was scheduled for Phase 2; **it moves to Phase 3**,
which needs it anyway because the parser's output shape changes. A single bump
`2 → 3` serves both reasons — do not bump twice.

## Phase 3 — type references (what makes this useful on TS)

Currently a changed `interface` can never have callers. Add a reference kind
for **type usage** — `type_identifier` in type annotations, `extends`/
`implements` clauses, and generic arguments — so that changing `DebtItem`
surfaces the files that consume it.

This is the single highest-value change for a TypeScript codebase, and the
`references` table already has room for it (`to_symbol` is just a name). It
needs a `kind` discriminator so a type usage is not misreported as a call in
the UI, which is a contract-visible change to `BlastCaller` and therefore its
own semver decision.

### The extraction rule — verified against the grammar, not assumed

Probing `@ast-grep/napi` with the real TypeScript grammar shows `type_identifier`
covers every usage form — and exposes one trap:

| parent node | example | usage? |
|---|---|---|
| `type_annotation` | `x: DebtItem` | yes |
| `union_type` | `A \| B` | yes |
| `extends_type_clause` | `interface X extends DebtItem` | yes |
| `implements_clause` | `class C implements DebtItem` | yes |
| `type_arguments` | `Array<DebtItem>` | yes |
| `interface_declaration` / `class_declaration` | `interface Extended` | **no — declaration** |
| `type_alias_declaration` | `type Alias = DebtItem` | **both** |

In `type Alias = DebtItem` the declared name *and* the referenced type share
the same parent kind, so filtering on parent alone either loses the usage or
makes a type its own caller. The rule that works: take every `type_identifier`
**except** those that are the `name` field of a declaration node
(`interface_declaration`, `class_declaration`, `type_alias_declaration`,
`enum_declaration`). Verified:

```
Alias      parent=type_alias_declaration   → DECLARATION (skip)
DebtItem   parent=type_alias_declaration   → usage (keep)
Extended   parent=interface_declaration    → DECLARATION (skip)
DebtItem   parent=extends_type_clause      → usage (keep)
```

### Two cross-feature consequences

- **The phantom gate must exclude type references.** `getUnresolvedReferences`
  feeds L06 off references with `decl_file IS NULL`; unresolved *type* usages
  would arrive as phantom-API findings. Filter by kind there.
- **Reference volume grows.** Types are referenced far more densely than
  functions are called. `MAX_CALLERS_PER_SYMBOL` already caps what Blast Radius
  shows, but the `references` table itself gets bigger — worth measuring, not
  assuming.

**Recommendation:** do Phase 1 first (cheap, repo-agnostic, immediately
measurable), then Phase 3, then Phase 2 — Phase 3 outranks Vue support for
*this* PR's shape, and Phase 2 is the larger surface.

---

## Files

| Phase | File | Change |
|---|---|---|
| 1 | `server/src/adapters/depgraph/index.ts` | `tsPreCompilationDeps`, `resolveOptions.alias`, corrected doc comment |
| 1 | `server/src/adapters/depgraph/` (new helper) | Nuxt srcDir/alias detection |
| 1 | `server/src/modules/repo-intel/pipeline/{full,incremental}.ts` | `graph_empty` health signal |
| 2 | `server/package.json` | `@vue/compiler-sfc@^3` |
| 2 | `server/src/modules/repo-intel/constants.ts` | `.vue` in `SUPPORTED_EXT`, `INDEXER_VERSION` → 3 |
| 2 | `server/src/adapters/astgrep/{index.ts,vue.ts}` | `parseVueSfc`, `langForFile` handling |
| 2 | `server/src/adapters/codeindex/ripgrep.ts` | `CODE_EXT` (separate hardcoded list) |
| 2 | `server/src/modules/repo-intel/service.ts` | phantom-gate carve-out |
| 3 | `server/src/adapters/astgrep/index.ts` + contracts | type-usage references |

## Tests

Existing tests that **will** break and must be updated deliberately, not
silenced:
- `server/test/indexer-pipeline.test.ts:161-207` asserts `filesSkipped === 0`.
  A `.vue` that enters the walk but returns `null` from `langForFile` breaks it.
- `server/test/indexer-walk.test.ts:47-54` asserts `result.files` **exactly
  equals** `['src/index.ts']`.
- `server/test/astgrep.test.ts:18-31` — `langForFile` assertions are
  truthy/null only, so `.vue` is additive there.

New: SFC fixtures covering `<script setup lang="ts">`, plain `<script>`, both
present, no script block, and — the one that actually guards the hard part — a
**line-offset assertion** proving a symbol declared on line N of the SFC is
reported as line N, not as its offset within the extracted block.

Integration: a Nuxt-shaped fixture repo asserting non-zero `file_edges` and a
resolved `decl_file`, so a regression in alias handling fails loudly.

## Risks and limits

1. **`#app`, `#ui` virtual modules stay unresolved.** Confirmed present in this
   clone (`app/composables/useFetch.ts`, `useDriverTripDetailsSlideover.ts`).
   They are build-time virtuals, not files; no alias map fixes them. They will
   remain `couldNotResolve` and are correctly dropped as external.
2. **Template-only usage is still invisible.** `<DebtItem />` in a `<template>`
   with no script reference produces no edge. Recovering it means walking
   `descriptor.template.ast` (available free from the same `parse()` call) for
   `ElementTypes.COMPONENT`. Deliberately out of scope here; name it in the
   spec so the gap is known rather than discovered.
3. **Indexing cost roughly doubles** for SFC-heavy repos. `INDEX_SOFT_BUDGET_MS`
   and `MAX_INDEXED_FILES` (5000) may need review; blowing the soft budget
   silently skips the entire T3 graph block (`full.ts:214`), which would
   reintroduce the empty graph by a different route.
4. **`@vue/compiler-sfc` returns no imports when `descriptor.errors` is
   non-empty** — dependency-cruiser gives up rather than partially recovering.
   Worth measuring how many of the 103 SFCs parse cleanly before relying on it.
5. **A new dependency in the backend.** `@vue/compiler-sfc` in a server that
   does not render Vue is justified only because it is *also* the switch for
   dependency-cruiser's `.vue` support. If Phase 2 is dropped, drop the
   dependency with it.

## Verification

```sh
cd server && pnpm typecheck && pnpm test
# graph actually built, per repo:
docker exec devdigest-postgres psql -U devdigest -d devdigest -c "
  select r.full_name, s.status,
         (select count(*) from file_edges e where e.repo_id=r.id) edges,
         (select count(*) from \"references\" f
           where f.repo_id=r.id and f.decl_file is not null) resolved
  from repos r join repo_index_state s on s.repo_id=r.id;"
```

End-to-end: resync kst-booking-front, then open PR #44's Overview. The
acceptance bar for Phase 1+2 is honest and narrow: **`useDriverDebts` shows 2
callers** (`app/pages/profile/debts.vue`). The type symbols stay at zero until
Phase 3 — if they show callers before Phase 3, something is over-reporting.

Regression bar: `kst-crm` keeps 28 edges / 46 resolutions, and
`acme/payments-api` keeps its seeded blast radius intact.
