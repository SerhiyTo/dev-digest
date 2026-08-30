# Insights

Accumulated non-obvious lessons from working in this module. Read this before
starting work here and treat entries as high-confidence guidance. Append-only:
add bullets at the top of the matching section (newest first); never rewrite,
reorder, or delete existing content — correct a wrong entry with a new dated
note. Entry format: `- YYYY-MM-DD: <insight> (evidence: path/file.ts:line)`.

## What Works
<!-- Approaches, patterns, and solutions that have proven effective here -->
- 2026-08-23: a byte ceiling on a document read must bound the READ, not reject
  the file. `FsCloneDocs.read()` answered `{ok:false, reason:'too_large'}` above
  `MAX_DOC_BYTES` and the service turned that into a `skipped` entry, so the one
  case AC-33 exists for — a 4 MB markdown — injected nothing at all. Reading
  `min(size, maxDocBytes)` off the OPEN HANDLE (`handle.stat()`, not the path
  `stat`, so the size cannot change under you) keeps memory bounded exactly as
  the rejection did, and the assembler's `MAX_DOC_CHARS` slice then does the
  truncation it always did. The prefix always has enough to truncate from:
  262,144 bytes is at least 87,381 UTF-16 units even in the worst 3-byte-per-unit
  encoding, against a 32,000-character cap (evidence:
  server/src/adapters/clonedocs/index.ts `readBoundedPrefix`;
  server/test/context-service.test.ts 'a document above the byte ceiling is
  listed, attachable and injected truncated (AC-33)')
- 2026-08-23: cutting a UTF-8 buffer at a byte ceiling splits the last
  multi-byte character and decodes it as U+FFFD. Walk back at most 4 bytes to the
  lead byte and drop an incomplete sequence — and do it ONLY when the read was
  actually truncated, because trimming a complete read would silently alter a
  file that legitimately ends in invalid UTF-8 (evidence:
  server/src/adapters/clonedocs/index.ts `withoutPartialUtf8Tail`;
  server/test/context-discovery.test.ts 'applies the ceiling the policy sets,
  counting bytes and not characters')
- 2026-08-23: to make a run produce exactly one `block_budget` skip you need FIVE
  documents over `MAX_DOC_CHARS`, not four. `fitBody` truncates the document that
  crosses `MAX_BLOCK_CHARS` and still injects it, so four 32k+ documents fill the
  budget to exactly 120,000 with zero skips; only the fifth gets
  `available < 1` and is skipped. Also: assert a run-log line by exact string
  against `trace.log.map(l => l.msg)` — `toContain` on that array is element
  equality, so EXTENDING an already-asserted msg (the AC-36 counts line) breaks
  it. Emit a second, detail event instead and leave the summary line byte-frozen
  (evidence: server/src/modules/context/assemble.ts `fitBody`;
  server/test/reviews-context.it.test.ts 'names every document omitted for the
  block budget')
- 2026-08-23: build a fixture `run_traces` document by CALLING the real
  assemblers, never by hand-writing the fenced string. `assembleProjectContext`
  then `assemblePrompt` (both importable from `src/db/seed.ts` — reviewer-core is
  ring 0 and no depcruise rule covers `src/db/` → `src/modules/`) return the same
  `PromptAssembly` the executor persists, so the fixture cannot drift from
  `wrapUntrusted`'s positional `spec-${i}` labelling or from the assembler's
  path heading. Hand-writing it encodes today's format into the seed and goes
  stale silently. Idempotency needs a natural key that `agent_runs` does not
  have — no unique constraint on it — so pin `ranAt` to a fixed literal and
  select-then-insert on `(prId, agentId, ranAt)`; the trace itself goes in with
  `onConflictDoUpdate` so its content converges rather than sticking at whatever
  the first seed wrote (evidence: server/src/db/seed.ts `demoRunTrace`,
  `DEMO_RUN_RAN_AT`; verified md5 of `run_traces.trace` identical across two
  seeds and across two different databases)
- 2026-08-23: to prove a new prompt slot leaves the message byte-identical when
  it is empty, you do NOT need a pre-feature baseline string checked into the
  test. Run the SAME agent three times against the same PR — before anything is
  attached, with one document attached, then after `PUT .../context` with
  `{ paths: [] }` — and assert `after.prompt_assembly.user ===
  before.prompt_assembly.user`. Two agents cannot be compared instead: `task`
  and the system prompt are agent-scoped, so only a single agent's own
  before/after pair is a true byte comparison. The middle run is what stops the
  pair being vacuous — it proves the slot can fire at all (evidence:
  server/test/reviews-context.it.test.ts "leaves the user message byte-identical
  when the agent has nothing attached")

## What Doesn't Work
<!-- Failed approaches, dead ends, antipatterns to avoid -->
- 2026-08-23: adding a field to a response DTO breaks `toEqual` assertions the
  unit lane cannot see. `truncated` on `ProjectDocBody` turned
  `context.it.test.ts:208`'s `expect(ok.json()).toEqual({ path, content })` red
  while `pnpm exec vitest run --exclude '**/*.it.test.ts'` stayed green at 452 —
  the assertion lives in a Docker-only file. Before widening any DTO, grep the
  integration lane for whole-body equality on that route
  (`rg 'toEqual\(\{' server/test/*.it.test.ts`); `toMatchObject` would not have
  broken (evidence: server/test/context.it.test.ts:208)
- 2026-08-23: `MockCloneDocs` also ignores its `cloneRoot` argument (`list()` is
  `Object.keys(this.docs)`, `read()` is `this.docs[path]`), so NO test built on it
  can tell the stored `repos.clone_path` apart from the root
  `GitClient.clonePathFor()` derives — such a test passes against both the fixed
  and the broken code. To prove which root a run actually read, write an inline
  `CloneDocsSource` keyed BY ROOT (`byRoot[cloneRoot]?.[path]`), serve the same
  document path different text under the stored and the derived root, and store a
  `clone_path` the mock git adapter would never produce (evidence:
  server/src/adapters/mocks.ts MockCloneDocs; server/test/reviews-context.it.test.ts
  `docsPerCloneRoot` / 'reads the clone root stored on the repo row')
- 2026-08-23: a green `vendor/shared mirror is byte-identical` lane does NOT
  mean the two `@devdigest/shared` surfaces agree. The gate is a hardcoded
  file list, and the one file that covers "everything" — `index.ts` — re-exports
  with `export *`, so the two barrels can differ arbitrarily behind identical
  barrel text (the server barrel exports `AgentManifest`/`Provider`/`CiFailOn`
  and the client's does not, and the lane was green throughout). ALWAYS add a new
  `contracts/*.ts` to the loop in the same change that creates it; a mirrored
  file that is not in the loop is *unchecked*, not *checked and passing*
  (evidence: scripts/verify-l04.sh mirror step; the three known-divergent files
  are now listed there and printed on every run)
- 2026-08-23: `MockCloneDocs` CANNOT produce a document that is listed but
  unreadable, so it cannot exercise AC-9's `document_unreadable` branch. `list()`
  is `Object.keys(docs)` and `read()` is `this.docs[path] ?? null` — a key mapped
  to `''` is listed AND reads as `''` (nullish coalescing does not catch the
  empty string), and a key absent from the map is neither listed nor readable.
  Write an inline `CloneDocsSource` object literal instead
  (`{ list: async () => [...], read: async (_r, p) => (p === bad ? null : text) }`)
  and build a second app with it; the two states then differ by exactly the one
  variable you are testing (evidence: server/src/adapters/mocks.ts MockCloneDocs;
  server/test/context.it.test.ts "distinguishes an unreadable document from a
  missing one")
- 2026-08-23: do NOT try to exercise the project-context block budget (`MAX_BLOCK_CHARS = 120_000`) with one large document — the per-document cap (`MAX_DOC_CHARS = 32_000`) always binds first, so a single entry can never reach the block cap and the "crossing document is truncated / the rest are omitted" branch stays unexercised while the test still passes on the per-document marker. It takes at least FOUR maximal documents to cross it (`3 × (11 + 32_000) = 96_033` used, the 4th truncated to fill exactly 120_000, the 5th onward skipped with `block_budget`). My first exact-fit test asserted a marker-free 120_000-char single spec and failed for exactly this reason (evidence: server/src/modules/context/assemble.ts `fitBody`; server/test/context-assemble.test.ts "block budget" describe)
- 2026-08-09: do NOT prove fence-escaping by asserting an absolute count of `</untrusted>` in a rendered prompt — the template's own SECURITY paragraph contains a literal `<untrusted>…</untrusted>` as prose, so the baseline is N+1 fences, not N, and the assertion fails on a perfectly safe render. Compare against a BENIGN render instead (`closers(hostile) === closers(benign)`), which states the property you actually care about: the attacker added no closer. Count opens with `<untrusted source="` to sidestep the prose entirely (evidence: server/test/intent-prompt.test.ts closers() helper; the prose fence at server/src/prompts/intent.classify.md SECURITY block)
- 2026-08-05: `pnpm db:generate` becomes INTERACTIVE whenever one table both drops and adds columns in the same diff — drizzle-kit asks "Is <col> created or renamed from another column?" per new column and there is no `--yes`/`--force` for it. It cannot be automated: piping newlines does nothing (it reads a raw TTY) and `printf '\n\n' | script -q /dev/null pnpm db:generate` HANGS indefinitely. ALWAYS split such a change into two runs — first edit the schema to only ADD the new columns and generate, then remove the old ones and generate again — which yields two unambiguous migrations and zero prompts (evidence: conventions reshape produced 0013_perpetual_invisible_woman.sql additions + 0014_daily_hitman.sql drops; server/src/db/schema/knowledge.ts conventions)
- 2026-08-04: in integration tests NEVER read `run_traces` after only `waitForPrRuns` — that returns as soon as `agent_runs.status` is terminal, which `RunExecutor` sets BEFORE it persists the trace, so `GET /runs/:id/trace` intermittently 404s and `prompt_assembly` comes back `undefined`. It is a genuine flake, not a slow machine: reproduced at ~1 in 4 full-suite runs while passing 3/3 in isolation. ALWAYS `await waitForRunTrace(db, runId)` (polls `run_traces`, throws on timeout) before touching the trace (evidence: server/test/helpers/runs.ts waitForRunTrace; server/src/modules/reviews/run-executor.ts status update precedes saveRunTrace; call sites server/test/reviews.it.test.ts:203,269,288)
- 2026-08-04: asserting a NEGATIVE on a persisted trace can pass vacuously — when a run throws, the catch path persists `prompt_assembly: { skills: null, user: '' }`, under which "skills is null" and "the prompt lacks `## Skills / rules`" are both trivially true even though the feature never ran. ALWAYS pin the run to `status === 'done'` and assert the prompt has real content before asserting what it lacks (evidence: server/src/modules/reviews/run-executor.ts failure-path trace; guard assertions server/test/reviews.it.test.ts:297-299)

## Codebase Patterns
<!-- Module-specific conventions, architecture decisions, naming patterns -->
- 2026-08-24: `SimpleGitClient.readFile` (the shared `GitClient.readFile`, used
  by `onboarding/facts.ts`'s `readPackageScripts`, `conventions/`, `intent/`
  and the `files` module) had NO filesystem-level containment check — only
  `files/service.ts`'s `assertRepoRelativePath` guarded the STRING, and a
  repository can commit a symlink (git mode `120000`) whose repo-relative name
  passes every lexical check while resolving outside the clone on disk. Fixed
  ONCE at the adapter (`resolveWithinClone`: `realpath` both the clone root and
  the joined target, reject unless the target is inside the root) rather than
  in each caller, which also closes the same door in `readPackageScripts`
  without touching `onboarding/facts.ts`. `realpath` BOTH sides, not just the
  target — see the 2026-08-23 `os.tmpdir()`/macOS entry in Tool & Library
  Notes; comparing an unresolved root against a resolved target rejects
  legitimate files (evidence: server/src/adapters/git/simple-git.ts
  `resolveWithinClone`, `readFile`; server/test/git-file-containment.test.ts)
- 2026-08-24: widen a module-LOCAL port before touching the shared `GitClient`
  in `vendor/shared/adapters.ts` when only one module needs the new
  capability. `files/ports.ts`'s `FileReader` is implemented and consumed in
  exactly two files (`files/routes.ts`, `files/service.ts` + its test), so
  changing `read(repo, path): Promise<string>` to
  `read(repo, path, maxBytes): Promise<{content,truncated}|null>` (to bound a
  read before materialising the string — the previous code read the whole file
  into JS memory and only capped the RESPONSE, so a large repo file could hit
  `ERR_STRING_TOO_LONG` and get silently reported as a 404) cost two files.
  `GitClient` itself is implemented or mocked in 15+ files across
  `src/adapters`, `platform/container.ts` and `test/*.it.test.ts`; adding a
  required method there would have rippled through all of them for a
  capability only `files/` needs. The bounded read lives as a standalone
  exported function (`readClonedFileBounded`) in the git adapter file, wired
  from `files/routes.ts` via `container.git.clonePathFor(repo)` — a method
  `GitClient` already exposes — so the route still never joins a path itself
  (evidence: server/src/modules/files/ports.ts `FileReader`;
  server/src/adapters/git/simple-git.ts `readClonedFileBounded`;
  server/src/modules/files/routes.ts)
- 2026-08-24: correction to the "two independently-declared narrow structural
  ports" entry below — `OnboardingFactsRepoIntel`/`OnboardingFactsGit` are gone.
  The `BlastEngine` workaround (declare your OWN port to dodge
  `no-cross-slice-imports`) is for reaching a SIBLING slice's Container-held
  service; `facts.ts` and `ports.ts` are the SAME module, so that workaround
  never applied here and the duplication was pure accident, not a second
  instance of the pattern. `getFileRank` moved onto `RepoFacts` in `ports.ts`,
  `facts.ts` now imports `RepoFacts`/`GitReader` from `./ports.js`, and
  `OnboardingServiceDeps.facts` is `RepoFacts` (no more `& OnboardingFactsRepoIntel`
  intersection at `service.ts:36`). `container.repoIntel` still satisfies the
  widened `RepoFacts` structurally with zero casts — the extra `getFileRank`
  method it already exposes for `repo-intel`'s own `RepoIntel` interface
  covers it for free. Rule of thumb going forward: a same-module duplicate port
  is a plain bug to fix by importing across the two files; only a
  cross-slice reach legitimately needs its own re-declared port (evidence:
  server/src/modules/onboarding/ports.ts `RepoFacts.getFileRank`;
  server/src/modules/onboarding/facts.ts:1-2;
  server/src/modules/onboarding/service.ts:13,36)
- 2026-08-23: `OnboardingView.cost_usd` and `.failed_cost_usd` are NOT two
  views of the same number — they read from two different tables. `cost_usd`
  comes from `tourRow` (the `onboarding` table, the tour actually on screen)
  and `failed_cost_usd` comes from `state` (`onboarding_generations`) ONLY
  when `state.status === 'failed'`; a currently-running or successfully-`done`
  generation never populates `failed_cost_usd`, even though `state.costUsd`
  exists on those rows too. Collapsing the two fields into one, or dropping
  the `isFailed` gate, would make the failure notice show a running attempt's
  in-flight cost, or make the header's `cost_usd` jump to a failed retry's
  cost before the retry succeeds (evidence:
  server/src/modules/onboarding/helpers.ts:134-150 `toOnboardingView`;
  server/src/vendor/shared/contracts/knowledge.ts:99-114 `OnboardingView`)
- 2026-08-23: `RepoIntel.getIndexedPaths` (added for AC-8's path grounding)
  unions DISTINCT paths from `file_rank` AND `symbols` — neither table alone
  is complete, so reading only one would silently under-ground legitimate
  paths and drop them via `isGroundedPath`. The facade method is gated the
  same way as every other `RepoIntelService` method: `repoIntelEnabled ===
  false` returns `[]` (`service.ts:820`), which means AC-8's grounding drops
  EVERY candidate path and the tour falls straight to AC-10's empty-payload
  branch whenever repo-intel is disabled — not only when the repo is
  genuinely unindexed (evidence: server/src/modules/repo-intel/repository.ts:450-463
  `getIndexedPaths`; server/src/modules/repo-intel/service.ts:818-822;
  server/src/modules/onboarding/domain.ts:57-71 `isGroundedPath`;
  server/src/modules/onboarding/service.ts:107-109)
- 2026-08-23: two independently-declared narrow structural ports —
  `RepoFacts` (`modules/onboarding/ports.ts:102-108`) and
  `OnboardingFactsRepoIntel` (`modules/onboarding/facts.ts:27-32`) — are both
  satisfied by the same `container.repoIntel` object with zero casts;
  `OnboardingService`'s `facts` dep is typed as the intersection of the two
  (`service.ts:36`) and `routes.ts:25` assigns `container.repoIntel` straight
  into it. This is a second live instance of the `BlastEngine` pattern
  documented below (2026-08-16): declaring your OWN structural port instead
  of importing `modules/repo-intel/types.ts` is how a new slice reaches a
  sibling's Container-held service without tripping `no-cross-slice-imports`
  (evidence: server/src/modules/onboarding/service.ts:36;
  server/src/modules/onboarding/ports.ts:102-108;
  server/src/modules/onboarding/facts.ts:27-32;
  server/src/modules/onboarding/routes.ts:25)
- 2026-08-23: there is no shared, container-held "resolve a DB repo id to a
  `RepoRef {owner,name}`" port — `context/repository.ts`, `reviews/repository.ts`
  and `repo-intel/repository.ts` each roll their OWN tiny `getRepo` query rather
  than sharing one. A new slice that needs the same resolution (the `files`
  module's `GET /repos/:id/file`, built to read through `GitClient.readFile`)
  has to add its own `repository.ts` too, even when its Files list in an
  implementation plan doesn't list one — `drizzle-only-in-ring-3` in the onion
  ruleset is `severity: error` for any file outside `RING_3`
  (`^src/modules/[^/]+/repository\.ts$` or `.../repository/`) plus a short
  grandfathered list that a brand-new module is never on, so the query cannot
  legally live in `routes.ts` or `service.ts` no matter how small. Treat "this
  task's Files list has no `repository.ts` but the Do: requires a DB lookup" as
  a plan gap to flag, not a reason to inline the query (evidence:
  .claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs
  RING_3/LEGACY.fatRoutes; server/src/modules/context/repository.ts `getRepo`;
  server/src/modules/files/repository.ts `findRepo`, added for T14 of
  docs/plans/2026-08-23-onboarding-generator.md)
- 2026-08-23: `modules/reviews/run-executor.ts` CANNOT import
  `sanitizePathLabel` from `modules/context/paths.ts` — depcruise's
  `no-cross-slice-imports` is severity `error` and run-executor is listed only in
  `LEGACY.schemaTypes`, not in `LEGACY.crossSlice`, so the import would be a new
  error against the 7/41 baseline. The label regex is therefore deliberately
  duplicated as `SKIPPED_DOC_LABEL_DISALLOWED` in run-executor. Anything shared
  between two slices has to travel through ring 0 (`vendor/shared`), `db/rows.ts`
  or the container — copying is the cheaper of the two legal options for one
  regex (evidence:
  .claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs LEGACY;
  server/src/modules/reviews/run-executor.ts:37)
- 2026-08-23: a repo-derived path reaching a run-log `msg` is sanitized to
  `[A-Za-z0-9._/-]` before interpolation, the same treatment AC-39 gives a prompt
  label. The reason is not the prompt: an `invalid_path` skip is BY DEFINITION a
  path `isProjectDocPath` rejected, so it can still carry newlines or control
  characters, and that msg is written verbatim into `run_traces.trace.log`, into
  pino's stdout and into the trace drawer — a `\n` in it forges a log line. On
  every other skip reason the path already passed validation and the sanitizer is
  the identity function, so it costs nothing (evidence:
  server/src/modules/reviews/run-executor.ts `skippedProjectDocsLine`;
  server/src/modules/context/paths.ts `sanitizePathLabel`)
- 2026-08-23: a port declared NARROWER than its implementation is invisible until a
  caller tries to use the wider part: `ContextService.resolveForRun` took
  `RunRepoRef` (= `RepoRef & { clonePath? }`) while the `ProjectContext` port in
  `modules/context/types.ts` still said `RepoRef`, and every caller goes through the
  port, so `resolveForRun(id, { owner, name, clonePath })` failed with TS2353
  'clonePath does not exist in type RepoRef' — method bivariance let the class
  satisfy the port anyway, so nothing flagged it earlier. `RunRepoRef` now lives in
  `types.ts` next to the port and `service.ts` imports it; when you widen an
  implementation's parameter, widen the interface in the SAME change or the
  capability is unreachable (evidence: server/src/modules/context/types.ts
  `RunRepoRef`; server/src/modules/reviews/run-executor.ts:206)
- 2026-08-23: correction to the two entries below about `CloneDocsSource` —
  `read()` no longer returns `string | null` and the port no longer takes a
  `RepoRef`. It is now `read(cloneRoot: string, path: string):
  Promise<CloneDocRead>` where `CloneDocRead` is
  `{ ok: true; text } | { ok: false; reason }` over
  `invalid_path | missing | out_of_root | unreadable | too_large`. Two
  consequences: `document()` no longer re-`list()`s the whole clone to choose
  between `not_found` and `document_unreadable` — `reason === 'missing'` is the
  404 code selector, so a typo costs one `realpath` instead of a full walk; and
  the caller hands the port the clone root it already holds (`repos.clone_path`)
  instead of the adapter re-deriving `cloneDir/owner/name`, so a `clone_path`
  pointing elsewhere can no longer list an empty tree with `reason: null`
  (evidence: server/src/vendor/shared/adapters.ts `CloneDocsSource`;
  server/src/modules/context/service.ts `document`, `discover`, `gather`;
  server/test/context-service.test.ts "the 404 the read itself names")
- 2026-08-23: `FsCloneDocs` bounds its own I/O; the service's caps do not. Reads
  are ceilinged at `MAX_DOC_BYTES = 262_144` (`stat` first, `too_large` above it,
  then a bounded `read()` off an open handle sized by `fstat`, which also rejects
  a non-file so a FIFO cannot block the process). 256 KiB is deliberate: 32,000
  characters × 4 bytes is the widest UTF-8 encoding a document can have and still
  fit `MAX_DOC_CHARS` whole, and this is twice that. The walk carries a shared
  entry budget (`MAX_WALK_ENTRIES = 20_000` dirents) and a depth budget
  (`MAX_WALK_DEPTH = 10` below a doc root); all three are overridable through
  `CloneDocsPolicy` so a test can force them small. `MAX_DOC_CHARS` in
  `assemble.ts` is reached by ONE of the three read callers — `document()` and
  `estimate()` never touch the assembler — which is why the ceiling has to live
  at the filesystem boundary and not in the service (evidence:
  server/src/adapters/clonedocs/index.ts `MAX_DOC_BYTES`, `readBounded`;
  server/test/context-discovery.test.ts "refuses a document above the byte
  ceiling")
- 2026-08-23: a SEMANTIC limit belongs in the service, never in a request-body
  Zod schema — a schema bound is enforced by `fastify-type-provider-zod` before
  the handler runs and surfaces as **422**, silently stealing the status code the
  service was written to return (`DocAttachmentInput.paths` capped at
  `MAX_ATTACHMENTS` would turn AC-16's 409 into a 422, and a per-element `.max()`
  would turn AC-15's 400 into one). What a contract schema MAY carry is a DoS
  ceiling set far above the semantic limit, so the semantically-invalid request
  still reaches the service and gets its real error. The shared value itself is
  fine in the contract: `MAX_ATTACHMENTS` now lives in
  `vendor/shared/contracts/context.ts` and both `modules/context/constants.ts`
  and `client/src/components/doc-attach/constants.ts` re-export it, which is the
  only thing that keeps the server's cap and the client's checkbox count in sync
  across two lockfiles (evidence: server/src/vendor/shared/contracts/context.ts
  `ATTACHMENT_PATHS_DOS_CEILING`; server/src/modules/context/service.ts:103,231)
- 2026-08-23: `pnpm typecheck` here does NOT typecheck `test/` — `tsconfig.json`
  sets `include: ["src/**/*.ts"]`, and `tsc --showConfig` confirms not one
  `test/**` file is in the program. A type error in a test file is therefore
  invisible to the module's own quality gate and surfaces (if at all) only as a
  vitest runtime failure, because vitest transpiles without checking. `client/`
  is the opposite (`include: ["**/*.ts","**/*.tsx"]`), so the habit does not
  transfer between the two packages. To check a new server test file, run tsc
  against a throwaway config that `extends` `server/tsconfig.json` and widens
  `include` to `test/**/*.ts` (evidence: server/tsconfig.json:28; verified with
  `npx tsc --showConfig -p tsconfig.json | grep test/` → no matches)
- 2026-08-23: the persisted run trace DROPS the `data` payload of every run-log
  event — `RunLogger.logLines()` maps the bus buffer to `{ t, kind, msg }` and
  nothing else, and `RunLogLine` in the trace contract has exactly those three
  fields. So `runLog.event('info', msg, { attached, skipped })` puts `skipped`
  on the SSE stream and in pino, and NOWHERE in `run_traces.trace.log`. Any
  requirement phrased "record a run-log event naming the path and the reason"
  can only be met, and can only be tested, if those values are interpolated into
  the `msg` string itself; asserting on `trace.log[i].data` is asserting on a
  field that does not exist (evidence: server/src/platform/run-logger.ts:95;
  server/src/vendor/shared/contracts/trace.ts:13-17; the dropped payload at
  server/src/modules/reviews/run-executor.ts:213-216)
- 2026-08-23: seeding a `reviews` row does NOT put anything in the run-trace
  drawer. The drawer mounts only on `?trace=<runId>`, and both openers that can
  set it read `agent_runs` — `RunHistory`'s per-row button over `prRuns`
  (`GET /pulls/:id/runs`) and `FindingsTab`'s `liveRunIds[0]`. `reviews` feeds
  only the Review Runs accordion. So anything that needs a trace on screen needs
  an `agent_runs` row plus its `run_traces` row; `reviews.run_id` is the only
  link between the two halves and it is nullable and unset in the seed. Leaving
  it null is deliberate — setting it routes the seeded findings into the drawer
  AND puts the run into `countsByRunId`, pulling the PR-findings e2e flow into
  the blast radius of any seed change (evidence:
  client/src/app/repos/[repoId]/pulls/[number]/page.tsx:62,203-209;
  RunHistory.tsx onOpenTrace; server/src/db/schema/reviews.ts:28 `runId`)
- 2026-08-23: `repos.clone_path` is NOT the directory project-context discovery
  reads. `FsCloneDocs` derives its own root as
  `AppConfig.cloneDir/<owner>/<name>`, and `ContextService` only ever tests
  `clone_path` for `null`, as an "is this repo cloned" gate. A `clone_path`
  pointing anywhere else therefore still lists and reads
  `cloneDir/owner/name` — the two agree only because the clone job stores
  `git.clonePathFor()`'s result, which uses the same join. Anything that fakes a
  clone (the seed's fixture tree, a manual fixture) must write the files under
  `cloneDir/owner/name` AND set the column to that same absolute path; setting
  only the column produces an empty document list with `reason: null`, which
  reads like "cloned but no docs" (evidence:
  server/src/adapters/clonedocs/index.ts:45 `clonePathFor`;
  server/src/modules/context/service.ts `discover()`;
  server/src/modules/repos/service.ts:58; server/src/db/seed.ts `writeDemoClone`)
- 2026-08-23: correction/update to the A6 cruise baseline below — wiring
  `get projectContext()` into `platform/container.ts` took the tree from
  **7 errors / 38 warnings to 7 errors / 41 warnings**. The three new warnings
  are exactly `platform-not-to-modules` edges for `modules/context/`'s
  `types.ts`, `service.ts` and `repository.ts`, which is the same intended trade
  the clone-docs policy injection made. `run-executor.ts` deliberately does NOT
  `import type` from `modules/context/types.ts` — that would be
  `no-cross-slice-imports`, scored **error** — so it calls
  `container.projectContext.resolveForRun(...)` and lets inference carry the
  result type with no import statement at all (evidence:
  server/src/platform/container.ts `get projectContext()`;
  server/src/modules/reviews/run-executor.ts project-context block)
- 2026-08-23: `ProjectDocList.last_synced_at` is NOT persisted anywhere — no
  column, no cache. Project-context discovery is a live walk of the clone on
  every request, so `list()` and `resync()` are literally the same read and the
  field carries the moment THIS walk finished. Anyone adding a "stale for N
  minutes" badge on top of it is reading a timestamp that is always ~now; a real
  staleness signal needs a new column, not a reinterpretation of this one
  (evidence: server/src/modules/context/service.ts `listing`)
- 2026-08-23: `CloneDocsSource.read()` returns `null` for missing, unreadable,
  symlinked-out and out-of-root alike — it deliberately never says which. To
  give the preview a NAMED state (AC-9) the service re-`list()`s only on the
  failure path and reports `not_found` when the path is absent from the walk vs
  `document_unreadable` when it was listed but would not read. Both are 404; the
  distinction is the `error.code`, and it costs a second walk only when a read
  has already failed (evidence: server/src/modules/context/service.ts `document`;
  server/src/vendor/shared/adapters.ts CloneDocsSource)
- 2026-08-23: correction to the `adapters-not-to-modules` entry below — the
  clone-docs adapter no longer imports `modules/context/`. `FsCloneDocs` takes a
  `CloneDocsPolicy` (`docRoots`, `docExtensions`, `excludedDirs`, `isDocPath`)
  declared in its own file, and `platform/container.ts` (ring 4) builds it from
  `DOC_ROOTS`/`DOC_EXTENSIONS`/`EXCLUDED_DIRS` and `isProjectDocPath`. Net effect
  on the cruise: 9 errors / 36 warnings → **7 errors / 38 warnings** — the edge
  did not disappear, it MOVED from `adapters → modules` (`error`) to
  `platform → modules` (`warn`, MIGRATION §2), so expect the warning count to
  rise by one per module file the container names. That trade is the intended
  one; "add no new error" is the bar, not "add no new warning" (evidence:
  server/src/adapters/clonedocs/index.ts CloneDocsPolicy; server/src/platform/container.ts
  `get cloneDocs()`)
- 2026-08-23: correction — `server/package.json` now reads `0.1.0`, so the
  `SpecFile` marker's `@deprecated since 0.1.0` below names a version that
  exists; the bump landed with the clone-docs adapter task, not with the marker
  (evidence: server/package.json:3)
- 2026-08-23: an adapter under `src/adapters/` that imports a feature slice trips
  `adapters-not-to-modules`, which the onion ruleset scores as **error**, not
  `warn` — only `astgrep/` and `depgraph/` are grandfathered by name in
  `LEGACY.adaptersToModules`. `FsCloneDocs` reads `DOC_ROOTS`/`EXCLUDED_DIRS` and
  `isProjectDocPath` from `modules/context/`, so a fresh cruise reports two new
  errors; the alternatives are duplicating the path validation in the adapter
  (a security-relevant divergence) or injecting the policy from
  `platform/container.ts`, which is ring 4 and already allowed to name modules.
  Also: the tree's real baseline is NOT the "0 errors and 35 warnings" the skill
  advertises — before this task it was **7 errors and 36 warnings**, so "any
  error is something you just introduced" does not hold here; diff the counts
  instead (evidence: `cd server && npx depcruise --config
  ../.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs src`)
- 2026-08-23: NOT every adapter port lives in `vendor/shared/adapters.ts` —
  `Tokenizer` is declared inline in its own implementation file
  (`src/adapters/tokenizer/index.ts:16`, next to `TiktokenTokenizer`), which
  inverts the "consumer owns the interface" rule the rest of the adapters follow.
  ALWAYS `grep -rn "interface <Port>" src/` before assuming a port is in the
  shared barrel: a plan that says "add a method to `Tokenizer` in `adapters.ts`"
  is pointing at a file that does not contain it, and declaring a second
  `Tokenizer` in the barrel would put two same-named interfaces on the
  `@devdigest/shared` export surface (evidence: server/src/adapters/tokenizer/index.ts:16
  vs the ports in server/src/vendor/shared/adapters.ts)
- 2026-08-23: the first `@deprecated` marker in this repo is on `SpecFile`
  (`vendor/shared/contracts/platform.ts`), and it names `since 0.1.0` while
  `server/package.json` still reads `0.0.0` — the version bump the
  `deprecation-policy` skill requires alongside the first marker was out of that
  task's file scope. `deprecation-audit.sh` does NOT read package.json, so it
  passes either way; the marker's dates are the only real clock until someone
  sets the package version. Also note the audit scans `mcp/src` in addition to
  the three modules named in the root CLAUDE.md table (evidence:
  server/src/vendor/shared/contracts/platform.ts SpecFile marker;
  `bash .claude/skills/deprecation-policy/assets/deprecation-audit.sh` output)
- 2026-08-23: a link table whose composite PK starts with its FK column does
  NOT need a separate index on that column — Postgres already builds a btree
  on `(owner_id, path)` for the PK, and any `WHERE owner_id = ?` uses its
  leftmost prefix. `agent_docs`/`skill_docs` ship one anyway
  (`agent_docs_agent_idx`, `skill_docs_skill_idx`) because the plan specified
  it; `agent_skills` (the shape they copy) correctly has the PK and nothing
  else. Only the `path` index earns its place there — it serves the
  `used_by_agents` reverse lookup, which the PK cannot answer (evidence:
  server/src/db/schema/context.ts agentDocs/skillDocs;
  server/src/db/migrations/0019_unknown_human_torch.sql;
  server/src/db/schema/agents.ts:51-59)
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
- 2026-08-23: `@fastify/rate-limit`'s `config.rateLimit.keyGenerator` is typed
  `(req: FastifyRequest) => string | number | Promise<...>` — the PLAIN,
  unparameterized `FastifyRequest`
  (`node_modules/@fastify/rate-limit/types/index.d.ts:125`), not the route's
  narrowed request type. Declaring the generator as `(req:
  FastifyRequest<{ Params: IdParams }>) => string` fails `tsc` with TS2322
  (a narrower parameter is not assignable under contravariant function-type
  checking — reproduced directly against this repo's `fastify`/`@fastify/rate-limit`
  versions), so a per-repository key needs `(req: FastifyRequest) =>
  (req.params as { id: string }).id` with an inline cast instead. A bare `max`
  with no `keyGenerator` would also have been a GLOBAL limit shared across
  every repository, not per-repository, which is what "3 per repository per
  10 minutes" actually requires (evidence:
  server/src/modules/onboarding/routes.ts:9-14,49-52;
  node_modules/@fastify/rate-limit/types/index.d.ts:125)
- 2026-08-23: `scripts/verify-l04.sh` runs the integration lane as
  `pnpm exec vitest run .it.test` with NO `--no-file-parallelism`, so it inherits
  the container-contention flake documented below in full — a lane that is
  130/130 green when you serialize it by hand can still fail inside verify-l04.
  Worse, the flake MOVES between lanes across runs: run 1 failed only
  `server integration tests`, run 2 passed that lane 15/15 and failed
  `client tests` with `[vitest-worker]: Timeout calling "fetch" with
  "[\"/src/vendor/ui/kit/Drawer.tsx\",\"web\"]"` and a 997s TRANSFORM time
  (normal is ~1s) — a worker-pool stall, not a test assertion, and it reports as
  `1 failed | 38 passed` with `308 passed` tests and zero failing test names.
  Run 3, with nothing else on the machine, was clean end to end and printed
  `L04 verified.` ALWAYS re-run the whole script once before treating a single
  red lane there as a code failure, and read the `Duration`/`transform` line: a
  three-digit transform time means the machine, not the diff (evidence:
  scripts/verify-l04.sh:56 vs the serialized command in server/CLAUDE.md's
  testing lanes; three consecutive runs of 2026-08-23)
- 2026-08-23: addendum to the `--no-file-parallelism` advice below — serializing
  removes the container-contention timeouts but not every testcontainers
  failure. A full serialized `pnpm exec vitest run` of the server lane failed
  exactly one file, `smart-diff.it.test.ts`, with
  `Error: Expected Reaper to map exposed port 8080`
  (`node_modules/testcontainers/src/reaper/reaper.ts:63`) while the other 49
  files passed; re-running that one file alone passed 8/8 in 44s. Ryuk is a
  file-locked singleton shared by the whole run, so a stale or evicted reaper
  container fails whichever suite asks for one NEXT, not the suite that broke
  it — which is why the failure lands on an arbitrary file and moves between
  runs. Treat a Reaper error as infrastructure and re-run that single file
  before touching code (evidence: server/test/helpers/pg.ts:36 `startPg`;
  serialized run of 2026-08-23 — 49 files passed / 1 failed, that file 8/8 alone)
- 2026-08-23: `pnpm exec vitest run .it.test` can go red for reasons that have
  nothing to do with the code. `dockerAvailable()` probes with
  `execSync('docker info', { timeout: 5000 })`, and on a loaded Docker Desktop
  `docker info` alone takes ~4s — so as the 14 suites boot their own
  `pgvector/pgvector:pg16` containers concurrently, some files report
  "Docker not available — skipping" (a false skip) and others die with
  `Hook timed out in 120000ms` in `beforeAll`/`startPg`. Two consecutive
  parallel runs failed 3 and then 6 unrelated suites this way. ALWAYS re-run
  with `--no-file-parallelism` before believing an integration failure: the same
  lane, serialized, was 13 passed / 2 skipped / 0 failed. A single suite
  (`vitest run test/<name>.it.test.ts`) is the fastest way to tell a real
  failure from container contention (evidence: server/test/helpers/pg.ts
  `dockerAvailable`; `time docker info` → 4.0s idle on this machine)
- 2026-08-23: to test `TiktokenTokenizer`'s heuristic fallback you must break
  `getEncoding`, and a plain `vi.mock('js-tiktoken')` factory cannot read a
  test-file `let` (the factory is hoisted above it) — use
  `const encoder = vi.hoisted(() => ({ fails: false }))` and flip `encoder.fails`
  per test. `broken` is sticky by design, so a tokenizer that failed once keeps
  reporting `estimator() === 'heuristic'` even after the encoder recovers; assert
  that rather than expecting recovery (evidence: server/test/context-estimate.test.ts;
  server/src/adapters/tokenizer/index.ts TiktokenTokenizer.broken)
- 2026-08-23: containment checks against a clone root must `realpath` BOTH sides
  on macOS — `os.tmpdir()` returns `/var/folders/...` while `realpath` resolves it
  to `/private/var/folders/...`, so `realpath(file).startsWith(root + sep)` is
  false for a perfectly legitimate file and every read silently returns `null`
  (evidence: server/src/adapters/clonedocs/index.ts `read`; the temp-clone fixtures
  in server/test/context-discovery.test.ts)
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
- 2026-08-24: a repo-relative path guard that only checks STRUCTURE (no `..`,
  no absolute, normalises to itself) is not the same as checking which files may
  be read. `.git/config` passes every traversal/normalisation check in
  `assertRepoRelativePath` — it is a genuinely in-clone, relative, non-traversing
  path — and `RepoService.runCloneJob` clones through `withGitHubToken`, which
  persists the credentialed HTTPS URL (`https://x-access-token:<PAT>@github.com/...`)
  into that file verbatim. Any endpoint that reads arbitrary repo-relative paths
  needs an explicit segment-level denylist (`segment === '.git'`, not a prefix
  check — `.gitignore`/`.gitmodules`/`.github/...` must stay readable) in
  addition to the traversal guards, because "resolves inside the clone" and
  "safe to serve" are different properties (evidence:
  server/src/modules/files/service.ts `assertRepoRelativePath`;
  server/src/modules/repos/helpers.ts `withGitHubToken`;
  server/test/repo-file-paths.test.ts)

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-08-23: restored AC-33 at the byte ceiling — `FsCloneDocs.read()` returns a
  bounded prefix with `truncated` instead of refusing, `too_large` is gone from
  `CloneDocReadFailure` (nothing could produce it any more), and `ProjectDocBody`
  carries an optional `truncated` the preview surfaces. Unit lane 452 passed,
  integration lane 129 passed / 0 skipped / 1 failed — `context.it.test.ts:208`,
  a whole-body `toEqual` in a file outside this change's scope; cruise unchanged
  at 7 errors / 41 warnings.
- 2026-08-23: closed AC-32 and AC-34 — the skipped project-context paths and
  their reasons now reach `run_traces.trace.log` as a second
  `project context skipped: <path> (<reason>)` event, character-budgeted and
  sanitized, with the AC-36 counts line untouched. Unit lane 449 passed / 2 failed
  (both in `context-*.test.ts`, from a concurrent agent's `truncated` field, not
  this change), integration lane 129 passed / 0 skipped / 1 failed (same cause),
  cruise unchanged at 7 errors / 41 warnings.
- 2026-08-23: finished review finding #4 — deleted the unreachable `cloneRootFor`
  fallback from `ContextServiceDeps`/`cloneRootOf` and the one unit case that
  injected it; unit lane 451 → 450 passed, integration lane 129 passed / 0
  skipped, cruise unchanged at 7 errors / 41 warnings.
- 2026-08-23: closed review finding #4's last derivation — the run path now passes
  the stored `repos.clone_path` into `resolveForRun`, and the `cloneRootFor`
  fallback wiring (`git.clonePathFor`) is gone from `platform/container.ts`, so
  production has exactly one source for the clone root. The optional
  `ContextServiceDeps.cloneRootFor` parameter itself survives only because
  `test/context-service.test.ts` still injects it.
- 2026-08-23: L05 Project Context review remediation — widened
  `CloneDocsSource.read()` to a discriminated result and gave the port the
  caller's clone root, which removed `document()`'s second full walk, bounded
  every read at 256 KiB and put an entry and depth budget on the walk. Cruise
  unchanged at 7 errors / 41 warnings.
- 2026-08-23: L05 Project Context review remediation — moved `MAX_ATTACHMENTS`
  into `vendor/shared/contracts/context.ts` (single source across two lockfiles),
  gave `DocAttachmentInput.paths` a DoS ceiling that leaves AC-15's 400 and
  AC-16's 409 with the service, and widened `scripts/verify-l04.sh`'s mirror gate
  to `contracts/context.ts`, `contracts/platform.ts` and `adapters.ts` with the
  three known-divergent files recorded as an explicit allowlist.
- 2026-08-23: L05 Project Context coverage close-out — added
  `test/context-service.test.ts` (AC-4's `MAX_DOCUMENTS` cap and `omitted`
  arithmetic, which moved from the adapter to the service in amendment A1 and
  was proven nowhere; plus AC-12's attachment-table column set) and
  `test/context-prompt-section.test.ts` (AC-21 in the unit lane, composing the
  server assembler with reviewer-core's renderer); found that AC-32's "naming
  the path and the reason" is unobservable in the persisted trace.
- 2026-08-23: T12 — seeded a four-document fixture clone for `acme/payments-api`
  under `AppConfig.cloneDir` and pointed `repos.clone_path` at it, so
  `GET /repos/:id/context` returns real documents for the demo repo; then added
  one completed `agent_runs` row for PR #482 with a `run_traces` document whose
  `prompt_assembly.specs` and `specs_read` carry `specs/idempotency-keys.md`, so
  the run-trace drawer has a run to open. Verified with the hermetic e2e stack —
  9/9 flows pass, flow 04 included.
- 2026-08-23: T9 — wired `resolveForRun` into `ReviewRunExecutor` through a new
  `container.projectContext` facade, set `specs_read`, and added
  `test/reviews-context.it.test.ts` (merge order, default-branch source, skip
  logging, byte-identity when nothing is attached).
- 2026-08-23: project-context T7 — `modules/context/{ports,types,repository,service,routes}.ts`
  (six route groups, ports-not-Container, `MAX_DOCUMENTS` cap + `omitted` and
  `reason: 'not_cloned'` derived in the service, 400 on a bad path, `ConflictError`
  → 409 at 21 attachments, `resolveForRun` for T9), `ConflictError` in
  `platform/errors.ts`, module registered in `modules/index.ts`, and
  `test/context.it.test.ts`, 14 integration cases.
- 2026-08-23: project-context T5 — `adapters/clonedocs` (uncapped four-root walk,
  symlinks never followed, realpath-guarded `read`), `Tokenizer.estimator?()` +
  `TiktokenTokenizer.estimator()`, `MockCloneDocs`, `Container.cloneDocs`,
  `server/package.json` 0.0.0 → 0.1.0, and `test/context-{discovery,estimate}.test.ts`,
  13 unit cases.
- 2026-08-23: project-context T3 — pure `modules/context/{constants,paths,assemble}.ts`
  (path guard, category, label sanitiser, first-wins merge, block assembly) plus
  `test/context-{paths,assemble}.test.ts`, 52 unit cases.
- 2026-08-23: project-context T1 — `vendor/shared/contracts/context.ts` (seven
  schemas), barrel re-export, `AgentManifest.project_context` nullish,
  `SpecFile` deprecation marker, `CloneDocsSource` port in `adapters.ts`.
- 2026-08-23: project-context T2 — `agent_docs`/`skill_docs` link tables
  (path only, never a body) added to `db/schema/context.ts`, migration
  `0019_unknown_human_torch.sql` generated and applied.
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
- 2026-08-24: the `.git/` denylist in `assertRepoRelativePath` closes the
  reachability of the leak, not its source. `withGitHubToken`
  (server/src/modules/repos/helpers.ts:29-35) still embeds the GitHub PAT in the
  clone's remote URL, so it still lands in `.git/config` on disk — just no
  longer servable through the file-read endpoint. The durable fix is to stop
  persisting the credential in the clone at all (a one-shot credential helper or
  `http.extraHeader` instead of the embedded URL, in `repos/helpers.ts` and
  `repos/service.ts runCloneJob`), so `.git/config` never holds a secret
  regardless of what can read it. Not done here — pre-existing behaviour this
  session did not introduce, only made reachable.
- 2026-08-23: correction — the `resolveForRun` question below is CLOSED, and its
  fallback is gone. `run-executor.ts` passes `clonePath: repo.clonePath`, the
  `cloneRootFor` wiring left `platform/container.ts`, and
  `ContextServiceDeps.cloneRootFor` plus the `?? this.deps.cloneRootFor?.(repo)`
  branch in `cloneRootOf` are now deleted — `cloneRootOf` is `repo.clonePath ??
  null` and `repos.clone_path` is the ONLY source for the clone root on all four
  paths (`list`/`resync`, `document`, `estimate`, `resolveForRun`). Removing the
  dep also removed the last consumer of the `RepoRef` import in `service.ts`. The
  unit case that injected it (`prefers the clone path the run caller holds over
  the container fallback`) was deleted with it: it constructed a dependency
  production never supplied, so it read as coverage of a branch that could not
  fire (evidence: server/src/modules/context/service.ts:239-241
  `cloneRootOf`; grep `cloneRootFor` across server/src + server/test → no matches)
- 2026-08-23: `resolveForRun` is the one project-context path that still does
  NOT use the stored clone root. `run-executor.ts` calls it with
  `{ owner, name }` built from the repo row while holding `repo.clonePath` on
  that same row, so `ContextService` falls back to an injected
  `cloneRootFor` — wired in `platform/container.ts` to `git.clonePathFor()`,
  the same join that wrote the clone. Passing `clonePath: repo.clonePath` in
  that object literal is a one-line change that retires the fallback entirely;
  it was left alone only because `run-executor.ts` was outside the file set of
  the task that widened the port (evidence:
  server/src/modules/reviews/run-executor.ts `resolveForRun` call;
  server/src/modules/context/service.ts `cloneRootOf`;
  server/src/platform/container.ts `get projectContext()`)