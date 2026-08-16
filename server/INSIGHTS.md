# Insights

Accumulated non-obvious lessons from working in this module. Read this before
starting work here and treat entries as high-confidence guidance. Append-only:
add bullets at the top of the matching section (newest first); never rewrite,
reorder, or delete existing content — correct a wrong entry with a new dated
note. Entry format: `- YYYY-MM-DD: <insight> (evidence: path/file.ts:line)`.

## What Works
<!-- Approaches, patterns, and solutions that have proven effective here -->

## What Doesn't Work
<!-- Failed approaches, dead ends, antipatterns to avoid -->
- 2026-08-09: do NOT prove fence-escaping by asserting an absolute count of `</untrusted>` in a rendered prompt — the template's own SECURITY paragraph contains a literal `<untrusted>…</untrusted>` as prose, so the baseline is N+1 fences, not N, and the assertion fails on a perfectly safe render. Compare against a BENIGN render instead (`closers(hostile) === closers(benign)`), which states the property you actually care about: the attacker added no closer. Count opens with `<untrusted source="` to sidestep the prose entirely (evidence: server/test/intent-prompt.test.ts closers() helper; the prose fence at server/src/prompts/intent.classify.md SECURITY block)
- 2026-08-05: `pnpm db:generate` becomes INTERACTIVE whenever one table both drops and adds columns in the same diff — drizzle-kit asks "Is <col> created or renamed from another column?" per new column and there is no `--yes`/`--force` for it. It cannot be automated: piping newlines does nothing (it reads a raw TTY) and `printf '\n\n' | script -q /dev/null pnpm db:generate` HANGS indefinitely. ALWAYS split such a change into two runs — first edit the schema to only ADD the new columns and generate, then remove the old ones and generate again — which yields two unambiguous migrations and zero prompts (evidence: conventions reshape produced 0013_perpetual_invisible_woman.sql additions + 0014_daily_hitman.sql drops; server/src/db/schema/knowledge.ts conventions)
- 2026-08-04: in integration tests NEVER read `run_traces` after only `waitForPrRuns` — that returns as soon as `agent_runs.status` is terminal, which `RunExecutor` sets BEFORE it persists the trace, so `GET /runs/:id/trace` intermittently 404s and `prompt_assembly` comes back `undefined`. It is a genuine flake, not a slow machine: reproduced at ~1 in 4 full-suite runs while passing 3/3 in isolation. ALWAYS `await waitForRunTrace(db, runId)` (polls `run_traces`, throws on timeout) before touching the trace (evidence: server/test/helpers/runs.ts waitForRunTrace; server/src/modules/reviews/run-executor.ts status update precedes saveRunTrace; call sites server/test/reviews.it.test.ts:203,269,288)
- 2026-08-04: asserting a NEGATIVE on a persisted trace can pass vacuously — when a run throws, the catch path persists `prompt_assembly: { skills: null, user: '' }`, under which "skills is null" and "the prompt lacks `## Skills / rules`" are both trivially true even though the feature never ran. ALWAYS pin the run to `status === 'done'` and assert the prompt has real content before asserting what it lacks (evidence: server/src/modules/reviews/run-executor.ts failure-path trace; guard assertions server/test/reviews.it.test.ts:297-299)

## Codebase Patterns
<!-- Module-specific conventions, architecture decisions, naming patterns -->
- 2026-08-16: adding an extension to `SUPPORTED_EXT` does NOT make every
  parse-gating call site pick it up, even though `SUPPORTED_EXT` is the single
  source of truth for `walkClone`/`parseChangedFiles`/the phantom gate. THREE
  call sites (`pipeline/full.ts`, `pipeline/incremental.ts`,
  `service.ts` `getCallerSignatures`) gate on `langForFile(file) !== null`
  BEFORE ever calling `parseSymbols`/`parseReferences` — and `.vue` cannot
  have a single `Lang` (a file can hold two independently-langed script
  blocks), so `langForFile('x.vue')` stays `null` on purpose. Without fixing
  those three gates, `.vue` files would enter the walk, get correctly parsed
  by a Vue-aware `parseSymbols`/`parseReferences`, and then be silently
  counted as `filesSkipped` anyway because the caller never even tried. The
  fix is a new exported `isParseable(file)` (`langForFile(file) !== null ||
  isVueFile(file)`) that widens exactly that early-return check without
  touching the parse calls themselves. Any FUTURE extension added to
  `SUPPORTED_EXT` that can't map to a single `Lang` needs the same audit —
  grep `langForFile(` across `src/modules/repo-intel` and `src/adapters`, not
  just `SUPPORTED_EXT` (evidence: server/src/adapters/astgrep/index.ts
  `isParseable`; server/src/modules/repo-intel/pipeline/full.ts,
  incremental.ts; server/src/modules/repo-intel/service.ts
  `getCallerSignatures` line ~567/608 pre-fix)
