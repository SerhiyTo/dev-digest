# Implementation Plan: Project Context — 2026-08-22

## Context

A DevDigest reviewer agent can tell you a function is wrong, but not that it
contradicts the spec the team agreed on. It reviews a diff against its system
prompt, its linked skills and whatever `repo-intel` computes — and has no way to
read the project's own written intent, even though those PRDs, specs and
architecture notes already sit in the imported repository as markdown.

The gap is narrow because the receiving end is already built and wired to
nothing. `reviewer-core` accepts `specs?: string[]`, wraps each entry with
`wrapUntrusted` and emits a `## Project context` section
(`reviewer-core/src/prompt.ts:97-100,125`); the trace contract carries
`PromptAssembly.specs` and `RunTrace.specs_read` (`trace.ts:41-43,88`); the
run-trace drawer renders both (`TraceBody.tsx:39-51,85-87`). The only missing
link is the producer: `run-executor.ts:304` hard-codes `specs_read: []` and
never passes `specs`.

Outcome: a Project Context page that lists and previews every markdown document
in a cloned repo; a Context tab on the agent and skill editors that attaches
documents in a chosen order with a token-cost footer; and a run that reads those
documents from the clone's default branch and puts their literal text in the
prompt, auditable afterwards in the trace drawer.

## Source of truth

- spec: `specs/2026-08-20-project-context.md` (**SPEC-01**, Status: `approved`)
- roadmap lesson: **L05** — *Project Context Folder* (`README.md:86`)
- INSIGHTS consulted: `server/INSIGHTS.md`, `client/INSIGHTS.md`,
  `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md`

## Acceptance-criteria coverage

48 criteria in the spec; 48 rows here. Four are partial or unplanned and are
repeated verbatim under `## Out of scope`.

| AC | Criterion (shortened) | Tasks | Proven by |
|---|---|---|---|
| AC-1 | Discovery: 4 roots, `.md`/`.mdx`, exclusion list | T5, T7 | `server/test/context-discovery.test.ts` |
| AC-2 | Never follow a symlink | T5 | `server/test/context-discovery.test.ts` |
| AC-3 | path, name, folder, category per document | T3, T7 | `server/test/context-paths.test.ts` |
| AC-4 | >500 docs → first 500 by path + `omitted` | T5, T7 | `server/test/context-discovery.test.ts` |
| AC-5 | Preview renders; selection reflected in the URL | T8 | `ProjectContextView.test.tsx` |
| AC-6 | Raw HTML disabled; non-`http(s)` URLs dropped | T8 | `DocumentPreview.test.tsx` |
| AC-7 | No clone → empty list, `reason: not_cloned`, client state | T7, T8 | `context.it.test.ts`, `ProjectContextView.test.tsx` |
| AC-8 | Cloned, no docs → empty state naming the 4 roots | T8 | `ProjectContextView.test.tsx` |
| AC-9 | Unreadable document → named state, no empty preview | T7, T8 | `context.it.test.ts`, `DocumentPreview.test.tsx` |
| AC-10 | Re-sync refreshes the list; last-refresh time shown | T7, T8 | `context.it.test.ts`, `ProjectContextView.test.tsx` |
| AC-11 | `used_by_agents` per document, each agent once | T7 | `context.it.test.ts` |
| AC-12 | Attachment = (owner, path, order); no body stored | T2 | the migration + `context.it.test.ts` |
| AC-13 | Attach/detach persists; response in ascending order | T7, T10 | `context.it.test.ts`, `ContextTab.test.tsx` |
| AC-14 | Reorder persists new order indexes | T7, T10 | `context.it.test.ts`, `ContextTab.test.tsx` |
| AC-15 | Bad path → **400**, no row created | T3, T7 | `server/test/context-paths.test.ts`, `context.it.test.ts` |
| AC-16 | 21st attachment → **409** naming the limit | T7 | `context.it.test.ts` |
| AC-17 | Attachment absent from the list → rendered missing, kept | T10 | `ContextTab.test.tsx` |
| AC-18 | Attached count and total document count on the tab | T10 | `ContextTab.test.tsx` |
| AC-19 | Skill attach/detach persists with its own order index | T7, T10 | `context.it.test.ts`, `ContextTab.test.tsx` |
| AC-20 | Skill tab: same list, ordering control and preview | T10 | `ContextTab.test.tsx` |
| AC-21 | Skill- and agent-attached merge into one `## Project context` | T3, T9 | `server/test/context-assemble.test.ts` |
| AC-22 | Footer shows tokens of the fully assembled block | T7, T10 | `context.it.test.ts`, `ContextTab.test.tsx` |
| AC-23 | Estimate uses `cl100k_base` | T5, T7 | `server/test/context-estimate.test.ts` |
| AC-24 | Encoder unavailable → `ceil(chars/4)`, `estimator: heuristic` | T1, T5, T7 | `server/test/context-estimate.test.ts` |
| AC-25 | Recompute ≤300 ms p95 for ≤20 documents | T7, T10 | `context.it.test.ts` timing assertion |
| AC-26 | Presented as an estimate, not an exact count | T10 | `ContextTab.test.tsx` |
| AC-27 | Merge order: agent, then skills by link order, first-wins | T3, T7 | `server/test/context-assemble.test.ts` |
| AC-28 | Read from the clone's default branch, never the PR head | T9 | `reviews-context.it.test.ts` |
| AC-29 | One `## Project context` section, each doc `<untrusted>`-wrapped | T3, T9 | `reviewer-core/test/prompt-specs.test.ts` |
| AC-30 | Each document identified by its repo-relative path | T3 | `server/test/context-assemble.test.ts` |
| AC-31 | Empty list → user message byte-identical to pre-feature | T4, T9 | `reviewer-core/test/prompt-specs.test.ts` |
| AC-32 | Missing/unreadable/out-of-root → omit, log, do not fail | T9 | `reviews-context.it.test.ts` |
| AC-33 | Document >32,000 chars → truncate with `… (truncated)` | T3 | `server/test/context-assemble.test.ts` |
| AC-34 | Block >120,000 chars → in-order fill, truncate, omit, log | T3, T9 | `server/test/context-assemble.test.ts` |
| AC-35 | `specs_read` = exactly the injected paths, in order | T9 | `reviews-context.it.test.ts` |
| AC-36 | Run-log event: N injected, M skipped | T9 | `reviews-context.it.test.ts` |
| AC-37 | Literal `</untrusted>` adds no closer | T3, T4 | `reviewer-core/test/prompt-specs.test.ts` |
| AC-38 | Forged section heading adds no opener | T4 | `reviewer-core/test/prompt-specs.test.ts` |
| AC-39 | Path label stripped to `[A-Za-z0-9._/-]` | T3 | `server/test/context-paths.test.ts` |
| AC-40 | CI dispatch assembles by the same order, source and caps | T1, T7 | **partial** — the assembler and the payload field ship; no dispatch exists to observe. See `## Out of scope` |
| AC-41 | Runner injects the payload block verbatim | — | **not planned** — the runner is out of tree. See `## Out of scope` |
| AC-42 | Runner reads no documents from its own checkout | — | **not planned** — out of tree. See `## Out of scope` |
| AC-43 | No block in payload → byte-identical, review does not fail | T4 | **partial** — the property is pinned in `reviewer-core/test/prompt-specs.test.ts`; the runner half is out of tree |
| AC-44 | Old runner build ignores the field | T1 | **partial** — the field ships `.nullish()`, which is what makes it ignorable; no runner exists to test against |
| AC-45 | Drawer segment `Project context — attached specs (untrusted)` | T11 | `TraceBody.test.tsx` |
| AC-46 | Expanded segment shows the full text as sent | T11 | `TraceBody.test.tsx` |
| AC-47 | `Specs read` row lists the injected paths | T9, T11 | `TraceBody.test.tsx` |
| AC-48 | No documents → no segment, `Specs read` shows its none state | T11 | `TraceBody.test.tsx` |

