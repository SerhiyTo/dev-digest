# Improvement plan — 2026-08-03

Consolidated from five parallel audits, each driven by a repo skill:

| Lens | Skills applied |
|---|---|
| `client/` placement & decomposition | frontend-ui-architecture, react-best-practices, next-best-practices |
| `server/` framework, queries, schema | fastify-best-practices, drizzle-orm-patterns, postgresql-table-design |
| Backend layering | onion-architecture |
| Cross-cutting | security (OWASP 2025), zod, typescript-expert |
| Engine, tests, CI, hygiene | react-testing-library, typescript-expert, frontend-ui-architecture |

Every claim below was verified against a specific file and line. Findings that
two audits raised independently are merged and marked. Items are ordered by
"what breaks or leaks" first, "what costs to maintain" second.

---

## P0 — Do before anything else

### 0.1 Rotate the GitHub PAT

`withGitHubToken` (`server/src/modules/repos/helpers.ts:34`) puts the token in
`u.password`, and `git clone` writes that URL verbatim into `.git/config`.
Verified on this machine: all three clones under `server/clones/` contain the
credential in plaintext, mode `-rw-r--r--`.

Contained: `clones/` is gitignored (`.gitignore:20`), 0 tracked files.

**Correction to an earlier claim in this audit:** the token does *not* reach the
`jobs.error` column. Tested on git 2.52 — git redacts credentials from its own
error output. The exposure is the on-disk `.git/config` plus the process table
during the clone (`ps`).

Fix: rotate the token, then pass credentials via `GIT_ASKPASS` or
`-c credential.helper` instead of userinfo in the URL. **Effort M.**

### 0.2 Anchor the repo URL regex — SSRF, path traversal, and command execution

`server/src/modules/repos/constants.ts:18`:

```
/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?\/?$/
```

Unanchored at the start, and `[^/]+` accepts `..`. Verified behaviour:

| Input | Result |
|---|---|
| `https://attacker.tld/github.com/o/n` | accepted |
| `file:///tmp/x/github.com/o/n` | accepted |
| `ext::sh -c whoami/github.com/a/b` | accepted — git spawns a shell transport |
| `https://attacker.tld/repo/github.com/../pwned` | accepted, `owner=".."` |
| `https://github.com/vercel/next.js` | **rejected** — legitimate repo with a dot |

`service.ts:98-103` enqueues the *original* URL, which reaches `git clone` at
`adapters/git/simple-git.ts:68`. `clonePathFor` (`simple-git.ts:38`) then
resolves `join(cloneDir,'..','pwned')` and `mkdir`s it (`:56`).

Fix: anchor to `^https://github\.com/…$`, validate owner/name against
`/^[A-Za-z0-9._-]+$/`, rebuild the clone URL from the parsed parts rather than
passing user input through, and assert the resolved destination stays inside
`cloneDir`. **Effort S** — highest value-per-hour item in this document.

### 0.3 The API is unauthenticated and listens on all interfaces

`server/src/server.ts:29` binds `0.0.0.0`; `adapters/auth/local.ts` returns the
seeded user regardless of the request. No route has an auth barrier. Anyone on
the same network can read every diff and run trace, overwrite stored provider
credentials, and trigger clones.

Fix: bind `127.0.0.1` by default (one line, immediate), then add a shared-secret
`preHandler` registered before the module loop in `app.ts:168`. **Effort M.**

### 0.4 Provider keys are persisted before they are validated

`server/src/modules/settings/routes.ts:79-85` calls `secrets.set` and
invalidates caches, *then* tests the connection. A failed test leaves the bad
key stored — and combined with 0.3, any LAN caller can overwrite the working
credential. Fix: test first, persist on success only. **Effort S.**

---

## P1 — Correctness and data integrity

### 1.1 There are zero database transactions in the entire server
*Raised independently by the backend and layering audits.* Verified:
`grep -rn "\.transaction(" server/src` → 0 hits.