- 2026-08-16: `@vue/compiler-sfc`'s `parse()` never throws for a malformed
  SFC (an unclosed `<script setup>` tag, a genuinely garbled file) — it
  returns a normal `SFCParseResult` with `errors.length > 0` and a `null`/
  empty-content block. Verified directly: `'<script setup lang="ts">\n  const
  x = {{{{\n</template>'` (unclosed script, mismatched closing tag) produces
  exactly one error `'Element is missing end tag.'`, `descriptor.script ===
  null`, `descriptor.scriptSetup.content === ''`. So "degrade on
  `errors.length > 0`" is a real, exercised branch, not defensive-only
  boilerplate — try/catch around the `parse()` call itself is still worth
  keeping for a napi-level or unexpected throw, but the actual malformed-input
  case for real SFCs goes through `errors`, not an exception (evidence: probe
  against `@vue/compiler-sfc@3.5.41`; server/src/adapters/astgrep/vue.ts
  `parseVueScriptBlocks`; server/test/astgrep-vue.test.ts "malformed source")
- 2026-08-16: measured against the real `kst-booking-front` clone (103 `.vue`
  files under `app/`, via a throwaway script running the shipped
  `parseSymbols`/`parseReferences`/`parseImports`): **all 103 parse cleanly**
  (`descriptor.errors.length === 0` for every file, zero exceptions), 9 have
  no `<script>` block at all (plan's manual count said 6 — re-measure rather
  than trust a hand count), 0 have both `<script>` and `<script setup>`
  simultaneously (matches the plan). Total yield: 85 symbols, 1071
  references, 213 imports. The low symbol count relative to reference count
  is expected and was called out in the plan — `<script setup>` bodies are
  almost entirely `const x = computed(...)`/`ref(...)` calls, which
  `isFunctionLike` correctly does NOT treat as symbols, so `.vue` files
  contribute mostly references + imports, not declarations (evidence:
  one-off script, deleted per the task's own instruction — not committed;
  rerun by copying the pattern in server/test/astgrep-vue.test.ts against the
  full `clones/Maze-Logic/kst-booking-front/app` tree if this needs
  re-verifying)
- 2026-08-16: `RepoIntel.getUnresolvedReferences`'s own interface doc
  (`modules/repo-intel/types.ts:156-160`) says "T2/T3: persistent
  `references.decl_file IS NULL`", but the live implementation
  (`service.ts` `getUnresolvedReferences`) was STILL the T1 ephemeral path as
  of Phase 3 of the repo-intel-vue-graph plan — it calls `parseInvocationHeads`
  (call/new/JSX heads only) directly on the clone and never queries the
  `references` table at all. Confirmed by grep: no caller anywhere reads
  `references` filtered on `decl_file IS NULL`, and `RepoIntelRepository`
  has no such method. Practical effect: adding `references.kind` (T3.2) could
  NOT poison this phantom gate because it never touches `references.kind` in
  the first place — the "exclude kind='type' from the phantom gate" task had
  no live code to change. Don't assume a doc comment describing a "T2/T3"
  target state means that state was ever built; grep for an actual DB query
  before writing the guard (evidence: server/src/modules/repo-intel/types.ts:156-161;
  server/src/modules/repo-intel/service.ts:578-627 getUnresolvedReferences;
  regression test server/test/repo-intel-facade-degraded.test.ts "phantom gate
  excludes type usages")
- 2026-08-16: `@ast-grep/napi`'s `SgNode.kind()` returns a project-typed
  `Kinds<TypesMap>` union, NOT `string` — passing it straight into a plain
  `Set<string>.has(...)` fails `tsc` with a confusing "Type 'number' is not
  assignable to type 'string'" (the union apparently includes numeric-looking
  literal members under the hood). Cast at the call site (`DECL_KINDS.has(pk
  as string)`); comparing with `=== 'literal'` doesn't hit this because `===`
  doesn't require full assignability the way a generic parameter does
  (evidence: server/src/adapters/astgrep/index.ts isDeclarationName)