## Requirements review

- **Requirement as understood**: implement SPEC-01 across `server/`, `client/`
  and `e2e/`; `reviewer-core/` is a consumer and gets tests, not source changes.
- **Gaps found, and how they were answered:**
  - *The CI dispatch does not exist.* No `CiService`, no `.devdigest/`, no
    review workflow — `AgentManifest`, `CiExportInput`, `ci_installations`,
    `ci_runs` and `trace.source` are contract and schema with no reader or
    writer. **Answered: contract + assembler only.** The resolver/assembler
    ships as a reusable unit and the payload field lands `.nullish()`; no
    dispatch is wired.
  - *Payload shape.* **Answered: ordered document strings.** The payload carries
    `specs: string[]` (already path-labelled, sanitised, truncated and capped)
    plus `specs_read: string[]`, which a runner forwards to `ReviewInput.specs`.
    This is what keeps `reviewer-core` unchanged, as the spec's contract-impact
    section requires, and makes CI bytes match studio bytes by construction.
  - *The seeded repo has no clone.* `clonePath: null` (`seed.ts:115`), so
    discovery finds nothing for `acme/payments-api`. **Answered: seed a fixture
    clone** so the e2e flow can cover attach → run → inspect.
  - *Execution mode.* **Answered: multi-agent.**
- **Assumptions this plan rests on:**
  1. `GET /repos/:id/context` and `POST /repos/:id/context/resync` are free to
     define — the dormant client hooks (`core.ts:123-137`) point at
     `/context` and `/context/reindex` and are consumed by no page, so
     reshaping the response and renaming `reindex` → `resync` breaks nothing.
  2. Adding `clonePath` to the seeded repo does not disturb flows 02/04/05/08 —
     none of those pages reads the clone.
  3. A whole-ordered-list `PUT` (the `useSetAgentSkills` idiom) satisfies
     AC-13/14/19 for attach, detach and reorder alike.
- **Contradicts spec / INSIGHTS / roadmap:** nothing. Three INSIGHTS entries are
  load-bearing and are carried into `## Constraints`.

## Recommendations

- **Reconcile the dormant slice, do not duplicate it.** `SpecFile` /
  `IndexStatus` (`platform.ts:252-266`), `useContextFiles` / `useReindexContext`
  and a complete `messages/en/context.json` already ship, wired to nothing.
  `SpecFile` cannot carry AC-4's `omitted` or AC-11's `used_by_agents`, so it is
  superseded rather than extended — mark it `@deprecated` pointing at
  `ProjectDoc` (T1) instead of deleting it. `context.json` still carries
  `mode.edit` / `editor.save` from the rejected `UX-1`; prune them (T8).
- **The vendored mirror is already divergent.** `diff -rq` reports
  `contracts/{eval-ci,productionize,trace}.ts` differing between server and
  client today, and `verify-l04.sh:82-91` only gates three files, none of them
  `trace.ts`. T6 must not paper over that: fix the drift it touches and leave
  the rest. Widening the gate to the whole tree is a one-line change worth its
  own PR, not this one.