Broken invariants:

- `modules/reviews/run-executor.ts:219-244` — `insertReview` → `insertFindings`
  → `markReviewed` → `completeAgentRun` as four independent writes. A failure
  mid-sequence leaves a review with no findings and `last_reviewed_sha` unset
  while the run reads `done`.
- `modules/repo-intel/repository.ts:246-249` + `pipeline/full.ts:204-206` —
  wipes the whole symbol index before rewriting it. Same delete-then-insert
  shape in `replaceEdges` (`:352`), `replaceFileRank` (`:362`),
  `replaceFileFacts` (`:372`).

Fix: collapse the reviews write path into one repository method using
`db.transaction`; thread a `tx` through the repo-intel replace methods.
**Effort M.**

### 1.2 `GET /pulls/:id` truncates tables outside a transaction and misreports failures

`modules/pulls/routes.ts:224` deletes all `pr_files`, `:236` all `pr_commits`,
then re-inserts. The whole block sits in one `try` whose catch (`:261-262`)
logs *"GitHub PR detail refresh skipped (no token / offline)"* and then reads
the tables it just emptied. A DB error or crash between delete and insert loses
the PR's files permanently and is reported as a GitHub outage — and `loadDiff`
falls back to `pr_files` (`modules/reviews/diff-loader.ts:29`), so reviews
silently degrade to an empty diff.

Fix: wrap delete+insert in a transaction and narrow the `try` to the Octokit
call only. **Effort S.**

### 1.3 `RunBus` leaks per-run buffers and is allocatable by any caller

`platform/sse.ts:103` is a module-level singleton. `complete()` (`:76-83`)
deletes the emitter but never `buffers`, `seq` or `completed`, so every run's
full event payload stays resident for the process lifetime. `emitterFor()`
(`:37-49`) allocates for *any* runId, and `GET /runs/:id/events` has
`rateLimit: false` (`modules/reviews/routes.ts:50`) with no auth — repeated
requests with random UUIDs grow the maps without bound. The generator
(`routes.ts:72-85`) awaits with no timeout, so such a connection hangs forever.

Fix: evict buffers on `complete()`, allocate only on `publish`, add an idle
timeout and max duration to the SSE generator. **Effort M.**

### 1.4 Shutdown drains neither review runs nor the job queue

`server/src/server.ts:9-10` claims `app.close()` drains in-flight work, but the
only `onClose` hook (`app.ts:173`) closes the pool. Review execution is
fire-and-forget (`modules/reviews/service.ts:133` `void this.executor…`) and
`JobRunner`'s queue (`platform/jobs.ts:40`) is never awaited — SIGTERM closes
the pool underneath live runs. Conversely an active SSE stream can block
`app.close()` until the run finishes.

Fix: track in-flight run promises, `await queue.onIdle()` in an `onClose` hook,
add a shutdown deadline. **Effort M.**

### 1.5 Unbounded LLM retry budget with no deadline and no cancellation

`reviewer-core/src/llm/openrouter.ts:54-55` sets `timeout: 90_000, maxRetries: 2`,
and `:68` wraps that in a repair loop of `maxRetries + 1` (`run.ts:32`). Worst
case ≈ 9 HTTP attempts ≈ 13.5 min **per chunk**, and `run.ts:146` creates one
chunk per file. `checkCancelled` is only consulted between chunks (`run.ts:164`)
and no `AbortSignal` reaches the provider, so a user cancel or SSE disconnect
cannot stop an in-flight call.

Fix: thread an `AbortSignal` and wall-clock deadline through `ReviewInput` →
`completeStructured`; cap total attempts across chunks. **Effort M.**

### 1.6 Boot-time run reaping is a global unscoped UPDATE

`modules/reviews/repository/run.repo.ts:105-112` sets every `running` row to
`failed` with no workspace, instance or age predicate, and runs unconditionally
inside `buildApp()` (`app.ts:81`) — which every integration test also calls. A
second process marks another process's live runs failed.