- 2026-08-16: a plain (non-jsonb) Drizzle `text()` column takes a literal
  union the same way a jsonb `$type<>` field does —
  `text('kind').$type<'call' | 'type'>().notNull().default('call')` — and
  `pnpm db:generate` emits a clean single-column ADD migration for it (no
  interactive prompt, unlike the drop+add case already documented below).
  Confirmed against a live DB via the Testcontainers `.it.test.ts` lane, not
  just typecheck (evidence: server/src/db/schema/context.ts references.kind;
  server/src/db/migrations/0018_groovy_warbound.sql)
- 2026-08-16: `dependency-cruiser`'s `cruise()` takes resolveOptions as its
  **3rd positional argument** (`cruise(files, cruiseOptions, resolveOptions,
  transpileOptions)` — `node_modules/dependency-cruiser/types/dependency-cruiser.d.mts:90`),
  NOT as a key inside the 2nd-arg cruise options object. There is no
  `resolveOptions` field on `ICruiseOptions` at all — `alias` only reaches
  enhanced-resolve when passed as arg 3, typed via
  `Partial<IResolveOptions>` (`types/resolve-options.d.mts`, which extends
  enhanced-resolve's `ResolveOptions`). Passing `{ resolveOptions: { alias } }`
  inside arg 2 typechecks (extra property, no error under structural typing
  laxness at the cast site) and silently does nothing — the alias is never
  read. Proven end-to-end against the real clone at
  `server/clones/Maze-Logic/kst-booking-front`: wiring `alias` through arg 3
  plus `tsPreCompilationDeps: true` in arg 2 took `buildEdges()` from 0 → 209
  edges over 144 walked files; `kst-crm` (non-Nuxt, alias detector returns
  `null`) went 26 files → 33 edges, no regression (evidence:
  server/src/adapters/depgraph/index.ts `cruise(absPaths, options,
  resolveOptions)`; server/src/adapters/depgraph/nuxt-alias.ts)
- 2026-08-16: `server/src/adapters/depgraph/index.ts` had a literal NUL byte
  (`0x00`) embedded in `` `${from} ${to}` `` (the edge-dedup key) already
  committed at `HEAD` before this session touched the file — confirmed via
  `git show HEAD:...| python3 -c "...count(b'\x00')"` → `1`, so it predates
  any edit here. Its symptom is exactly what you'd expect from a genuinely
  bad edit: `file` reports `data` instead of `text`, and `git diff` on the
  file always prints "Binary files ... differ" (no readable diff) as long as
  the committed blob carries the byte, even after a working-tree fix. Fixed
  in-place by restoring the space separator via `bytes.replace()` in Python
  (the Edit tool's string-literal `old_string` cannot represent/match a raw
  NUL byte in its JSON parameter). If this file (or any other) ever shows as
  binary in `git status`/`git diff` again, check for a stray control byte
  before assuming corruption from your own change — `python3 -c
  "print(open(path,'rb').read().count(b'\x00'))"` finds it in one line
  (evidence: git blob `9ab8c5e` of server/src/adapters/depgraph/index.ts)
- 2026-08-16: to call a sibling slice's Container-held service without an
  `import type` from that slice (blocked by `no-cross-slice-imports`, which is
  `tsPreCompilationDeps: true` with no type-only exemption), re-declare a
  STRUCTURAL port in your own `ports.ts` naming only your own types, then do a
  plain `const engine: MyPort = container.otherSlice;` in `routes.ts` — no
  cast needed. TypeScript checks this via structural assignability, not the
  imported type's name, and depcruise only inspects literal import
  statements, so the container getter's real return type (which DOES import
  the other slice) never has to appear in your file. A method's return type
  is checked covariantly, so a narrower field there (e.g. a string-literal
  union) still satisfies a wider one declared in your port (e.g. plain
  `string`) (evidence: server/src/modules/blast/ports.ts BlastEngine vs
  server/src/modules/repo-intel/types.ts RepoIntel.getBlastRadius; wired at
  server/src/modules/blast/routes.ts `const engine: BlastEngine =
  container.repoIntel;`)