- **Write the module spec afterwards.** SPEC-01 says what to build; nothing yet
  records why the discovery walk lives in an adapter and not on `GitClient`.
  That is `doc-writer`'s job at `/sdd-close`, into `server/specs/`.

## Execution mode

**multi-agent** — after the contract and schema land, the server and client
halves are genuinely disjoint, and the pure units (paths, assembly) can be built
and tested before any of it.

- **Wave 1 — parallel: T1, T2, T3, T4** · disjoint `Files`, no dependencies
- **Wave 2 — parallel: T5, T6** · T5 consumes T1's port, T6 mirrors T1's contract
- **Wave 3 — parallel: T7, T8** · different modules
- **Wave 4 — parallel: T9, T10, T11** · one server task, two client tasks with
  disjoint files
- **Wave 5 — sequential: T12** · the seed the e2e flow needs
- **Wave 6 — sequential: T13** · the flow itself
- After each wave: `plan-verifier` against that wave's tasks.

## Constraints that must not break

- **A prompt slot ships only if its absence leaves the message byte-identical,
  tested explicitly** — source: `reviewer-core/INSIGHTS.md:17`. This is AC-31
  and it is what lets the feature land without re-baselining every existing
  agent's reviews.
- **`assemblePrompt` omits the specs block on `length > 0`, not on content** —
  source: `reviewer-core/src/prompt.ts:97-99`. `specs: ['']` renders an empty
  fence. The producer must drop empty bodies or AC-31 fails.
- **`wrapUntrusted` labels specs positionally (`spec-${i}`)** — source:
  `reviewer-core/src/prompt.ts:98`. AC-30's repo-relative path must be embedded
  in the document text, not in the fence attribute; `reviewer-core` stays
  unchanged.
- **Do not extend `INJECTION_GUARD`** — source: `reviewer-core/INSIGHTS.md:18`;
  it is pinned by `reviewer-core/test/prompt.test.ts`.
- **Never assert an absolute `</untrusted>` count; compare hostile against
  benign** — source: `server/INSIGHTS.md:14`, and the spec's Testing section.
- **New `RunTrace` / `RunStats` fields are `.nullish()`, never plain** —
  source: `server/INSIGHTS.md` (2026-07-29). `run_traces.trace` is frozen jsonb.
  This plan adds no field there; `specs` and `specs_read` already exist.
- **Zod request-schema failures map to 422, not 400** — source:
  `server/src/app.ts:118-120`. AC-15 demands 400, so path validation lives in
  the service and throws `AppError(..., 400)`; it must not be a route-schema
  refinement.
- **A DTO that must satisfy a contract uses `safeParse` in the service and
  throws `AppError('internal_error', …, 500)`; never a route `response:`
  schema** — source: `server/INSIGHTS.md` (2026-08-10); `fastify-type-provider-zod`
  strips unknown keys.
- **A new slice takes ports in its constructor, never `Container`; a
  cross-module helper is declared in `vendor/shared/adapters.ts`, implemented
  under `src/adapters/` and delegated from the module** — source:
  `server/INSIGHTS.md:195-200`.
- **Never hand-edit `src/db/migrations/*.sql`**; `pnpm db:generate` then
  `pnpm db:migrate`, and split add/drop into two `db:generate` runs — source:
  `server/CLAUDE.md:42-43`, `server/INSIGHTS.md:15`.
- **`server/src/vendor/shared` is canonical; the client copy is hand-synced in
  the same commit** — source: root `CLAUDE.md:24`,
  `.claude/agents/architecture-reviewer.md:180`.
- **No lint script exists in any module.** Quality gate is `typecheck` + tests.
- **Never `element.click()` in a client test; use `fireEvent.click`** — source:
  `client/INSIGHTS.md`.
- **e2e uses agent-browser only — no Playwright, no LLM**; `wait --text` /
  `wait --url` *are* the assertions — source: `e2e/CLAUDE.md`.

## Tasks

### T1 — Add the project-context contracts and ports · module: server · wave: 1

- Files:
  `server/src/vendor/shared/contracts/context.ts` (new),
  `server/src/vendor/shared/index.ts` (edit),
  `server/src/vendor/shared/contracts/platform.ts` (edit),
  `server/src/vendor/shared/contracts/eval-ci.ts` (edit),
  `server/src/vendor/shared/adapters.ts` (edit)
- Skills: zod, semver-discipline, breaking-change, deprecation-policy
- Do: create `contracts/context.ts` following the `review-api.ts` idiom
  (`export const X = z.object({…}); export type X = z.infer<typeof X>;`,
  snake_case wire fields, a `// ---- Section ----` banner, a header block naming
  the endpoints it serves):
  - `ProjectDocCategory = z.enum(['specs','docs','plans','insights'])`
  - `ProjectDoc { path, name, folder, category, used_by_agents }`
  - `ProjectDocList { documents: ProjectDoc[], omitted: number (default 0),
    reason: z.enum(['not_cloned']).nullish(), last_synced_at: nullish }`
  - `ProjectDocBody { path, content }`
  - `DocAttachment { path, order }` and `DocAttachmentInput { paths: string[] }`
  - `TokenEstimate { tokens, estimator: z.enum(['cl100k_base','heuristic']) }`
  - `ProjectContextPayload { specs: string[], specs_read: string[] }`
  Add one `export *` line to the barrel. In `eval-ci.ts`, add
  `project_context: ProjectContextPayload.nullish()` to `AgentManifest` — the
  nullish is what makes an older runner able to ignore it (AC-44). In
  `platform.ts`, mark `SpecFile` with a `@deprecated` marker in the shape the
  `deprecation-policy` skill specifies, naming `ProjectDoc` as the replacement;
  do not delete it. In `adapters.ts`, add the `CloneDocsSource` port
  (`list(repo): Promise<CloneDocEntry[]>`, `read(repo, path): Promise<string|null>`)
  next to `GitClient` — additive, so `GitClient` and its out-of-tree consumers
  are untouched — and add an **optional** `estimator?(): 'cl100k_base' | 'heuristic'`
  to `Tokenizer`.