Fix: scope by instance id/heartbeat, or at minimum `ran_at < now() - interval`.
**Effort M.**

---

## P2 — Contracts and validation

### 2.1 The vendored `@devdigest/shared` mirror has drifted
*Raised independently by the cross-cutting and infrastructure audits.*

`diff -rq` reports **5 differing files**: `adapters.ts`,
`contracts/{eval-ci,knowledge,productionize,trace}.ts`. Concretely
`LLMProvider.id` is `'openai' | 'anthropic' | 'openrouter'` on the server and
`'openai' | 'anthropic'` on the client. The client copy is also internally
inconsistent — its `knowledge.ts` Provider *does* include `openrouter` while
`productionize.ts:36` and `eval-ci.ts:220` do not. Missing from the client
entirely: `AgentManifest`, `AgentVersion`, `CommitFile`, `GitClient.sync`,
`GitHubClient.commitFiles`, `CompletionRequest.sessionId`.

`index.ts` is byte-identical, so the drift is invisible at the barrel. Both
`CLAUDE.md` files say "never diverge them" and nothing enforces it.

Fix: replace the manual mirror with a copy script plus a CI
`diff -ru server/src/vendor/shared client/src/vendor/shared` gate. **Effort S**
for the gate, M for the script.

### 2.2 Nothing validates a response at runtime, on either side
*Raised by three audits.* Zero `response:` declarations across
`server/src/modules/**` — every handler returns a hand-built object typed only
by a TS annotation (`modules/pulls/routes.ts:202`). The
`isResponseSerializationError` branch at `app.ts:130` is therefore dead code.
The client mirrors the same schemas but never parses: `client/src/lib/api.ts:62`
`return (await res.json()) as T`, and `lib/hooks/reviews.ts:188`
`JSON.parse(ev.data) as RunEvent`.

This is precisely why 2.1 is silent. Fix: add `schema.response[200]` from the
existing contracts, starting with `PrMeta[]` / `PrDetail` / `RunSummary[]`, and
`safeParse` in `apiFetch` and the SSE handler. **Effort M.**

### 2.3 `Settings` is `.passthrough()`, so `PUT /settings` writes arbitrary keys

`server/src/vendor/shared/contracts/platform.ts:99-103` feeds
`modules/settings/routes.ts:52`'s `for (const [key, value] of Object.entries(body))`.
Unknown keys with unknown values are upserted; the read path casts straight back
(`settings/helpers.ts:13`). Fix: drop `.passthrough()`, parse rows through
`Settings` on read. **Effort S.**

### 2.4 Status and severity columns are unconstrained `text`
*Raised by two audits.* `findings.severity` (`db/schema/reviews.ts:45`) has no
enum and no CHECK, and reaches the API via a bare cast in
`modules/reviews/helpers.ts:37`. Same for `pull_requests.status`
(`db/schema/pulls.ts:25`) and `agent_runs.status` (`db/schema/runs.ts:21`,
**nullable** despite the code comparing it to a closed set).

The pattern already exists in the same files — `runs.ts:24` uses
`text(..., { enum: [...] })`. It just wasn't applied.

Fix: add `{ enum: [...] }` plus a CHECK migration, `NOT NULL DEFAULT 'running'`
on `agent_runs.status`, and `Severity.safeParse` in `findingRowToDto`.
**Effort S.**

### 2.5 Tenancy is resolved and then discarded (latent IDOR)

`modules/reviews/routes.ts:121-125` awaits `getContext(...)`, throws the result
away, and calls `getRunTrace(req.params.id)` — the trace contains the full
assembled prompt and diff. Same shape at `reviews/routes.ts:114-117`,
`repo-intel/routes.ts:38-39` and `:53-55`.

Harmless today with one workspace; a cross-tenant leak the moment `AuthProvider`
is swapped, which the code explicitly anticipates. Fix: thread `workspaceId`
into those queries. **Effort M.**

