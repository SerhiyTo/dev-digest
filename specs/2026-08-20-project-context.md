# Spec: Project Context
Spec ID: SPEC-01
Status: implemented
Supersedes: none
Verified: 2026-08-23 — 43 of 48 criteria met in this repository; AC-41 and AC-42
are not implementable here and AC-40, AC-43 and AC-44 ship their in-tree half
only, all five for the reason recorded under **Parity with the CI runner** below.
Two honesty notes came out of the verification: AC-10 is met literally but not in
substance, and the AC-32 log line is bounded where the edge-case table said it
names each. Both are recorded in place and carried as `Q-3` and `Q-4`.

## Problem and user

A reviewer agent in DevDigest reviews a diff against its system prompt, its
linked skills and whatever repo-derived context `repo-intel` computes. It has no
way to read the project's own written intent — the PRDs, specs, architecture
notes and incident write-ups that already sit in the repository as markdown. The
result is a reviewer that can tell you a function is wrong but not that it
contradicts the spec the team agreed on. Today the studio user has no surface at
all for those documents: nothing lists them, nothing attaches them, and nothing
puts them in a prompt.

The gap is unusually narrow, because the receiving end already exists and is
wired to nothing. `reviewer-core` already accepts `specs?: string[]`, already
wraps each entry with `wrapUntrusted` and already emits a `## Project context`
section (`reviewer-core/src/prompt.ts:49,97-99,125`); the run trace already
carries `PromptAssembly.specs` and `RunTrace.specs_read`
(`server/src/vendor/shared/contracts/trace.ts:44,88`); and the run-trace drawer
already renders both (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:38-49,80-82`).
The only producer in the chain is missing: `server/src/modules/reviews/run-executor.ts`
hard-codes `specs: null` at line 475 and `specs_read: []` at line 304. This
feature is the L05 roadmap item **Project Context Folder** (root `README.md:86`),
whose name is already reserved in the contract layer
(`server/src/vendor/shared/contracts/platform.ts:9`). It spans `server/`,
`client/`, the vendored contracts, `e2e/` and the GitHub/CI runner;
`reviewer-core/` is a consumer of the new data, not a site of new behaviour.

## Goals and non-goals

**Goals**

- A user can find, read and reason about every markdown document that lives in
  the imported repository, without leaving DevDigest and without a clone on
  their own machine.
- A user can decide, per agent and per skill, which of those documents an agent
  reads before it reviews — and can control the order they are read in.
- A user can see, for any document, how many agents currently depend on it.
- A user knows the recurring token cost of that decision **before** running
  anything, because the cost is charged on every run of that agent, forever.
- An agent run reads the attached documents from the project itself at run time
  and puts their literal text in the prompt.
- A review run through the GitHub/CI runner reads the same documents as a studio
  run of the same agent, so the reviewer does not behave differently in the two
  places.
- Anyone auditing a completed run can read the exact bytes that were injected,
  identified as project context and marked untrusted.
- An agent with nothing attached produces a prompt byte-identical to the one it
  produced before this feature existed.

**Non-goals**

- **Authoring.** Creating documents, creating folders, uploading files and
  editing in place are all out of scope. The clone is a read-only mirror whose
  `sync()` performs `git reset --hard` (`server/src/adapters/git/simple-git.ts:78-80`),
  so an in-place edit is destroyed on the next resync, and the alternative — a
  database overlay layered over the clone — carries a second document store, an
  upload surface and two further trust boundaries. `UX-1` was accepted and then
  **rejected by the user on scope grounds**: this spec attaches the project's
  existing documents, it does not become a place to write them.
- **Writing to the repository** in any form: no file write into the clone, no
  commit, no branch, no push.
- **The `78 COVERAGE` gauge.** Spec conformance has a table
  (`server/src/db/schema/eval.ts:37`) and a registered feature model
  (`platform.ts:16`) and no module that computes it. `UX-2`, rejected — nothing
  in this spec renders it.
- **The `Indexed: N files · N chunks` footer.** `code_chunks` is defined
  (`server/src/db/schema/context.ts:31`) and written by nothing in this
  repository. `UX-3`, rejected — nothing in this spec renders it.
- **Per-document token estimates on the attach rows.** `UX-5`, rejected — the
  block total is the only token figure.
- **Embedding, chunking or semantic retrieval** of documents. Attachment is an
  explicit human choice, not a similarity search.
- **Non-markdown documents.** `.txt` is discoverable by the intent module but is
  not markdown and has no preview renderer here.
- **Per-repository agents.** Agents and skills stay workspace-scoped; an
  attachment is a repo-relative path resolved against whichever repository the
  run is against.

## User stories

- **US-1**: As a reviewer configuring DevDigest, I want to browse and read every
  markdown document in the imported repository, so that I know what project
  context exists before deciding what an agent should read.
- **US-2**: As a reviewer configuring an agent, I want to attach specific
  documents to that agent in a chosen order, so that it reviews against our
  written intent instead of only against the diff.
- **US-3**: As a reviewer maintaining a shared skill, I want to attach documents
  to the skill, so that every agent using that skill inherits the same context
  without me configuring each agent.
- **US-4**: As a reviewer paying for model calls, I want to see how many tokens
  my selection adds to every prompt, so that I can trade context against cost
  before I commit to it.
- **US-5**: As a reviewer running an agent, I want the attached documents fetched
  from the project and placed in the prompt as literal text, so that the model
  actually reads them.
- **US-6**: As someone auditing a completed run, I want to open the prompt
  assembly and read the full project-context text that was sent, so that I can
  explain why the agent said what it said.
- **US-7**: As a reviewer relying on CI reviews, I want a CI run to read the same
  attached documents as a studio run, so that a review that passes in one place
  does not fail in the other for a reason nobody can see.

## Acceptance criteria (EARS)

**Discovery and reading**

- **AC-1 (US-1)**: WHEN a user opens the Project Context page for a repository,
  the server shall return every file in that repository's cloned default branch
  whose first path segment is `docs`, `specs`, `plans` or `insights`
  (case-insensitive) and whose extension is `.md` or `.mdx`, excluding any path
  under `node_modules`, `dist`, `build`, `coverage`, `.next`, `out`, `vendor` or
  `.git`.
  *Observed by*: the document-list response body, compared against a recursive
  listing of the clone directory.
- **AC-2 (US-1)**: The system shall never follow a symbolic link while
  discovering documents.
  *Observed by*: a symlinked `.md` file placed in the clone is absent from the
  document-list response.
- **AC-3 (US-1)**: The system shall return each document with its repo-relative
  path, its file name, its containing folder and a category derived from its
  first path segment (`specs`, `docs`, `plans` or `insights`).
  *Observed by*: the document-list response body.
- **AC-4 (US-1)**: IF the discovery walk finds more than 500 matching documents,
  THEN the server shall return the first 500 in ascending path order and shall
  report the number omitted.
  *Observed by*: the `omitted` count in the document-list response.
- **AC-5 (US-1)**: WHILE a document is selected on the Project Context page, the
  client shall render its markdown in a read-only preview and shall reflect the
  selected path in the page URL.
  *Observed by*: the address bar, and a full page reload restoring the same
  selection.
- **AC-6 (US-1)**: The document preview shall render markdown with raw HTML
  disabled and shall drop every link and image URL whose scheme is not `http` or
  `https`.
  *Observed by*: the rendered DOM for a document containing a `<script>` tag and
  a `[click](javascript:alert(1))` link.
- **AC-7 (US-1)**: IF the repository has no clone path, THEN the server shall
  return an empty document list with reason `not_cloned`, and the client shall
  render a not-cloned state naming the repository instead of an empty list.
  *Observed by*: the `reason` field in the response, and the rendered element.
- **AC-8 (US-1)**: IF a cloned repository contains no matching document, THEN the
  client shall render an empty state naming the four scanned roots.
  *Observed by*: the rendered element.
- **AC-9 (US-1)**: IF a listed document cannot be read when the user selects it,
  THEN the client shall render an unreadable-document state naming the path and
  the reason, and shall not render an empty preview.
  *Observed by*: the rendered element.
- **AC-10 (US-1)**: WHEN a user triggers re-sync on the Project Context page, the
  server shall refresh the document list from the clone's current default-branch
  state, and the client shall display the time of the last successful refresh.
  *Observed by*: a document added to the clone appearing in the list, and the
  rendered timestamp.
  *Implementation note (2026-08-23)* — **met literally, not in substance.**
  Discovery is a stateless live walk, so `last_synced_at` is generated at the
  start of every read (`server/src/modules/context/service.ts:182,206`) and
  `resync()` is `list()` verbatim. The refresh half of the criterion holds — a
  document added to the clone does appear — but the timestamp is the time of
  *this* read, not of "the last successful refresh", so it always renders as the
  present moment and the client's `neverSynced` string
  (`client/messages/en/context.json:30`) is unreachable for any cloned
  repository. Persisting the real value needs a column the schema does not
  have. Recorded as `Q-3`.
- **AC-11 (US-1)**: The system shall report, for each listed document, the number
  of agents that currently depend on it, counting an agent that attaches it
  directly and an agent one of whose linked skills attaches it, each agent once.
  *Observed by*: the `used_by_agents` count in the response, and the rendered
  badge.

**Attaching to an agent**

- **AC-12 (US-2)**: The system shall store an agent's project-context attachment
  as the triple (agent identifier, repo-relative document path, order index) and
  shall not store the document body.
  *Observed by*: the persisted attachment row.
- **AC-13 (US-2)**: WHEN a user attaches or detaches a document on the Agent
  Context tab, the server shall persist the change and shall return the agent's
  attachments in ascending order index.
  *Observed by*: the attachment response body, and a reload of the tab.
- **AC-14 (US-2)**: WHEN a user reorders the attached documents, the server shall
  persist the new order indexes.
  *Observed by*: the persisted attachment rows.
- **AC-15 (US-2)**: IF an attachment request names a path that is absolute,
  contains a `..` segment, is not normalised, or does not resolve inside one of
  the four scanned roots of the clone, THEN the server shall reject the request
  with HTTP 400 and shall create no attachment row.
  *Observed by*: the response status, and the attachment row count.
- **AC-16 (US-2)**: IF an agent already has 20 attachments, THEN the server shall
  reject a further attachment with HTTP 409 and a message naming the limit.
  *Observed by*: the response status.
- **AC-17 (US-2)**: WHERE an agent has an attachment whose path is absent from
  the current document list, the Context tab shall render that row as missing and
  shall keep the attachment.
  *Observed by*: the rendered row, and the attachment row surviving a reload.
- **AC-18 (US-2)**: The system shall present the attached count and the total
  document count on the Agent Context tab.
  *Observed by*: the rendered badge.

**Attaching to a skill**

- **AC-19 (US-3)**: WHEN a user attaches or detaches a document on the Skill
  Context tab, the server shall persist it as a skill attachment with its own
  order index.
  *Observed by*: the persisted attachment row.
- **AC-20 (US-3)**: The system shall present the same document list, the same
  ordering control and the same preview affordance on the Skill Context tab as on
  the Agent Context tab.
  *Observed by*: the rendered rows on both tabs for the same repository.
- **AC-21 (US-3)**: The system shall serialise skill-attached and agent-attached
  documents into the same single `## Project context` block, with the same full
  text, and shall not emit a separate section for skill-attached documents.
  *Observed by*: `prompt_assembly.specs` for a run whose agent and whose linked
  skill each contribute a document.

**Token cost**

- **AC-22 (US-4)**: WHILE a Context tab is open, the client shall display the
  estimated token count of the fully assembled `## Project context` block for the
  current selection, including the untrusted wrappers and the path labels.
  *Observed by*: the rendered footer figure.
- **AC-23 (US-4)**: The system shall compute the token estimate with the
  `cl100k_base` encoding.
  *Observed by*: the estimate returned for a fixed document, compared against a
  reference `cl100k_base` count.
- **AC-24 (US-4)**: IF the encoder is unavailable, THEN the system shall fall
  back to `ceil(characters / 4)` and shall report the estimator used as
  `heuristic`.
  *Observed by*: the `estimator` field in the estimate response.
- **AC-25 (US-4)**: WHEN a document is attached, detached or reordered, the
  system shall recompute and display the estimate within 300 ms at p95 for a
  selection of up to 20 documents.
  *Observed by*: the rendered footer figure, and the measured latency.
- **AC-26 (US-4)**: The client shall present the token figure as an estimate
  rather than an exact count.
  *Observed by*: the rendered footer text.

**Injection at run time**

- **AC-27 (US-5)**: WHEN a review run starts, the server shall build the injected
  document list as the agent's attachments in ascending order index, followed by
  the attachments of each linked skill in `agent_skills.order` and then skill
  order index, keeping only the first occurrence of any repeated path.
  *Observed by*: `specs_read` in the persisted run trace.
- **AC-28 (US-5)**: WHEN a review run starts, the server shall read each injected
  document from the repository clone at its default branch, and shall not read it
  from the pull request's head ref.
  *Observed by*: a pull request that modifies an attached document leaving
  `prompt_assembly.specs` unchanged.
- **AC-29 (US-5)**: The system shall place every injected document inside a single
  `## Project context` section of the user message, each document wrapped in an
  `<untrusted source="…">` block.
  *Observed by*: `prompt_assembly.specs`.
- **AC-30 (US-5)**: The system shall identify each injected document by its
  repo-relative path inside the assembled block.
  *Observed by*: `prompt_assembly.specs` text.
- **AC-31 (US-5)**: IF the injected document list is empty after resolution, THEN
  the assembled user message shall be byte-identical to the message the same run
  would have produced before this feature.
  *Observed by*: `prompt_assembly.user` compared against a recorded pre-feature
  baseline for the same run inputs.
- **AC-32 (US-5)**: IF an attached document is missing, unreadable or outside the
  scanned roots at run time, THEN the server shall omit it, shall record a
  run-log event naming the path and the reason, and shall not fail the run.
  *Observed by*: the persisted run log, and the absence of the path from
  `specs_read`.
- **AC-33 (US-5)**: IF a single document exceeds 32,000 characters, THEN the
  server shall inject its first 32,000 characters followed by `… (truncated)`.
  *Observed by*: `prompt_assembly.specs`.
- **AC-34 (US-5)**: IF the assembled block would exceed 120,000 characters, THEN
  the server shall inject documents in order until the budget is exhausted,
  truncate the document that crosses it, omit the remainder, and record the
  omitted paths in the run log.
  *Observed by*: the persisted run log, and the length of
  `prompt_assembly.specs`.
- **AC-35 (US-5)**: WHEN a run completes, `specs_read` shall list exactly the
  repo-relative paths that were injected, in injection order.
  *Observed by*: the `run_traces` document.
- **AC-36 (US-5)**: WHEN a run starts, the server shall emit a run-log event
  stating how many project-context documents were injected and how many were
  skipped.
  *Observed by*: the persisted run log.
- **AC-37 (US-5)**: IF an injected document contains the literal `</untrusted>`,
  THEN the number of `</untrusted>` closers in the assembled user message shall
  equal the number produced by a benign document of the same length.
  *Observed by*: the closer count of a hostile render compared against a benign
  render.
- **AC-38 (US-5)**: IF an injected document contains a line matching an assembled
  section heading — `## Diff to review`, `## Skills / rules`, `## Relevant
  memory`, `## Repo skeleton` — THEN the number of `<untrusted source="` openers
  in the assembled user message shall be unchanged.
  *Observed by*: the opener count of a hostile render compared against a benign
  render.
- **AC-39 (US-5)**: The system shall remove from an injected path label every
  character outside `[A-Za-z0-9._/-]` before that label appears anywhere in the
  prompt.
  *Observed by*: `prompt_assembly.specs` for a document whose filename contains a
  quotation mark.

**Parity with the CI runner**

*These five criteria are the whole of what this feature did not deliver, and the
reason is the same for all five (verified 2026-08-23).* **No CI dispatch exists
in this repository.** `AgentManifest` — including the `project_context` payload
field this feature added — has no producer and no reader anywhere in
`server/src`; it is contract and schema only, and the runner that would consume
it is bundled outside this tree. AC-41 and AC-42 describe the runner's own
behaviour and nothing here can observe them. AC-40, AC-43 and AC-44 ship their
in-tree half: the resolver, the merge order, the caps, the path sanitising, the
untrusted wrapping, the `.nullish()` payload field that makes an old runner
ignore it, and the byte-identical-when-absent property are all delivered and
tested — but no dispatch exists to produce a CI job payload to compare against a
studio run. `docs/plans/2026-08-22-project-context.md` repeats all five verbatim
under its `## Out of scope`, and this spec agrees with it: they are out of scope
for the delivered feature, not gaps in it. US-7 is therefore the one user story
whose outcome is not yet reachable; the other six are.

- **AC-40 (US-7)**: WHEN the studio server dispatches a CI review job, it shall
  resolve the attachments, read the documents and assemble the
  `## Project context` block by the same merge order, the same source and the
  same caps as a studio run, and shall include the assembled block and the
  ordered list of injected paths in the job payload.
  *Observed by*: the dispatched job payload, compared against
  `prompt_assembly.specs` and `specs_read` of a studio run of the same agent
  against the same pull request.
- **AC-41 (US-7)**: WHERE a CI job payload carries an assembled block, the runner
  shall inject it verbatim as the `## Project context` section and shall populate
  `prompt_assembly.specs` and `specs_read` from the payload.
  *Observed by*: the `run_traces` document for a run whose `config.source` is
  `ci`.
- **AC-42 (US-7)**: The CI runner shall not read project-context documents from
  its own checkout.
  *Observed by*: a pull request that modifies an attached document leaving the CI
  run's `prompt_assembly.specs` identical to the dispatched payload.
- **AC-43 (US-7)**: IF a CI job payload carries no assembled block, THEN the
  runner shall proceed with no project context, its assembled user message shall
  be byte-identical to the message it produced before this feature, and it shall
  not fail the review.
  *Observed by*: the persisted trace of a CI run dispatched without the field,
  compared against a recorded pre-feature baseline.
- **AC-44 (US-7)**: WHERE a CI runner build predates the payload field, the
  system shall complete the review, and the run shall report no project context
  rather than erroring on the unrecognised field.
  *Observed by*: a review completing against a runner build that predates the
  field, and its trace showing `prompt_assembly.specs` null.

**Auditing a completed run**

- **AC-45 (US-6)**: WHERE a run injected at least one project-context document,
  the run-trace drawer shall display a Prompt assembly segment labelled
  `Project context — attached specs (untrusted)`.
  *Observed by*: the rendered segment label.
- **AC-46 (US-6)**: WHEN the user expands that segment, the client shall display
  the full text of the block exactly as sent, including the untrusted wrappers
  and any truncation marker.
  *Observed by*: the rendered text compared against `prompt_assembly.specs`.
- **AC-47 (US-6)**: The run-trace drawer shall list the injected document paths in
  the Configuration card's `Specs read` row.
  *Observed by*: the rendered row.
- **AC-48 (US-6)**: IF a run injected no documents, THEN the Prompt assembly
  section shall not render a project-context segment and the `Specs read` row
  shall render its none state.
  *Observed by*: the absence of the segment label, and the rendered row.

## Edge cases

| Case | Outcome |
|---|---|
| Repository never cloned (`repos.clone_path` is null — the state of every seeded repo, `server/src/db/seed.ts:115`) | Empty list with reason `not_cloned`; dedicated client state — AC-7. Runs inject nothing — AC-32 |
| Cloned repository with zero markdown under the four roots | Empty state naming the scanned roots — AC-8 |
| Exactly one document | No special case; the list, the attach rows and the token footer all render normally |
| More than 500 documents | First 500 by ascending path, omitted count reported — AC-4 |
| A 4 MB markdown file | Listed and attachable; injection truncates at 32,000 characters — AC-33 |
| Combined attachments exceeding the block budget | In-order fill, truncate the crossing document, omit the rest, log it — AC-34 |
| Document deleted from the repository after being attached | Attachment kept and rendered as missing — AC-17; omitted at run time with a log line — AC-32 |
| Document renamed upstream | Indistinguishable from deletion; the old path goes missing and the new one appears unattached — AC-17 |
| Document changed between attach and run | The run reads the current default-branch bytes — AC-28 |
| A pull request that adds or rewrites an attached document | Not read in the studio — AC-28 — and not read in CI, where the runner reads nothing from its checkout — AC-42 |
| Symlink inside the clone pointing at a file outside it | Never followed, never listed — AC-2 |
| Attachment path containing `..`, an absolute path, or a path outside the roots | Rejected with 400, no row created — AC-15 |
| Filename containing a quotation mark or a control character | Sanitised before it reaches the prompt — AC-39 |
| Document containing `</untrusted>` or a forged section heading | Escaped and wrapped; opener and closer counts unchanged — AC-37, AC-38 |
| Document containing raw HTML or a `javascript:` link | Rendered inert in the preview — AC-6 |
| Same document attached to both the agent and one of its skills | Injected once, at its first position — AC-27 |
| Same document attached to two of the agent's skills | Injected once, at its first position — AC-27 |
| Agent with attachments run against a repository that has none of them | Every attachment omitted, run proceeds, log names each — AC-32. **As shipped the naming is bounded**: the skipped line carries a 2,000-character budget and elides the remainder as `+N more` (`server/src/modules/reviews/run-executor.ts:38-53`), because the line is persisted inside the jsonb run trace. At realistic path lengths all 20 attachments fit; only a pathological set elides — `Q-4` |
| Agent with no attachments at all | Prompt byte-identical to the pre-feature prompt — AC-31 |
| Tiktoken BPE ranks fail to load | Heuristic fallback, reported as `heuristic` — AC-24 |
| Twenty-first attachment | Rejected with 409 — AC-16 |
| Re-sync running while the attach list is open | The list refreshes from the clone's current state; attachments are unaffected because they are paths, not row ids — AC-10, AC-12 |
| Which git ref a CI run reads a document from | None — the CI runner reads no documents. The studio server resolves them from its own clone at the default branch and ships the assembled block in the job payload — AC-40, AC-42 |
| A CI runner build that predates the payload field | Ignores the field, completes the review, reports no project context — AC-44 |
| A CI job dispatched by a server build that predates the field | Runner proceeds with none, prompt byte-identical to pre-feature — AC-43 |
| Deep link to a document path that no longer exists | Unreadable-document state naming the path — AC-9 |

## Non-functional requirements

**Performance**

- Document discovery for a clone of up to 500 matching documents shall complete
  within 500 ms at p95, warm.
- Token re-estimation for a selection of up to 20 documents shall complete within
  300 ms at p95 (AC-25).
- Resolving and reading attached documents at run start shall add no more than
  400 ms at p95 to a run that injects 20 documents. This is negligible against
  the multi-second provider call it precedes, and it is paid once per run in the
  studio and once per dispatch in CI.

**Limits**

- 4 scanned roots: `docs/`, `specs/`, `plans/`, `insights/`. The first three are
  the intent module's existing `DOC_ROOTS`
  (`server/src/modules/intent/constants.ts:30`); `insights` is added because the
  design's category tags include it. Extensions narrow to `.md` and `.mdx`; the
  intent module's `.txt` is excluded because it is not markdown and the preview
  has no renderer for it.
- 500 documents listed; 20 attachments per agent and per skill; 32,000 characters
  per injected document; 120,000 characters per assembled block. The block budget
  and the truncation marker `… (truncated)` match the conventions extractor's
  `MAX_TOTAL_FILE_CHARS` and `TRUNCATION_MARKER`
  (`server/src/modules/conventions/constants.ts:11,47`), which is the closer
  precedent for user-selected file content; the intent module's 8,000/20,000
  caps govern documents the system follows automatically and are deliberately
  tighter.
- The caps are applied **once**, server-side, before dispatch, so a CI run and a
  studio run of the same agent are subject to the identical budget (AC-40).

**Cost**

- Attached documents are charged on **every** run of the agent, in the studio and
  in CI alike. A 120,000-character block is roughly 30,000 prompt tokens per run,
  per agent, per pull request. The token estimate exists so this is a decision
  and not a surprise (AC-22).

**Contract and version impact — non-breaking, with one semantic change worth
naming**

- `PromptAssembly.specs` and `RunTrace.specs_read` already exist and are already
  `nullish` / defaulted (`server/src/vendor/shared/contracts/trace.ts:44,88`).
  Nothing is added, renamed or removed there. What changes is that they start
  carrying values where they were unconditionally `null` and `[]`
  (`server/src/modules/reviews/run-executor.ts:304,475`). No consumer breaks —
  `TraceBody.tsx` already branches on both — every existing trace remains valid
  and readable, and no historical run is reinterpreted.
- New Zod contracts for a document, an attachment and a token estimate are
  additive, and must be mirrored to `client/src/vendor/shared/` in the same
  commit.
- New response fields on the agent and skill payloads are additive; `z.object`
  strips unknown keys, and neither payload is `.strict()`.
- New tables for agent and skill attachments are additive. No column is dropped,
  renamed, narrowed or made `NOT NULL` on existing data.
- `reviewer-core` requires **no change**. `ReviewInput.specs` is already optional
  (`reviewer-core/src/review/run.ts:60`), so populating it is not a break for the
  out-of-tree CI runner that bundles the package with `@vercel/ncc`.
- **The CI job payload is the one surface this feature can break outside this
  tree**, and it is the reason the assembled block travels in the payload rather
  than being fetched by the runner: an optional payload field is additive in both
  directions. A new server talking to an old runner is covered by AC-44 — the
  runner ignores the field and reviews as before. An old server talking to a new
  runner is covered by AC-43 — no block, no project context, prompt
  byte-identical. Neither direction requires a coordinated deploy, a new runner
  credential or a new runner filesystem rule.
- The message value at `client/messages/en/runs.json:50` changes from
  `"Project context (dynamic)"` to `"Project context — attached specs
  (untrusted)"`. A translation string, not a contract.
- **The property that makes all of the above safe is AC-31, and AC-43 is the same
  property on the runner side.** `reviewer-core/INSIGHTS.md:17` records the rule:
  a prompt slot ships safely only when an absent value leaves the assembled
  message byte-identical to before the feature, and that must be tested
  explicitly. Any behaviour that attaches documents by default violates it and
  would silently re-baseline every existing agent's reviews.

**Observability**

- The run log shall carry an injected/skipped event mirroring the existing
  `skills: N attached` event shape (`server/src/modules/reviews/run-executor.ts:203-207`),
  including the attached and skipped paths — AC-36, AC-32.
  *Implementation note (2026-08-23)*: the mirrored event shape is not sufficient
  on its own. `RunLogger.logFor` persists only `t`, `kind` and `msg` and drops
  the structured `data` payload (`server/src/platform/run-logger.ts:94-96`), so
  paths carried in `data` reach the live SSE stream and never the persisted
  trace, which is what both criteria are *Observed by*. What ships is therefore
  two events: the counted `project context: N injected, M skipped`, and a second
  `project context skipped: <path> (<reason>)` line whose text carries the names.
  Both are asserted against `run_traces.trace.log`
  (`server/test/reviews-context.it.test.ts:231-233,387-391`).
- Discovery failures shall be reported with a reason the client can render, never
  as an empty list — AC-7, AC-9.

**Accessibility and i18n**

- Every attach row shall be reachable and toggleable by keyboard.
- Reordering shall have a keyboard-operable alternative to dragging.
- The preview surface shall trap focus and close on Escape.
- All user-facing strings go through `next-intl` message files; none are inline.

**Testing**

- A deterministic `e2e/specs/` flow covering attach → run → inspect, continuing
  the numbered sequence after `08-conventions.flow.json`.
- The escaping criteria (AC-37, AC-38) shall be tested by comparing a hostile
  render against a benign one, never by asserting an absolute delimiter count —
  `server/INSIGHTS.md:14` records that the injection guard's own prose contains a
  literal `<untrusted>…</untrusted>`, so an absolute count fails on a safe
  render.

## Inputs and provenance

| Input | Producer | Can it be absent | What absence means to the user |
|---|---|---|---|
| Repository clone directory | The repos module's clone/sync path; recorded in `repos.clone_path` (`server/src/db/schema/repos.ts:16`) | Yes — null for every seeded repository (`server/src/db/seed.ts:115`) | Not-cloned state on the page; empty attach lists; runs inject nothing — AC-7 |
| Document list | Project-context discovery, new; walks the clone under the four roots | Yes — empty when the repository has no matching markdown | Empty state naming the scanned roots — AC-8 |
| Document body | `GitClient.readFile(repo, path)` (`server/src/vendor/shared/adapters.ts:228`) | Yes — deleted, renamed or unreadable since discovery | Preview: unreadable state — AC-9. Run: omitted and logged — AC-32 |
| Attachment set for an agent | The user, through the Agent Context tab | Yes — an agent with none is the default | Prompt byte-identical to pre-feature — AC-31 |
| Attachment set for a skill | The user, through the Skill Context tab | Yes | The skill contributes nothing to the merged list — AC-27 |
| Skill link order | `agent_skills.order` (`server/src/db/schema/agents.ts:51-59`) | No — defaulted to 0 | Ties resolve by skill order index — AC-27 |
| `used_by_agents` count | A reverse lookup over agent and skill attachments | No — zero is a value | The badge reads zero, which is the signal that a document is unused — AC-11 |
| Token estimate | The `Tokenizer` port, `cl100k_base` (`server/src/adapters/tokenizer/index.ts`), whose scope widens beyond repo-intel for this feature | The encoder can fail to initialise | Heuristic fallback, reported as such — AC-24 |
| Assembled block in the CI job payload | The studio server at dispatch, by the same resolution as a studio run | Yes — an older server omits the field | The CI run carries no project context and reviews as before — AC-43 |
| `PromptAssembly.specs` | The studio run executor at run start; in CI, the runner from the payload | Yes — null when nothing resolved | No project-context segment in the drawer — AC-48 |
| `RunTrace.specs_read` | As above, at run completion | Yes — empty array | `Specs read` renders its none state — AC-48 |
| `78 COVERAGE` gauge | No producer exists | Always absent | Not rendered anywhere in this feature — `UX-2` rejected |
| `Indexed: N files · N chunks` footer | No producer exists — `code_chunks` has no writer | Always absent | Not rendered anywhere in this feature — `UX-3` rejected |
| Per-row token estimate | Would require a per-document count | Always absent | Not rendered; the block total is the only token figure — `UX-5` rejected |
| Documents authored inside DevDigest | No producer — authoring is out of scope | Always absent | The page reads the repository and nothing else — `UX-1` rejected |

## Untrusted inputs

Three trust boundaries are crossed by this feature, and the second is the reason
the whole block is delimiter-wrapped.

**1. The attachment path, supplied by the client.**
Allowed: a normalised, repo-relative POSIX path whose first segment is one of the
four scanned roots and whose extension is `.md` or `.mdx`. Forbidden: an absolute
path, any `..` segment, any path resolving outside the clone root, any path
outside the scanned roots. The server rejects anything else with HTTP 400 and
creates no row (AC-15). This is not theoretical: `readClone` at
`server/src/modules/repo-intel/service.ts:876-877` does `join(clonePath, file)`
with no traversal guard today, so a new reader that trusts a client-supplied path
inherits an arbitrary-file-read. Validation is server-side and is re-applied at
run time, not only at attach time (AC-32), because the roots can change under an
attachment that was valid when it was made.

**2. The document content, derived from the repository.**
Every byte is attacker-influenceable: anyone who can land a commit on the default
branch can write the text that instructs the reviewer. It is therefore data, never
instructions, and it inherits the existing defence:
`INJECTION_GUARD` in the system message plus `wrapUntrusted`
(`reviewer-core/src/prompt.ts:16-32`). Three properties must hold and each is a
criterion rather than an assumption:

- A document containing a literal `</untrusted>` adds no closer — AC-37.
  `wrapUntrusted` handles this, but `server/INSIGHTS.md:196` records that
  `renderPrompt`/`renderTemplate` in `server/src/platform/prompts.ts:34` does a
  raw `String.replace` with **no** escaping, so any path that renders document
  text through a template rather than through `wrapUntrusted` is unprotected.
- A document containing a forged section heading (`## Diff to review`,
  `## Skills / rules`, `## Relevant memory`, `## Repo skeleton`) does not open or
  close a section — AC-38.
- A document's path, which becomes a label in the prompt, cannot break out of the
  `source="…"` attribute — AC-39 strips everything outside `[A-Za-z0-9._/-]`.

Because the studio server assembles the block once and ships it (AC-40), these
three properties are established in exactly one place and hold for CI runs
without being re-implemented in the runner — which is the security argument for
that choice, independent of the deployment one.

The block's position stays where `reviewer-core` already puts it, after the
trusted skills and memory sections and before the diff. `reviewer-core/INSIGHTS.md:17`
records that section order is trust order; the existing placement groups
repo-derived untrusted content (`## Repo skeleton`, `## Project context`,
`## Callers of changed symbols`) together ahead of the diff, and this feature does
not move it.

**3. The document content, rendered in the browser.**
Markdown from the repository reaches the DOM in the preview and in the run-trace
drawer. Raw HTML is disabled and link and image schemes are restricted to `http`
and `https` (AC-6), so a document containing `<script>` or a `javascript:` URL is
inert. Path strings rendered in list rows rely on React's JSX escaping and need no
further treatment.

The token estimate is derived from untrusted content but is a number computed
server-side; it crosses no boundary of its own.

## Open questions

**None were outstanding at `approved`.** Every `Q-n` below is resolved and every
`UX-n` is ruled on, which is what allowed the `draft` → `approved` transition.
The record is kept rather than deleted, because the reasoning — including the one
ruling that was reversed — is what a later reader needs. Two further questions,
`Q-3` and `Q-4`, were opened by the **verification** of the built feature on
2026-08-23; they did not exist at `approved` and did not block `implemented`,
and each names its default.

| Question | Resolution | Effect on this spec |
|---|---|---|
| `Q-1` — can a document authored in DevDigest occupy the same path as a repository file, and which one does an agent read | **Lapsed (2026-08-21).** Answered `Reserved root` on 2026-08-20 while `UX-1` stood; the question exists only where an overlay exists, and it ceased to apply when the user rejected `UX-1`. With one document source there is no collision, no precedence rule and no second read path | None. `AC-28` keeps the single default-branch read |
| `Q-2` — how the GitHub/CI runner obtains the attached documents, given it is bundled outside this tree and checks out the pull request | **Answered — Server assembles (2026-08-20).** The studio server resolves the attachments, reads the documents, applies the caps and hands the finished `## Project context` block to the runner in its job payload | `AC-40` – `AC-44`; the CI rows in `## Non-functional requirements`, `## Inputs and provenance` and `## Untrusted inputs` |

| Proposal | Ruling | Effect on this spec |
|---|---|---|
| `UX-1` — new-document, new-folder, upload and the `Preview` / `Edit` toggle as a database overlay over the read-only clone | **Accepted (2026-08-20), then rejected by the user (2026-08-21) on scope.** The overlay carries a second document store, an upload surface and two further trust boundaries, and it is a feature about authoring rather than about attaching. `Q-1: Reserved root` had removed the worst part — with disjoint namespaces there was no merge rule — but the remaining cost was still judged too high for this spec | Authoring is a non-goal; the four controls in the mockup have no behaviour here; `Q-1` lapsed with it |
| `UX-2` — render the `78 COVERAGE` gauge by implementing spec conformance | **Rejected (2026-08-20)** | A gauge with no producer would display a fabricated number. Named as a non-goal; `## Inputs and provenance` records it as never rendered |
| `UX-3` — render the `Indexed: N files · N chunks` footer by writing markdown into `code_chunks` | **Rejected (2026-08-20)** | Nothing writes that table and chunking is an explicit non-goal. Named as a non-goal; `## Inputs and provenance` records it as never rendered |
| `UX-4` — show `Used by N agents` on the Project Context page | **Accepted (2026-08-20)** | Added `AC-11` and its provenance row |
| `UX-5` — show a per-document token estimate on each attach row | **Rejected (2026-08-20)** | The design shows only the footer total and the requirement is satisfied by it. Named as a non-goal; `## Inputs and provenance` records it as never rendered |
| `UX-6` — extend project-context injection to the GitHub/CI runner | **Accepted (2026-08-20)** | Replaced the former "CI injects nothing" criterion with US-7 and `AC-40` – `AC-44`, and added the CI direction analysis to the contract-impact section. Raised `Q-2`, now answered |

**Opened by verification, 2026-08-23 — neither is a defect in the delivered
code, and each is a question about which side of a disagreement should give.**

- `Q-3` — AC-10 asks for "the time of the last successful refresh"; the shipped
  `last_synced_at` is the time of the current walk, because discovery is
  stateless. Should the value be persisted on the repository row so the
  criterion is met in substance and `neverSynced` becomes reachable, or should
  the criterion be amended to say what a stateless walk can honestly report?
  *Default if nobody answers*: the shipped behaviour stands and AC-10's wording
  is the part that is wrong; a superseding spec amends it when a column is added.
- `Q-4` — the edge-case table says a run whose every attachment is missing gets a
  log line that "names each"; the shipped line is budgeted at 2,000 characters
  with a `+N more` tail. Should the line be unbounded, or does the spec accept
  the cap? *Default if nobody answers*: the cap stands — the line is persisted
  inside a jsonb trace document and an unbounded one is an unbounded write — and
  the edge-case row above is the amended wording.

**One ruling in this spec was reversed.** `UX-1` was accepted on 2026-08-20 and
rejected by the user on 2026-08-21; the authoring criteria, the overlay
provenance rows and two trust boundaries were written and then removed. `Q-1`
lapsed as a consequence rather than being answered in force. This paragraph
exists because an earlier revision of this section asserted the opposite, and a
decision record that hides a reversal is worth less than no record at all.