- Done when: `contracts/context.ts` exports the seven schemas with their inferred
  types, the barrel re-exports them, `AgentManifest.project_context` parses when
  absent, `SpecFile` carries the marker, and `pnpm typecheck` is clean.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: —

### T2 — Add the attachment tables and migration · module: server · wave: 1

- Files: `server/src/db/schema/context.ts` (edit),
  `server/src/db/migrations/` (generated)
- Skills: drizzle-orm-patterns, postgresql-table-design
- Do: add `agentDocs` and `skillDocs` to the existing `schema/context.ts`,
  copying the `agentSkills` shape verbatim (`schema/agents.ts:51-59`): composite
  primary key, both FKs `onDelete: 'cascade'`, `order: integer().notNull().default(0)`.
  `agent_docs (agent_id uuid → agents.id, path text, order integer)` with
  `primaryKey({ columns: [agentId, path] })`; `skill_docs (skill_id uuid →
  skills.id, path text, order integer)` likewise. Store the path only — never a
  document body (AC-12). Add an index on `agent_id` and on `path` (the
  `used_by_agents` reverse lookup reads by path). Then run `pnpm db:generate` to
  produce `0019_*.sql` and `pnpm db:migrate` to apply it. Do not touch
  `code_chunks`, and do not hand-edit the generated SQL.
- Done when: `0019_*.sql` exists and contains only two `CREATE TABLE`s plus their
  indexes, `pnpm db:migrate` applies cleanly, and no existing column is dropped,
  renamed or narrowed.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: —

### T3 — Build the pure path, merge and assembly core · module: server · wave: 1

- Files: `server/src/modules/context/constants.ts` (new),
  `server/src/modules/context/paths.ts` (new),
  `server/src/modules/context/assemble.ts` (new),
  `server/test/context-paths.test.ts` (new),
  `server/test/context-assemble.test.ts` (new)
- Skills: onion-architecture, typescript-expert, security
- Do: no I/O in any of these files.
  - `constants.ts`: `DOC_ROOTS = ['docs','specs','plans','insights']`,
    `DOC_EXTENSIONS = ['.md','.mdx']`, `EXCLUDED_DIRS` (`node_modules`, `dist`,
    `build`, `coverage`, `.next`, `out`, `vendor`, `.git`), `MAX_DOCUMENTS = 500`,
    `MAX_ATTACHMENTS = 20`, `MAX_DOC_CHARS = 32_000`, `MAX_BLOCK_CHARS = 120_000`,
    `TRUNCATION_MARKER = '… (truncated)'`. The last two match
    `conventions/constants.ts:11,47` deliberately — say so in the constant's
    name, not a comment.
  - `paths.ts`: `isProjectDocPath(path)` — modelled on
    `intent/references.ts:52-67` (`isSafeDocPath`) but stricter: the **first**
    segment must be in `DOC_ROOTS` (case-insensitive), the extension in
    `DOC_EXTENSIONS`, the path relative, POSIX, `posix.normalize`-idempotent,
    with no `..` segment, no leading `/`, no backslash, no URL scheme. Do not
    modify `intent/references.ts` — its `.txt` and any-segment rules belong to
    that feature. Also `categoryOf(path)` and
    `sanitizePathLabel(path)` = `path.replace(/[^A-Za-z0-9._/-]/g, '')` (AC-39).
  - `assemble.ts`: `mergeAttachments(agentPaths, skillPathsInLinkOrder)` —
    concatenate, keep the **first** occurrence of a repeated path (AC-27); and
    `assembleProjectContext(entries: {path, text}[])` returning
    `{ specs: string[], specsRead: string[], skipped: {path, reason}[] }`.
    Each spec entry is `` `${sanitizePathLabel(path)}\n\n${body}` `` (AC-30),
    per-document truncation at `MAX_DOC_CHARS` with the marker (AC-33), then an
    in-order running total against `MAX_BLOCK_CHARS` — truncate the crossing
    document, omit the rest, record them in `skipped` (AC-34). **Drop entries
    whose body is empty after trimming**, or the empty-fence path in
    `prompt.ts:97-99` renders a `## Project context` heading for nothing.
  - Tests: the root/extension/traversal matrix, the label strip against a
    filename containing `"`, the first-wins dedupe across an agent path and two
    skill paths, per-document truncation, the block-budget fill, and the
    empty-body drop.
- Done when: every listed test passes and neither file imports `node:fs`,
  Drizzle, Fastify or a contract.
- Verify: `cd server && pnpm exec vitest related --run src/modules/context/paths.ts src/modules/context/assemble.ts --reporter=dot && pnpm typecheck`
- Depends on: —

### T4 — Pin the prompt-slot properties · module: reviewer-core · wave: 1