### 2.6 Missing indexes on every foreign key used in hot queries

No `CREATE INDEX` in any migration for: `reviews.pr_id`, `reviews.run_id`,
`agent_runs.pr_id`, `pr_files.pr_id`, `pr_commits.pr_id` — all filtered on in
the PR list and detail paths. Fix: one migration adding `(pr_id, created_at)`
and `(run_id)` on `reviews`, `(pr_id, ran_at)` on `agent_runs`, `(pr_id)` on
`pr_files`/`pr_commits`. **Effort S.**

### 2.7 Exactly one `.limit()` in the whole server

`repo-intel/repository.ts:458`. Unbounded and unpaginated: all PRs for a repo
including body text (`pulls/routes.ts:85-88`), all reviews plus all findings
(`review.repo.ts:62-69`), all runs for a PR (`run.repo.ts:45-50`), all cached
symbols, and `getRepoMapCandidates` (`:462-483`) which sorts every
signature-bearing symbol in a repo into memory. **Effort M.**

### 2.8 The error handler echoes internal messages to clients

`app.ts:160-163` returns `message: e.message` for any unrecognised error, so a
postgres error surfaces constraint and column names to the HTTP client. Fix:
constant message for `statusCode >= 500`, pass-through only for `AppError`.
**Effort S.**

---

## P3 — Backend layering

The layering audit ran the `onion-architecture` skill's own dependency-cruiser
ruleset: **35 violations, 149 modules, 462 dependencies**, all currently
classified "legacy".

Its verdict, which this plan adopts: this is a conventional layered app with
adapter-shaped folder names. Given ~13k lines and a course project it should
become **a disciplined layered app that inverts exactly one thing**, not full
hexagonal. Do 3.1 and 3.3; do 3.2 only for the reviews run path and repo-intel.

### 3.1 Four slices are a route file and nothing else
*Overlaps with the backend audit's finding on the same files.*
`modules/pulls/routes.ts` (~200 lines of GitHub sync, backfill, three aggregate
queries and DTO mapping in two handlers, with `import * as t from '../../db/schema.js'`
at `:6`), `modules/polling/routes.ts:22-63`, `modules/settings/routes.ts:30-66`,
`modules/workspace/routes.ts:18-21`. No repository, no service, so no seam below
HTTP and nothing unit-testable.

`repos`, `agents`, `reviews` and `repo-intel` already follow the documented
`routes → service → repository` shape, so the target is established.

Fix: extract `repository.ts` verbatim, then `service.ts`, one slice at a time.
Start with `workspace` (34 lines) to establish the shape, finish with `pulls`.
Transactions in 1.1/1.2 fall out of this work. **Effort L overall, S per small slice.**

### 3.2 Every service takes `Container`, so nothing is substitutable

`modules/{repos,agents,reviews,repo-intel}/service.ts` plus `run-executor.ts:44`
and `diff-loader.ts:13`. The cost is already visible in the suite:
`server/test/agents-versions.it.test.ts:167` writes
`new AgentsService({ db } as unknown as Container)` — a cast through `unknown`
is the test reporting a missing seam.

Fix: add `ports.ts` declaring only what each service calls, construct in
`routes.ts`. Apply to the reviews run path and repo-intel only; elsewhere it is
mapping tax. **Effort M.**

### 3.3 `platform/` imports `modules/`, creating real runtime cycles

`platform/container.ts:26-29` imports `AgentsRepository`, `ReviewRepository`,
`RepoIntel`, `RepoIntelService`; `:116` does `new RepoIntelService(this)`.
depcruise reports `repo-intel/service → container → repo-intel/service` and
`pipeline/full → container → repo-intel/service → pipeline/full`. This is the
one arrow pointing outward, and it is bidirectional at runtime.

Fix: construct these in `app.ts` and `app.decorate`, or have each slice publish
its own `fp()` decorator. **Effort M.**