- 2026-08-16: any seed data meant to exercise `repo-intel`'s persistent blast
  path (`RepoIntelService.tryPersistentBlast`) needs FOUR tables kept in sync,
  not just `symbols`/`references`: (1) `repo_index_state.status` must be
  `'full'` or `'partial'` or the whole persistent path is skipped; (2)
  `references.decl_file` must be non-null and equal to one of the changed
  files, `to_symbol` must match a symbol name with no `.` in it (qualified
  `Class.method` rows are dropped on purpose); (3) `getResolvedCallers` INNER
  JOINs `file_rank` on `(repoId, references.from_path)` — a caller file
  without a `file_rank` row silently vanishes from the result, no error; (4)
  `getFileFacts`/`enclosingFromRows` read `symbols` rows for the CALLER files
  too (not just the changed ones) — skip that and every caller's enclosing
  name falls back to the file basename instead of a real function name
  (evidence: server/src/modules/repo-intel/repository.ts getResolvedCallers
  inner join; server/src/modules/repo-intel/service.ts tryPersistentBlast,
  enclosingFromRows; seeded in server/src/db/seed.ts repo-intel block)
- 2026-08-10: `ports.ts` may NOT import a sibling slice file other than
  `domain|ports|constants.ts` — dependency-cruiser `ring-1-domain-stays-pure` is
  `severity: error` and allows only `vendor/shared`, those three names, and
  `zod`. Row/DTO shapes therefore belong IN `ports.ts` with the pure logic file
  importing them, not the other way round (evidence:
  .claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs:53-67;
  server/src/modules/smart-diff/ports.ts)