- Files: `reviewer-core/test/prompt-specs.test.ts` (new)
- Skills: none — plain edit
- Do: **no source change in this package.** Copy the five-case shape of
  `prompt-intent.test.ts`: (1) the block renders under `## Project context` with
  an `<untrusted source="spec-0">` fence and lands in `assembly.specs`; (2) it
  sits after `## Repo skeleton` and before `## Diff to review`, asserted with
  `indexOf`; (3) **`specs: undefined` and `specs: []` each produce an
  `assembly.user` `toBe`-equal to a baseline render** — this is AC-31 and AC-43
  and it is the property the whole feature ships on; (4) a document containing a
  literal `</untrusted>` yields the same closer count as a benign document of
  the same length (AC-37) — compare hostile against benign, never an absolute
  count; (5) a document containing `## Diff to review`, `## Skills / rules`,
  `## Relevant memory` and `## Repo skeleton` yields the same
  `<untrusted source="` opener count as a benign render (AC-38). Add one case
  documenting the sharp edge T3 works around: `specs: ['']` **does** render a
  heading, so the producer must not emit empty bodies.
- Done when: all six cases pass against unmodified `reviewer-core/src`.
- Verify: `cd reviewer-core && npm run typecheck && npm test -- --reporter=dot`
- Depends on: —

### T5 — Implement the clone-docs adapter and the tokenizer estimator · module: server · wave: 2

- Files: `server/src/adapters/clonedocs/index.ts` (new),
  `server/src/adapters/tokenizer/index.ts` (edit),
  `server/src/adapters/mocks.ts` (edit),
  `server/src/platform/container.ts` (edit),
  `server/test/context-discovery.test.ts` (new),
  `server/test/context-estimate.test.ts` (new)
- Skills: onion-architecture, security
- Do: implement `CloneDocsSource` over the filesystem, modelled on
  `repo-intel/pipeline/walk.ts:73-121` — recursive `readdir` with
  `withFileTypes`, **`dirent.isSymbolicLink()` skipped outright** (AC-2),
  `EXCLUDED_DIRS` pruned, extension gate, POSIX-normalised relative paths,
  stable ascending path sort, and a hard stop that returns the first
  `MAX_DOCUMENTS` with the count omitted (AC-4). Unreadable directories are
  swallowed, not thrown. `read()` resolves through `isProjectDocPath` **again**
  before joining (`readClone` at `repo-intel/service.ts:876-878` does
  `join(clonePath, file)` with no guard — do not repeat that), returns `null` on
  any error. Return `{ reason: 'not_cloned' }` when `repos.clone_path` is null
  (AC-7). In the tokenizer, implement the new optional `estimator()` returning
  `'heuristic'` once the sticky `broken` flag is set and `'cl100k_base'`
  otherwise, and update the "ONLY under modules/repo-intel" scope note in the
  file header — this feature widens it. Add `MockCloneDocs` to `mocks.ts` taking
  a `{ [path]: content }` map, mirroring `MockGitClient`. Wire
  `cloneDocs?: CloneDocsSource` into `ContainerOverrides` and add the lazy
  getter next to `get git()`.
- Done when: the walk finds `.md`/`.mdx` under all four roots only, skips a
  symlinked `.md`, prunes `node_modules`, caps at 500 with a correct `omitted`,
  and `estimator()` reports `heuristic` after a forced encoder failure.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T1, T3

### T6 — Mirror the contracts into the client · module: client · wave: 2

- Files: `client/src/vendor/shared/contracts/context.ts` (new),
  `client/src/vendor/shared/index.ts` (edit),
  `client/src/vendor/shared/contracts/platform.ts` (edit),
  `client/src/vendor/shared/contracts/eval-ci.ts` (edit),
  `client/src/vendor/shared/adapters.ts` (edit),
  `client/src/lib/types.ts` (edit)
- Skills: zod, typescript-expert
- Do: copy T1's files byte-for-byte from `server/src/vendor/shared/`. Re-export
  the new types from `lib/types.ts` alongside `SpecFile`/`IndexStatus`.
  `eval-ci.ts` already differs between the two copies — reconcile only the
  `AgentManifest` addition and leave the rest of the existing drift alone; do
  not touch `productionize.ts` or `trace.ts`. Run `pnpm build`, not just
  `typecheck`: `client/INSIGHTS.md` records that a **value** import from
  `@devdigest/shared` can break the Next build while typecheck and test stay
  green.
- Done when:
  `diff -q server/src/vendor/shared/contracts/context.ts client/src/vendor/shared/contracts/context.ts`
  is silent, and `pnpm build` succeeds.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T1

### T7 — Build the context module: repository, service, routes · module: server · wave: 3

- Files: `server/src/modules/context/ports.ts` (new),
  `server/src/modules/context/repository.ts` (new),
  `server/src/modules/context/service.ts` (new),
  `server/src/modules/context/routes.ts` (new),
  `server/src/modules/context/types.ts` (new),
  `server/src/modules/index.ts` (edit),
  `server/src/platform/errors.ts` (edit),
  `server/test/context.it.test.ts` (new)