### 3.4 `reviewer-core` ships an HTTP client, so the "pure core" claim is false

`reviewer-core/src/llm/openrouter.ts:1` imports `openai`, which
`reviewer-core/package.json` lists as a runtime dependency. Everything else in
the package is genuinely clean (only `zod` and `@devdigest/shared`).

Fix: move `OpenRouterProvider` to `server/src/adapters/llm/openrouter.ts`, keep
the `LLMProvider` port in `vendor/shared/adapters.ts`. **Effort M.**

### 3.5 repo-intel binds two adapters concretely and inverts the other two

`modules/repo-intel/service.ts:22,28` and `pipeline/{full,incremental}.ts`
import `adapters/codeindex/extract.js` and `adapters/astgrep/index.js`
directly, while in the *same files* `depgraph` and `tokenizer` go through
container ports. The largest use case in the codebase therefore hard-binds
`@ast-grep/napi` and cannot run without the native library. **Effort M.**

### 3.6 Smaller layering items

- `adapters/depgraph/index.ts:27` and `adapters/tokenizer/index.ts:16` declare
  their own interfaces — the provider owns the port, which is backwards.
  Contrast `LLMProvider`/`GitClient`/`CodeIndex` in `vendor/shared/adapters.ts`.
  **S**
- Drizzle row types used as domain models: `modules/reviews/repository.ts:34`
  and `run-executor.ts:5,58,142` take `typeof schema.repos.$inferSelect` as a
  parameter type. `db/rows.ts` already exports `AgentRow`/`PullRow`/`FindingRow`
  — add `RepoRow`. **S**
- Shared vocabulary lives in a slice: `adapters/astgrep/index.ts:25` and
  `adapters/depgraph/index.ts:20` import constants from
  `modules/repo-intel/constants.js` — a ring-3 adapter naming a slice. Move to
  `modules/_shared/constants.ts`. **S**
- `modules/reviews/routes.ts:32` hand-parses the body
  (`RunRequest.parse(req.body ?? {})`) instead of declaring `schema.body`; the
  `ZodError` fallback at `app.ts:135-150` exists to catch escapees like it. **S**
- Dead code in `platform/`: `grounding.ts` and `prompt.ts` are re-export shims
  with **zero importers**; `prompts.ts`, `model-router.ts` and
  `trace-builder.ts` have no importer anywhere. Verified. **S**

`modules/_shared` is fine — two files, 35 lines, a legitimate shared kernel.

---

## P4 — Frontend

### 4.1 `RunTraceDrawer`'s live log is unreachable dead code

`RunTraceDrawer.tsx:41` defaults `running = false`, and its only caller
(`pulls/[number]/page.tsx:186-192`) never passes it. So
`useRunEvents(running ? [runId] : [])` always gets `[]`, and `useRunTrace` asks
for a trace that does not exist yet. Meanwhile `FindingsTab.tsx:62-64` offers an
"Open run trace" button for a *live* run — the user gets "no trace" instead of
the stream. `eventsToLog`, the `drawer.running` branch and the `tab = "log"`
default are all unreachable.

Fix: pass `running={liveRunIds.includes(traceRunId)}` from the page. **Effort S.**

### 4.2 `SEV_COLOR` is still drifted
*Raised by two audits, and already recorded in `client/INSIGHTS.md:23`.*
`RunTraceDrawer/_components/FindingsSection/FindingsSection.tsx:15` maps
`SUGGESTION: "var(--accent)"`; canonical `SEV`
(`vendor/ui/primitives/tokens.ts:12`) and the other copy
(`FindingCard/constants.ts:7`) use `var(--sugg)`. Suggestion badges render the
wrong colour in the trace drawer. Fix: delete both local maps, read
`SEV[severity].c`. **Effort S.**

### 4.3 `ConfigTab` mirrors nine server fields into state and resyncs with an effect