- 2026-08-10: the current tree reports **7 pre-existing depcruise errors** (in
  `modules/reviews/helpers.ts`, `modules/conventions/service.ts`,
  `modules/skills/stats.ts`), not the 0 the onion-architecture README claims —
  so grep your own paths out of the report rather than expecting a clean exit
  (evidence: `npx depcruise --config .dc.cjs src` → "43 dependency violations
  (7 errors, 36 warnings)")
- 2026-08-10: ALL server tests live flat in `server/test/<topic>.test.ts` even
  though `vitest.config.ts` also globs `src/**/*.test.ts` — there is not one
  colocated test under `src/modules/`. Put a new unit test in `test/`, named
  after the slice (evidence: server/test/intent-confidence.test.ts,
  server/test/reviews-helpers.test.ts; `ls src/modules/*/*.test.ts` → no matches)
- 2026-08-10: `routes-smoke.test.ts` has NO single global route list to append
  to — it is one `it('registers the <module> module in the route table')` block
  per module, and `/pulls/:id/intent` is asserted nowhere. Add a sibling block
  (evidence: server/test/routes-smoke.test.ts:56-93)
- 2026-08-10: a DTO that must satisfy a contract should `safeParse` it in the
  service and throw `AppError('internal_error', …, 500)` — NEVER bare `.parse()`,
  because `app.setErrorHandler` maps any ZodError to **422** and would blame the
  client for a server-side breach. A `response:` schema is also wrong here:
  `fastify-type-provider-zod` strips unknown keys, turning a future additive
  field into silent data loss (evidence:
  server/src/modules/smart-diff/service.ts; server/src/app.ts:137-155)
- 2026-08-09: **correction to the "Go through `Container.featureModel`" entry below — do NOT do that.** Putting a cross-slice helper on the `Container` LOOKS like the sanctioned "container-held" sharing pattern and can quietly ADD an import cycle. `resolveFeatureModel` already imported `Container` to reach `container.db`, so `Container.featureModel()` closed `settings/feature-models → platform/container → settings/feature-models` — five `platform → modules` edges and four cycles, up from four and three. The fix that actually removes debt: declare the port in `vendor/shared/adapters.ts`, implement it under `src/adapters/`, and have the settings module DELEGATE to that implementation so there is still one. Check with depcruise BEFORE assuming a `warn` is the cheap option — net warnings went 38 → 40 → 36 across the two attempts (evidence: server/src/adapters/settings/feature-models.ts; port at server/src/vendor/shared/adapters.ts FeatureModelResolver; consumer server/src/modules/intent/routes.ts)
- 2026-08-09: type a jsonb column's `$type<>` with the literal union, not `string`, when its values mirror a contract enum. `IntentEvidenceRow.kind: string` forced `row.evidence as Intent['evidence']` at TWO mappers, laundering unvalidated DB data into a 9-value enum. Declaring the union in `db/schema/*.ts` (schema files must not import `vendor/shared`) makes the cast unnecessary AND makes drift a compile error — widening the contract enum immediately failed the assignment in `intent/ports.ts`, which is exactly the alarm you want (evidence: server/src/db/schema/reviews.ts IntentEvidenceKindRow; consumers server/src/modules/reviews/repository/pull.repo.ts getIntent and server/src/modules/intent/helpers.ts)
- 2026-08-09: `renderPrompt`/`renderTemplate` do a RAW `String.replace` and do NOT escape the interpolated value — unlike `reviewer-core`'s `wrapUntrusted`, which strips `</untrusted>`. So a `src/prompts/*.md` template that fences untrusted input is only as safe as the caller: a PR body containing a literal `</untrusted>` closes the fence and everything after it reads as trusted instructions. ALWAYS escape `</untrusted>` → `<\/untrusted>` in the module before interpolating. Two saving graces that are easy to misread as "it's handled": the replacer is a FUNCTION, so `$&` in the value is not expanded, and `String.replace` never re-scans replaced text, so a `{{placeholder}}` inside untrusted data is inert (evidence: server/src/platform/prompts.ts:34; the fix `escapeFence` at server/src/modules/intent/classifier.ts; test server/test/intent-prompt.test.ts "escapes a forged closer")
- 2026-08-09: a NEW slice must NOT import `modules/settings/feature-models.ts` to pick its model — the onion dependency-cruiser ruleset scores `no-cross-slice-imports` as `error`, and `conventions/service.ts` doing exactly that is a GRANDFATHERED violation, so copying the nearest working example introduces a hard failure. Go through `Container.featureModel(workspaceId, id)` instead ("a container-held repository" is the sanctioned sharing mechanism; `platform → modules` is an accepted `warn`). Same trap one level down: a new `service.ts` must take its ports in the constructor, never `Container`, even though every existing service takes `Container` (evidence: .claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs no-cross-slice-imports + LEGACY.crossSlice; server/src/platform/container.ts featureModel; ports in server/src/modules/intent/ports.ts wired at routes.ts)
- 2026-08-05: `JobRunner.enqueue` records a job failure and then RETHROWS into the `done` promise it returns — and NO caller awaited `done`, so a failing job was an unhandled rejection that KILLED the API process. It went unnoticed because only a handler that actually fails reaches it, and before conventions no handler ever came near the 120s timeout. FIXED at the source: `enqueue` now attaches `done.catch(() => {})` before returning, which marks the rejection observed without swallowing it — `.catch()` returns a new promise, so a caller that awaits `done` still sees the error. Do NOT remove that line; deleting it reproduces the crash immediately (evidence: server/src/platform/jobs.ts:113 and the regression suite server/test/jobs.it.test.ts, whose first case fails with "Unhandled Rejection" without it)
- 2026-08-05: do NOT put a paid LLM pipeline behind `JobRunner`. Its 120s handler timeout is GLOBAL (no per-kind override) and shorter than a real multi-call scan, and its retry re-runs the whole pipeline at full token cost. Its other offering, a `jobs` row, is redundant whenever the feature already owns a status table the UI polls. The conventions scan moved to a plain fire-and-forget background task — route awaits a `beginScan` that writes the 'running' row (so a 202 caller never polls a stale state), then starts the work unawaited — and only then could a scan actually complete (evidence: every real scan failed with "Operation timed out after 120000ms"; server/src/modules/conventions/routes.ts scan route, migration 0015 drops the now-meaningless convention_scans.job_id)
- 2026-08-05: a background task dies with its process, so ANY self-reported status table needs a boot-time reaper or rows sit at 'running' forever and the UI polls them indefinitely. Register it at plugin load and AWAIT it before the server accepts requests — a fresh process has no scans of its own yet, so every 'running' row at that moment is genuinely orphaned (evidence: server/src/modules/conventions/routes.ts reapStaleScans at plugin load, mirroring the agent_runs reaper in server/src/app.ts:81)
- 2026-08-05: a handler's own try/catch does NOT cover a job timeout — `withTimeout` is a `Promise.race` OUTSIDE the handler, so when it fires the handler is still suspended and its catch never runs. Any state the handler was meant to close (a 'running' status row) stays open forever and the UI polls it indefinitely. Budget the handler against the GLOBAL 120s timeout (there is no per-kind override) and remember `completeStructured` multiplies it by its own `maxRetries ?? 2` schema-repair loop: one call at 45s can legitimately take 135s and blow the job budget on its own (evidence: server/src/platform/resilience.ts:13 withTimeout; jobs row recorded exactly "Operation timed out after 120000ms" while convention_scans stayed 'running'; constants at server/src/modules/conventions/constants.ts)
- 2026-08-05: a `JobRunner` handler that THROWS is retried twice — `withRetry({ retries: this.retries })` with `retries` defaulting to 2 and no per-kind override — so any handler that spends money (LLM calls, embeddings) runs its whole pipeline THREE times on a single failure. ALWAYS catch inside the handler, record the failure in the feature's own state table, and return normally; let that table, not the `jobs` row, be the UI's source of truth. The 120s `withTimeout` is likewise global, so keep paid handlers well inside it with hard input budgets (evidence: server/src/platform/jobs.ts withRetry/withTimeout in enqueue; server/src/modules/conventions/service.ts runScan try/catch → finishScan('failed'))
- 2026-08-01: `findings.severity` is a plain `text NOT NULL` column — NO pg enum, NO CHECK, and the DTO mapper only casts (`row.severity as Finding['severity']`), so an out-of-contract value CAN reach a tally. Any severity rollup must therefore ignore unknown values rather than write them, or a contract-shaped `{CRITICAL,WARNING,SUGGESTION}` response grows a 4th key that fails client-side parsing (evidence: server/src/db/schema/reviews.ts:36; guard + test server/src/modules/pulls/status.ts foldSeverityRows, server/test/pulls-status.test.ts "keys match the PrMeta.findings_by_severity contract exactly")
- 2026-08-01: `findings` has no `pr_id` — per-PR finding aggregates MUST join through `reviews` (`findings.review_id → reviews.pr_id`), and the table had zero indexes until `findings_review_id_severity_idx` (migration 0011). Add the index alongside any new grouped aggregate over findings (evidence: server/src/modules/pulls/routes.ts sevByPr aggregate; server/src/db/migrations/0011_sticky_puma.sql)
- 2026-07-29: ALWAYS add new fields to RunStats/RunTrace as `.nullish()`, never plain/`.nullable()` — `run_traces.trace` is frozen jsonb written at run completion, so historical documents lack the key and a required field breaks client-side `RunTrace.parse` on every pre-existing trace (evidence: server/src/vendor/shared/contracts/trace.ts:65; regression test server/test/contracts.test.ts "historical stats without cost_usd")
- 2026-07-29: per-PR aggregates on `GET /repos/:id/pulls` (score, cost) follow one IN-query + JS Map, and must stay NULL-preserving — SQL `SUM` skips NULLs and returns NULL for all-NULL groups; NEVER coerce with `?? 0` or the UI shows a fabricated $0.00 instead of "—" (evidence: server/src/modules/pulls/routes.ts cost aggregate; it-test "PR list aggregates cost")

## Tool & Library Notes
<!-- Quirks, gotchas, and useful behaviors discovered about dependencies -->
- 2026-08-10: `reviewer-core/src/grounding.ts:16` EXEMPTS `secret_leak |
  lethal_trifecta | phantom | hook` findings from line-intersection grounding —
  they are kept when the *file* is in the diff, so their `start_line` can point
  at a line no hunk contains. Any feature that joins findings onto diff lines
  must treat an orphan line as normal, not as corruption (evidence:
  reviewer-core/src/grounding.ts:16)
- 2026-08-10: a prompt that fences untrusted input still needs an explicit OUTPUT
  LANGUAGE rule — without it the model mirrors the language of the PR it was fed,
  so a Ukrainian PR body yields Ukrainian text in `pr_intent`, in the English-only
  UI, and in the review prompt's `## Derived intent` slot. The injection guard's
  "ignore instructions IN ANY LANGUAGE" is about whose instructions win, NOT about
  what language to answer in; they are two separate rules (evidence:
  server/src/prompts/intent.classify.md "LANGUAGE — write every field in ENGLISH";
  server/test/intent-prompt.test.ts 'output language')
- 2026-08-10: **one Run Review writes one `reviews` row PER AGENT** —
  `insertReview` sits inside `for (const { agent, runId } of jobs)`, so a
  two-agent workspace produces two `kind='review'` rows for the same `pr_id`,
  each with its own `run_id`. There is NO single row and no single `run_id`
  representing "the last review", so any `ORDER BY created_at DESC LIMIT 1` over
  `reviews` silently keeps one agent and drops the rest. Aggregate every
  non-dismissed finding for the PR instead, the way the PR-list badge already
  does (evidence: server/src/modules/reviews/run-executor.ts:110,240;
  server/src/modules/pulls/routes.ts:151-165)
- 2026-08-10: correction — the `reviews.kind` entry below is still true about the
  schema, but its advice ("prefer `eq(kind,'review')` for a per-PR finding
  rollup") is superseded by the per-agent entry above: Smart Diff dropped the
  latest-row model entirely, so `kind` does not enter the query at all
  (evidence: server/src/modules/smart-diff/repository.ts `getFindings`)
- 2026-08-10: `reviews.kind` is `'summary' | 'review'` and `desc(created_at)`
  does not distinguish them, so "the latest review" can be a summary carrying
  zero findings while a `kind='review'` row seconds earlier has ten. Prefer
  `eq(kind,'review')` with an any-kind fallback for any per-PR finding rollup
  (evidence: server/src/db/schema/reviews.ts:29;
  server/src/modules/smart-diff/repository.ts)
- 2026-08-09: a pre-flight DNS check followed by an ordinary `fetch` does NOT stop SSRF — the name can resolve to something else between the check and the connect (DNS rebinding). Node's `http`/`https` `request` accepts a `lookup` option; passing a resolver that filters private/loopback/link-local/CGNAT/multicast/IPv4-mapped addresses means the socket connects only to an address you approved. Undici's `fetch` gives no equivalent hook, which is why this adapter uses `https.request` directly. Redirects must be followed MANUALLY with the allowlist re-checked per hop, or an allowlisted host 302s straight to an internal one (evidence: server/src/adapters/http/fetcher.ts guardedLookup + fetchGuarded; 38 guard tests in server/test/intent-ssrf.test.ts)
- 2026-07-29: Claude 5-family models (claude-sonnet-5, claude-opus-5, …) reject `temperature` with 400 "temperature is deprecated for this model" — ALWAYS route Anthropic tuning params through `anthropicTuningParams()`, which omits temperature when the major version ≥ 5; mirrors the existing `tuningParams()` pattern for GPT-5/o-series in openai.ts (evidence: server/src/adapters/llm/anthropic.ts anthropicTuningParams; test server/test/adapters.test.ts "anthropic tuning params")

## Recurring Errors & Fixes
<!-- Errors seen more than once and their confirmed fixes -->

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-08-16: repo-intel Phase 2 (Vue SFC support) — `@vue/compiler-sfc@^3`
  added (also switches on dependency-cruiser's built-in `.vue` handling);
  `.vue` joined `SUPPORTED_EXT` + ripgrep's separately-hardcoded `CODE_EXT`;
  new `adapters/astgrep/vue.ts` (`parseVueScriptBlocks`, script/script-setup
  parsed independently with file-absolute line offsets, degrades to `[]` on
  `descriptor.errors`); `parseSymbols`/`parseReferences`/`parseImports`/
  `parseInvocationHeads` branch internally on `.vue` and merge per-block
  results; new `isParseable()` widens the `langForFile`-based skip gates in
  `pipeline/full.ts`, `pipeline/incremental.ts` and `service.ts` (see Codebase
  Patterns); three-tier Nuxt/Vue auto-import carve-out in
  `getUnresolvedReferences` (compiler macros, a hardcoded Vue/Nuxt composable
  list, and a tier seeded live from the repo's own `composables/`+`utils/`
  dirs), applied only to `.vue` files; `INDEXER_VERSION` 3→4. Verified against
  the real `kst-booking-front` clone (103/103 SFCs parse cleanly, 85
  symbols/1071 references/213 imports) via a throwaway script, deleted after.
  depcruise baseline unchanged at 43 violations (7 errors, 36 warnings).
- 2026-08-16: repo-intel Phase 3 (type references) — `parseReferences` now
  extracts `type_identifier` usages (kind: 'call' | 'type', declaration-name
  disambiguated via the `name`-field-position rule), `references.kind` column
  (migration 0018, additive/NOT NULL default 'call'), `INDEXER_VERSION` 2→3,
  and an optional `BlastCaller.kind` threaded through `modules/blast/` +
  repo-intel's `BlastCallerRow`/`getResolvedCallers` (additive/MINOR — legacy
  payloads without `kind` still parse). Phantom-gate exclusion (T3.4) turned
  out to need no code change — see Codebase Patterns above.
- 2026-08-16: repo-intel Phase 1 (import-graph fixes, no Vue) — `tsPreCompilationDeps`
  + a Nuxt-aware `resolveOptions.alias` (3rd `cruise()` arg) in
  `adapters/depgraph`, and a `graphEmpty` health signal in
  `pipeline/{full,incremental}.ts` gated on `GRAPH_EMPTY_MIN_FILES`; proven
  against the real `kst-booking-front` clone (0 → 209 edges).
- 2026-08-10: L03 Smart Diff — `smart-diff/` module and `GET /pulls/:id/smart-diff`, a deterministic path classifier (core/wiring/boilerplate, Linguist-derived lists, no glob dep, no LLM call) merged with the latest `kind='review'` findings; zero contract edits, zero migrations, the DTO `safeParse`s itself; 47 tests incl. an 8-case Testcontainers lane; spec server/specs/2026-08-10-smart-diff.md.
- 2026-08-09: L03 Intent Layer (part 2) — reversed the no-network decision: linked GitHub issues via the authenticated client, other links via an SSRF-guarded fetcher behind an `intent_link_domains` allowlist (empty = fetch nothing); two-tier evidence so a fetched reference outscores a merely-referenced one; fixed the import cycle and the jsonb cast the reviewers found.
- 2026-08-09: L03 Intent Layer — `intent/` module (ports-not-Container, local-only sources incl. plan/spec files read from the clone behind a path-traversal guard, cheap `review_intent` model, evidence-derived confidence), migration 0016, `intent.classify.md`, the `## Derived intent` slot in reviewer-core and its read-only wiring in `run-executor`; spec server/specs/2026-08-09-intent-layer.md.
- 2026-08-05: L02 conventions extractor — `conventions/` module (two-step LLM scan behind a snippet-verifying grounding gate, triage, re-scan carry-over, merge into an `extracted` skill), migrations 0013/0014, `conventions.select.md` + `conventions.extract.md` as the first `renderPrompt` callers, seeded 3 candidates + a scan row; spec server/specs/2026-08-05-conventions.md.
- 2026-08-04: L02 skills — `skills/` module (CRUD, versioning, unified diff, restore, stats), `skill_versions.label` migration 0012, and the `renderSkillBlocks` → `run-executor` wiring that puts skill bodies into the prompt; seeded 3 skills + 2 reviewer agents with ordered links; spec server/specs/2026-08-04-skills.md.
- 2026-08-01: added `PrMeta.findings_by_severity` to the PR-list endpoint (COUNT…GROUP BY over findings⋈reviews, dismissed excluded, NULL when unreviewed), wired the previously-dead `rollupSeverities` helper, migration 0011 index; spec server/specs/2026-08-01-findings-by-severity.md.
- 2026-07-29: fixed 400 on Claude Sonnet 5 runs — Anthropic adapter now omits temperature for 5-family models (anthropicTuningParams + unit tests).
- 2026-07-29: re-added per-run cost (agent_runs.cost_usd, migration 0010, contracts, PR-list SUM aggregate) reversing d45ab0d; TDD across server+client.

## Open Questions
<!-- Unresolved things that need more investigation -->