- Skills: onion-architecture, fastify-best-practices, drizzle-orm-patterns, zod, security
- Do: follow the `intent/` idiom — `ports.ts` declares the module-local
  interfaces (`DocStore`, `Docs`, `Tokens`, `Logger`) and `routes.ts` builds
  them from the container, so the service takes a single deps object and never
  sees `Container`. `types.ts` exports the `ProjectContext` facade interface
  that T9 resolves through the container, mirroring `repo-intel/types.ts`.
  - `repository.ts`: Drizzle only — read/replace `agent_docs` and `skill_docs`
    ordered by `order`, and the `used_by_agents` reverse lookup that counts an
    agent once whether it attaches a path directly or through a linked skill
    (AC-11). Reordering is delete-then-insert, the `setSkills` precedent
    (`agents/repository.ts:229-236`).
  - `service.ts`: `list(workspaceId, repoId)` (AC-1/3/4/7/11),
    `document(workspaceId, repoId, path)` (AC-9), `resync(...)` returning the
    refresh time (AC-10), `attachments(ownerKind, ownerId)`,
    `setAttachments(ownerKind, ownerId, paths)`, `estimate(repoId, paths)`, and
    `resolveForRun(agentId, repo)` — the shared assembler T9 and any future CI
    dispatch both call (AC-40). Validate every path with `isProjectDocPath` and
    throw `new AppError('invalid_path', …, 400)` on failure — **not** a
    route-schema refinement, which would surface as 422 (AC-15). Throw the new
    `ConflictError` when `paths.length > MAX_ATTACHMENTS`, with a message naming
    the limit (AC-16). `safeParse` every DTO against its contract before
    returning it, throwing `AppError('internal_error', …, 500)` on mismatch.
  - `errors.ts`: add `ConflictError extends AppError` → `('conflict', msg, 409)`.
    There is no 409 anywhere in the codebase today.
  - `routes.ts`: `GET /repos/:id/context`, `GET /repos/:id/context/file`,
    `POST /repos/:id/context/resync`, `POST /repos/:id/context/estimate`,
    `GET|PUT /agents/:id/context`, `GET|PUT /skills/:id/context`. Every handler
    calls `getContext(container, req)` first and passes `workspaceId` as the
    first service argument. Request bodies declared at module scope. No
    `response:` schemas. No rate limit on `estimate` — AC-25 requires it to
    recompute on every toggle. Register the module with one import and one entry
    in `modules/index.ts`.
  - `context.it.test.ts`: the `conventions.it.test.ts` skeleton
    (`dockerAvailable()` guard, `startPg()`, `buildApp({ overrides: { cloneDocs:
    new MockCloneDocs({…}) } })`, `app.inject()`), covering AC-7, AC-9, AC-10,
    AC-11, AC-13, AC-14, AC-15 (**assert 400, not 422**), AC-16, AC-19, AC-22
    and AC-25's 300 ms bound.
- Done when: every endpoint returns its contract shape, a `..` path returns 400
  with zero rows created, the 21st path returns 409, and the estimate reports
  `cl100k_base` with a heuristic fallback.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T2, T3, T5

### T8 — Build the Project Context page · module: client · wave: 3

- Files: `client/src/app/repos/[repoId]/context/page.tsx` (new),
  `client/src/app/repos/[repoId]/context/_components/ProjectContextView/` (new,
  with `styles.ts`, `constants.ts`, `helpers.ts`, `index.ts`, `.test.tsx` and a
  nested `_components/{DocumentList,DocumentPreview}/`),
  `client/src/lib/hooks/context.ts` (new),
  `client/src/lib/hooks/index.ts` (edit),
  `client/src/lib/hooks/core.ts` (edit — remove the dormant
  `useContextFiles`/`useReindexContext`),
  `client/src/vendor/ui/primitives/Markdown.tsx` (edit),
  `client/messages/en/context.json` (edit)
- Skills: frontend-ui-architecture, next-best-practices, react-best-practices,
  react-testing-library, security
- Do: clone the `conventions/page.tsx` template — a 12-line `"use client"` route
  that reads `repoId` from `useParams` and renders the view. Register the page in
  the nav registry `client/src/vendor/ui/nav.ts` (a `NavItemDef` with a
  `:repoId` href plus a `ShortcutDef`), which is where sidebar entries live, not
  the app router. Move the dormant hooks into a real `hooks/context.ts`:
  `useProjectDocs`, `useProjectDoc`, `useResyncProjectContext`,
  `useDocAttachments(ownerKind, id)`, `useSetDocAttachments`, `useTokenEstimate`.
  The view renders the list grouped by category with a `used_by_agents` badge
  (AC-11), a not-cloned state naming the repository (AC-7), an empty state
  naming the four scanned roots (AC-8), an unreadable-document state naming the
  path and reason (AC-9), and a resync control showing the last successful
  refresh (AC-10). Selection lives in the URL via `router.replace` with a
  `?path=` param, the `?tab=` precedent from `agents/[id]/page.tsx:25-31`, so a
  reload restores it (AC-5). For AC-6, add an **opt-in** `allowedUrlSchemes?:
  string[]` prop to the vendored `Markdown` primitive wired to react-markdown's
  `urlTransform`, and pass `['http','https']` from the preview only — a blanket
  tightening would silently drop `mailto:` links in the five existing call sites.
  Raw HTML is already off by default in react-markdown v9; add heading, list,
  table and `pre` renderers, which the primitive lacks. Prune `mode.edit` and
  `editor.save` from `context.json` (rejected `UX-1`) and add the new keys.
- Done when: all five states render from mocked fetches, a reload restores the
  selected path, and a document containing `<script>` and
  `[click](javascript:alert(1))` renders inert.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T6

### T9 — Inject project context at run time · module: server · wave: 4

- Files: `server/src/modules/reviews/run-executor.ts` (edit),
  `server/src/platform/container.ts` (edit),
  `server/src/platform/trace-builder.ts` (edit),
  `server/test/reviews-context.it.test.ts` (new)