`ConfigTab.tsx:18-26` copies `agent.*` into nine `useState`s; `:29-39` is a
`useEffect` keyed on `agent.id` with an `exhaustive-deps` disable that re-seeds
them. Textbook "resetting state when a prop changes". Fix:
`<ConfigTab key={agent.id} agent={agent} />` at `AgentEditor.tsx:23` and delete
the effect. **Effort S.**

### 4.4 Effects used to derive render values

`ReviewRunAccordion.tsx:55-61`, `:62-64`, `:66-68` each `setOpen(true)` in
response to a prop change; `FindingsPanel.tsx:45` resets `focusIdx` the same
way. Each costs an extra render pass. Fix: compute during render, keep only the
genuine `scrollIntoView` effect. **Effort M.**

### 4.5 `FindingsTab` takes 18 props including an `any` mutation

`FindingsTab.tsx:15-35`, with `:28` typed
`UseMutationResult<any, any, string, any>`. The symptom of `page.tsx` acting as
a god-orchestrator; the delete-confirm rule also sits inline in JSX at
`page.tsx:163-166`. Fix: let the tab call `useCancelRun`/`useDeleteRun`/`usePrRuns`
itself and take `prId` plus URL state — removes ~8 props and the `any`.
**Effort M.**

### 4.6 Query keys hand-written in the page, duplicating the data layer

`page.tsx:53` and `:58` invalidate `["pr-active-runs", prId]` and
`["pr-runs", prId]` as string literals; the keys are defined in
`lib/hooks/reviews.ts:30` and `:42`. Renaming one silently breaks invalidation.
Fix: export invalidators from the hooks module. **Effort S.**

### 4.7 No `error.tsx`, `not-found.tsx` or `loading.tsx` anywhere

Verified across the whole `src/app` tree. Every page is `"use client"` with an
ad-hoc error branch, so a render-time throw has no boundary and a bad URL has no
404. Fix: add `app/error.tsx` + `app/not-found.tsx`, plus a segment-level
`error.tsx` under `repos/[repoId]/pulls/`. **Effort S.**

### 4.8 Hardcoded English in 15 components, against the stated rule

`client/CLAUDE.md:26` requires every user-facing string to go through next-intl.
Counter-examples with no `useTranslations` at all: `app/page.tsx:33-34`,
`AddRepoView.tsx:77-79`, `agents/[id]/page.tsx:45-46`, `PrDetailHeader.tsx:90`,
`ReviewRunAccordion.tsx:114-115`, `DiffTab.tsx`. Partially-translated files are
worse — `FindingsTab.tsx` calls `useTranslations` at `:57` yet hardcodes
"Live review" (`:117`), "Lethal Trifecta detected" (`:136`), "Timeline"
(`:150`). **Effort M.**

### 4.9 Smaller frontend items

- Seven-level relative imports (`"../../../../../../../lib/..."`) in 30+ files
  while `@/` exists and is used elsewhere — `[number]/page.tsx` mixes both
  styles in one file. `RunHistory/` is the only component folder with no
  `index.ts`, so `FindingsTab.tsx:7` reaches past the public API. **S**
- `agents/[id]/page.tsx:53-123` is a fat route (inline sidebar, header,
  dropdown, ~10 style objects) while its sibling `agents/page.tsx:5-7` is the
  thin 3-line pattern. **M**
- `components/showcase/` sits in the shared layer with one consumer — a test —
  and `vendor/ui/README.md:55-58` promises a `/showcase` route that does not
  exist. **S**
- 12 of 18 locale namespaces (~528 lines) are never loaded but are bundled into
  every page via `layout.tsx:28`. Either delete or document as course
  placeholders. **S**
- `useCallback` wrappers that only forward a prop, on children that are not
  memoized (`PrDetailHeader.tsx:31-37`, `FindingsTab.tsx:66-78`). **S**
- The two-`Severity` hazard is handled in the counters but bridged by unchecked
  casts at `FindingCard.tsx:58` and `FindingsHoverCard.tsx:209`. Widen
  `SeverityBadge`'s prop to the shared union instead — the UI map is a superset.
  **S**
- Dead type `lib/types.ts:38` `PrRowView`, zero references. **S**

---

## P5 — CI, tests, hygiene

### 5.1 The integration suite can report green having run zero tests

All six `*.it.test.ts` files gate on Docker and silently `describe.skip`
(`server/test/integration.it.test.ts:11-12` and five siblings). The probe is
`execSync('docker info', {timeout: 5000})` (`test/helpers/pg.ts:26-31`) — a 5s
timeout under runner load flips it to `false`.
`.github/workflows/server-integration.yml` has no guard and its header comment
blesses the behaviour. The only suite that touches SQL and migrations is
therefore not a reliable gate.

Fix: add a `docker info` precheck step, or a `REQUIRE_DOCKER=1` env that makes
the probe throw instead of skip. **Effort S** — highest-value CI fix.

### 5.2 No lint or format gate anywhere

No eslint/prettier/biome config in any of the five packages, and no `lint`
script. All five workflows run `typecheck` + `vitest` only. **Effort M.**

### 5.3 `reviewer-core` tests import server source

`reviewer-core/test/run.test.ts:5` imports from `../../server/src/adapters/mocks.js`,
violating `reviewer-core/CLAUDE.md` ("never import … server code here"). The
reviewer-core workflow filters on `reviewer-core/**` only, so a change to
`server/src/adapters/mocks.ts` can break its tests without ever running it. And
`reviewer-core/package.json:10` uses `--passWithNoTests`, so a broken include
glob is silently green. Fix: local fixtures; drop the flag. **Effort S.**

### 5.4 `e2e-web.yml` omits its own dependencies

`.github/workflows/e2e-web.yml:15-27` filters on `client/**`, `server/**`,
`e2e/**` — but the job runs `docker compose up -d` against the root
`docker-compose.yml` and `npm ci` in `reviewer-core/`, neither of which is in
`paths`. The currently-uncommitted compose change (`5432:5432` → `5435:5432`) is
exactly this case: committed alone, it would skip the only workflow that
consumes it. `e2e/package.json` defines `typecheck` that no workflow calls.
**Effort S.**

### 5.5 Client tests: wrong tool, wrong level

- `@testing-library/user-event` is **not installed**; `fireEvent` is used in 7
  files, and interactions traverse the DOM —
  `FindingsHoverCard.test.tsx:98` uses `.parentElement!`, `:178` uses
  `.closest("[role='button']")`. Both are the RTL skill's named anti-patterns.
- `FindingsHoverCard.test.tsx:12-14` mocks the app's own hook and `:117-119`
  asserts on its call arguments — mock at the network boundary instead.
- All 18 test files are leaf components or pure utils. None of the 7 routes,
  none of `lib/hooks/*`, and not `lib/api.ts` — the file `client/CLAUDE.md`
  calls "the only fetch layer" — has any test. `TESTING.md` claims the suite
  covers the PR-review surface; it covers its presentational leaves.

Fix: install `user-event`, add MSW, write 2-3 page-level flow tests. **Effort M.**

### 5.6 Hygiene

- A repo-wide port find/replace edited a **vendored skill file**:
  `git diff .claude/skills/fastify-best-practices/rules/deployment.md` shows a
  generic example rewritten `db:5432` → `db:5435`. That file is third-party
  content locked in `skills-lock.json`. Revert it. **S**
- The same port change is unfinished: `README.md:156` still says "Port 5432
  already in use", `scripts/e2e.sh:25,36` still reference 5432. **S**
- `server/docker-compose.yml` is byte-identical to the root file, declares the
  same container name and volume, and is referenced by nothing. Delete. **S**
- `meta/0010_snapshot.json` is untracked while `0010_real_mantis.sql` is
  tracked and `_journal.json` lists idx 10. On a fresh clone `drizzle-kit
  generate` will regenerate 0010's DDL. `git add` it. **S**