- Skills: onion-architecture, security
- Do: add a `get projectContext(): ProjectContext` facade to the container,
  typed by `modules/context/types.ts` and mirroring `get repoIntel()` — the
  executor must not import another module's service directly. In `runOneAgent`,
  immediately after the `skills: N attached` event (`run-executor.ts:199-204`),
  call `resolveForRun` and emit the mirroring event
  `project context: ${specsRead.length} injected, ${skipped.length} skipped`
  with `{ attached, skipped }` payloads (AC-36, AC-32). Documents are read from
  the repository clone at its **default branch** — the same source the page
  lists from — never from the pull request's head ref (AC-28). Pass the result
  with the existing conditional-spread idiom,
  `...(specs.length ? { specs } : {})`, so an agent with nothing attached
  produces the pre-feature message byte-for-byte (AC-31). Set
  `specs_read: specsRead` at `run-executor.ts:304` and thread `specsRead`
  through `trace-builder.ts:33,52`. A missing, unreadable or out-of-root
  document is omitted and logged; it never fails the run (AC-32). Leave
  `traceFromBuffer`'s `specs: null` / `specs_read: []` as they are — a failed run
  assembled nothing, which is what AC-48 describes. The integration test asserts
  AC-27's merge order, AC-28 (a PR that modifies an attached document leaves
  `prompt_assembly.specs` unchanged), AC-32, AC-35 and AC-36, and pins
  `status === 'done'` with real content **before** asserting what the prompt
  lacks — `server/INSIGHTS.md:17` records the vacuous-negative trap.
- Done when: a run with attachments shows them in `prompt_assembly.specs` and
  `specs_read` in injection order; a run without them produces a
  `prompt_assembly.user` identical to the pre-change baseline.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T7

### T10 — Build the Context tab for agents and skills · module: client · wave: 4

- Files: `client/src/components/doc-attach/` (new — `DocAttachPanel.tsx`,
  `helpers.ts`, `styles.ts`, `index.ts`, `DocAttachPanel.test.tsx`),
  `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/` (new),
  `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` (edit),
  `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (edit),
  `client/src/app/agents/[id]/page.tsx` (edit),
  `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/` (new),
  `client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.tsx` (edit),
  `client/src/app/skills/[id]/_components/SkillEditor/constants.ts` (edit),
  `client/src/app/skills/[id]/page.tsx` (edit),
  `client/messages/en/agents.json` (edit),
  `client/messages/en/skills.json` (edit)
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library
- Do: build one shared `DocAttachPanel` in `src/components/` — it serves two
  routes, so strings arrive as a `labels` prop rather than through
  `useTranslations`, the rule stated at `markdown-editor/MarkdownEditor.tsx:1-6`.
  Copy `AgentEditor/_components/SkillsTab/SkillsTab.tsx` and reuse its
  `helpers.ts` verbatim (`move`, `orderedLinkedIds`, `matchesFilter`): native
  HTML5 drag-and-drop, a `Checkbox` per row, two sections split by a divider,
  a filter input, and persistence by `PUT`ing the whole ordered path array. Add
  what does not exist yet: **keyboard-operable up/down `IconBtn`s beside the drag
  handle** — the spec requires a keyboard alternative to dragging and there is
  none in the codebase today. Render an attachment whose path is absent from the
  list as a missing row that stays attached (AC-17), the attached/total badge
  (AC-18), and a footer with the server token estimate, debounced ~250 ms,
  worded as an estimate (AC-22, AC-25, AC-26). Register the tab in three places
  per editor: the `TABS` descriptor, the shell, and `VALID_TABS` in `page.tsx`.
  Note `AgentEditor.tsx:25` is a **ternary with `ConfigTab` as the fallback** — a
  third tab forces the `&&`-chain style `SkillEditor` already uses.
- Done when: both tabs render the same rows and controls for the same repository
  (AC-20), reorder works by keyboard and by drag, a missing attachment survives a
  reload, and the footer updates after a toggle.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T6

### T11 — Surface project context in the run-trace drawer · module: client · wave: 4

- Files: `client/messages/en/runs.json` (edit),
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.test.tsx` (edit)
- Skills: react-testing-library
- Do: change `runs.trace.prompt.specs` at `runs.json:50` from
  `"Project context (dynamic)"` to
  `"Project context — attached specs (untrusted)"` (AC-45). No component change
  is needed: `TraceBody.tsx:85-87` already renders the `specs` leg when non-null
  and omits it entirely when null, `PromptBlock` already provides the expand,
  copy and fullscreen affordances (AC-46), and the `Specs read` row at
  `TraceBody.tsx:39-51` already lists paths with a muted `none` state (AC-47,
  AC-48). Add test cases proving all four: the segment label with a populated
  `specs`, its full text matching `prompt_assembly.specs`, the paths in
  `Specs read`, and the absence of both when `specs` is null and `specs_read` is
  empty.
- Done when: the four cases pass and no other `runs.json` key changed.
- Verify: `cd client && pnpm typecheck && pnpm exec vitest run --reporter=dot`
- Depends on: T6

### T12 — Seed a fixture clone for the demo repo · module: server · wave: 5

- Files: `server/src/db/seed.ts` (edit)
- Skills: none — plain edit
- Do: write a small fixture tree under the configured clone directory for
  `acme/payments-api` — three or four short markdown files across at least
  `specs/` and `docs/` — and set `clonePath` on the seeded repo, which is `null`
  today (`seed.ts:115`). Keep it idempotent, the same select-then-insert
  discipline the rest of the file uses. The files must be small enough that no
  cap fires, and their text must be stable, because the e2e flow asserts against
  it. Do not change the seeded PR, its files, the agents or the conventions —
  flows 02/04/05/08 assume all of them.
- Done when: `pnpm db:seed` twice in a row leaves the same state, and
  `GET /repos/:id/context` returns the fixture documents.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' --reporter=dot`