- `skills-lock.json` is referenced by nothing, locks 2 skills that do not exist,
  and omits 8 that do. Wire a verify step or delete it. **S**
- `TESTING.md` and both server workflows justify inlined `pnpm exec vitest` with
  "`server/package.json` is `skip-worktree`" — verified `git ls-files -v` returns
  `H`, not `S`. The flag is not set. **S**
- Docs drift: `README.md:74` says two built-in reviewers,
  `server/src/db/seed.ts:205` seeds three; `reviewer-core/README.md` names
  `toReview`/`run`/`reduce` while `src/index.ts` exports `toReviewPayload`/
  `reviewPullRequest`/`reduceReviews`; test counts in `TESTING.md` are wrong
  (says 12 DB-backed, actual 6). **S**

### 5.7 tsconfig drift

`e2e/tsconfig.json` omits five flags that the other three set
(`noUncheckedIndexedAccess`, `isolatedModules`, `verbatimModuleSyntax`,
`moduleDetection`, `forceConsistentCasingInFileNames`). No module uses
`extends`, so they will keep drifting. Fix: a root `tsconfig.base.json`.
**Effort M.**

---

## What is already good

Worth recording so it does not get "improved" away:

- **`reviewer-core`'s design.** Clean layering named by domain, no `utils`
  dumping ground, no fs/DB/GitHub imports in `src/` (the `openai` dependency in
  3.4 is the one exception). 23 tests, all passing.
- **Malformed LLM handling.** `llm/structured.ts:61-65` tries strict
  `JSON.parse` before falling back to extraction; `parseWithRepair` returns
  actionable per-field reprompt text; `openrouter.ts:88-92` handles OpenRouter's
  HTTP-200-with-no-`choices` case explicitly. The score is genuinely recomputed
  from post-grounding findings (`run.ts:208`).
- **Prompt-injection defence is mostly real.** Diff, PR body, repo-map, callers
  and specs are all wrapped; `INJECTION_GUARD` is on every system prompt; output
  is `safeParse`d; the client renders through react-markdown 9 with no
  `rehype-raw` and no `dangerouslySetInnerHTML`. Two holes: `prompt.ts:109`
  renders the skills block unwrapped, and `wrapUntrusted` (`:32`) neutralizes
  only the closing delimiter.
- **e2e is real.** Not a stub — `e2e/run.ts` plus seven substantive
  `specs/*.flow.json`; `04-pr-findings.flow.json` walks 10 steps from PR list to
  a seeded finding card and exits non-zero on failure.
- **Server test split is honest.** The unit lane is genuinely hermetic via
  injected mocks; the integration lane uses real Postgres and real migrations —
  subject to 5.1.
- **Secrets are not returned by the API.** `GET /settings/secrets-status`
  correctly returns booleans only, and no route returns a key value. No
  credentials are committed to git.
- Fastify plugin encapsulation, `setErrorHandler` ordering, `IdParams` uuid
  validation, and `withTimeout`/`withRetry` around LLM and job calls are all
  correct.

---

## Suggested order

1. **P0 in one sitting** — 0.2 is an hour and closes the worst hole; 0.3's first
   half is one line; 0.1 is a rotation plus a credential-helper change.
2. **1.2 and 1.1's reviews path** — small, and they stop silent data loss.
3. **5.1 and 2.1's CI gate** — cheap, and they stop the next regression from
   landing unnoticed.
4. **P2 validation** (2.2, 2.3, 2.4) — this is what makes the contracts do the
   job they were vendored for.
5. **3.1 slice by slice**, starting with `workspace` — transactions and
   testability fall out of it.
6. **P4** as you touch those screens; 4.1, 4.2 and 4.3 are each under an hour.
7. **P5 hygiene** whenever, but 5.6's skill-file revert should ride along with
   the next commit so it does not get forgotten.