- Depends on: T7

### T13 — Add the attach → run → inspect e2e flow · module: e2e · wave: 6

- Files: `e2e/specs/09-project-context.flow.json` (new),
  `e2e/README.md` (edit)
- Skills: none — plain edit
- Do: continue the numbered sequence after `08-conventions.flow.json`, copying
  its shape exactly — `open`, `wait --url`, `wait --load networkidle`,
  `wait --text`, `find role button click --name`, and nothing else. The flow:
  open the app, reach the Project Context page for the seeded repo, assert a
  fixture document is listed, open its preview and assert a line of its text,
  go to the agent editor's Context tab, attach the document, assert the
  attached/total badge and the token footer, then open a run's trace drawer and
  assert the `Project context — attached specs (untrusted)` segment and the path
  in `Specs read`. `wait --text` **is** the assertion — no separate assert step.
  No `chat` command. Add rows for both `08-conventions` and `09-project-context`
  to the coverage table in `e2e/README.md`, which currently stops at `07`.
- Done when: `npm run typecheck` passes and the flow runs green under
  `npm run e2e:hermetic` without disturbing flows 01–08.
- Verify: `cd e2e && npm run typecheck`
- Depends on: T12

## Contract & version impact

**MINOR — additive on every surface, breaking on none.**

| Surface | Change | Verdict |
|---|---|---|
| `vendor/shared/contracts/context.ts` | New file, seven schemas | additive |
| `vendor/shared/contracts/eval-ci.ts` | `AgentManifest.project_context` `.nullish()` | additive both directions — a new server against an old runner (AC-44) and an old server against a new runner (AC-43) both work, which is the reason the field is nullish |
| `vendor/shared/contracts/platform.ts` | `SpecFile` gains a `@deprecated` marker | non-breaking; **no deletion** in this plan |
| `vendor/shared/adapters.ts` | New `CloneDocsSource` port; `Tokenizer.estimator?()` optional | additive — `GitClient` is untouched, so the out-of-tree runner is unaffected |
| HTTP | Six new route groups under `/repos/:id/context`, `/agents/:id/context`, `/skills/:id/context` | additive |
| Database | `agent_docs`, `skill_docs` | additive; no column dropped, renamed, narrowed or made `NOT NULL` |
| `reviewer-core` exports | **none** | `ReviewInput.specs` is already optional |
| `PromptAssembly.specs`, `RunTrace.specs_read` | Start carrying values where they were unconditionally `null` and `[]` | semantic change, not a shape change; `TraceBody.tsx` already branches on both, every historical trace stays valid |

No `@deprecated` marker is required before any of it, because nothing is
removed. `SpecFile`'s marker starts its own removal window; the deletion is a
later change, not this one.

## Verification (end to end)

In order, after the last wave:

```sh
cd reviewer-core && npm ci && npm run typecheck && npm test

cd ../server && pnpm typecheck
pnpm exec vitest run --exclude '**/*.it.test.ts'     # unit lane
pnpm exec vitest run .it.test                        # integration lane, Docker required
pnpm db:migrate && pnpm db:seed

cd ../client && pnpm typecheck && pnpm exec vitest run && pnpm build

# the vendored mirror — the only gate that catches a one-sided contract edit
diff -q server/src/vendor/shared/contracts/context.ts \
        client/src/vendor/shared/contracts/context.ts
bash scripts/verify-l04.sh

cd e2e && npm run typecheck && npm run e2e:hermetic
```

The acceptance bar, stated narrowly: an agent with **no** attachments produces a
`prompt_assembly.user` byte-identical to a pre-change baseline for the same run
inputs, and an agent with two attached documents — one of them also attached to
one of its linked skills — produces a single `## Project context` section
listing each path once, in merge order, with `specs_read` matching.

## Out of scope

Repeated verbatim from the coverage table:

- **AC-41** — *WHERE a CI job payload carries an assembled block, the runner
  shall inject it verbatim as the `## Project context` section and shall
  populate `prompt_assembly.specs` and `specs_read` from the payload.* The
  runner is bundled outside this tree and there is no dispatch here to carry a
  payload.
- **AC-42** — *The CI runner shall not read project-context documents from its
  own checkout.* Same reason; nothing in this repository can observe it.
- **AC-40** and **AC-43**/**AC-44** ship partially: the resolver, the caps, the
  escaping and the payload contract all land and are tested, but no dispatch
  exists to compare a CI payload against a studio run.

Also out of scope, from the spec's own non-goals: authoring or editing documents
(`UX-1`, rejected), writing to the repository in any form, the `78 COVERAGE`
gauge (`UX-2`), the `Indexed: N files · N chunks` footer (`UX-3`), per-row token
estimates (`UX-5`), embedding or chunking, non-markdown documents, and
per-repository agents.

Deliberately excluded by this plan rather than by the spec:

- Widening `scripts/verify-l04.sh`'s mirror gate beyond its three hardcoded
  files, and repairing the pre-existing `eval-ci.ts` / `productionize.ts` /
  `trace.ts` drift.
- Deleting `SpecFile`, `IndexStatus` and the `code_chunks` table.
- Rendering `prompt_assembly.pr_description` and `prompt_assembly.intent`, which
  are declared in the contract and rendered nowhere.
- The module spec in `server/specs/` — `doc-writer`'s job at `/sdd-close`.

## Open questions

None outstanding. The four that shaped this plan — CI scope, payload shape, e2e
scope and execution mode — were answered before it was written and are recorded
under `## Requirements review`.
