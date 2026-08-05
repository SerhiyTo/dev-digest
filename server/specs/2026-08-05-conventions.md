# Spec: Conventions extractor (server)

A repo's house rules — how *this* team names things, handles errors, reaches
the database — are the most valuable review context nobody has written down.
This feature reads the repository, asks a model to name the conventions it can
actually **see**, verifies every claim against the file it cites, and lets a
human triage the result into a **skill**. It is the sibling of the skills
feature (`2026-08-04-skills.md`) and the producer of `source: 'extracted'`.

The pipeline is deliberately distrustful: the model proposes, the server
verifies. A convention whose evidence cannot be found in the repo never
reaches the user.

## What the starter already ships

**Behavior:** as with skills, roughly half the infrastructure is present and
unused (`server/CLAUDE.md`: "DB schema contains every table up front").

- DB — the `conventions` table in `0000_init.sql`
  (`src/db/schema/knowledge.ts`), empty, with no readers anywhere.
- Contracts — `ConventionCandidate` in
  `src/vendor/shared/contracts/knowledge.ts`, with **zero** call sites in
  server or client; `SkillType` already includes `'convention'` and
  `SkillSource` already includes `'extracted'`.
- Skills — `skills.evidence_files` (`jsonb`, `$type<string[]>()`), mapped by
  `toSkillDto` to `evidence_files` and **always `null`** today because
  nothing can write it.
- Model registry — `FEATURE_MODELS` entry `conventions`
  (`contracts/platform.ts`), default `openai` / `gpt-5.4`, never resolved.
- File sampling — `RepoIntelService.getConventionSamples(repoId, n)`
  (`src/modules/repo-intel/service.ts`), top-N files by dependency rank with
  tests/configs/migrations filtered out, reachable as `container.repoIntel`.
  Zero call sites.
- The intended two-step LLM dialogue — `MockLLMProvider.structuredBySchema`
  (`src/adapters/mocks.ts`) documents the schema names
  `'ConventionFileSelection'` then `'ConventionExtraction'`. Those two strings
  appear nowhere else in the repo; they are a contract left for this feature.
- Prompt loader — `renderPrompt` (`src/platform/prompts.ts`), zero call sites.
  This feature is its first real consumer.

**Missing:** the `conventions/` module entirely, every route, and any way to
write `skills.evidence_files`.

## Contract changes

**Component:** `src/vendor/shared/contracts/knowledge.ts`, mirrored
byte-identically in the same commit to
`client/src/vendor/shared/contracts/knowledge.ts`.

**Behavior:** the Conventions block is **reshaped**, not extended.
`ConventionCandidate` had zero consumers, so there is no deprecation path to
honour and no reason to carry its original single-evidence shape forward.

- `accepted: boolean` becomes `status: ConventionStatus`
  (`pending | accepted | rejected`). The boolean could not distinguish "not
  triaged yet" from "rejected", which the counter and the re-scan rule both
  need. `status` is a Drizzle `text` enum, not a Postgres enum, so widening
  the set later needs **no** SQL migration — the same reasoning
  `2026-08-04-skills.md` applies to `skills.source`.
- `evidence_path` / `evidence_snippet` become `evidence:
  ConventionEvidence[]` — one to three citations, each from a *different*
  file. One citation proves an instance; three prove a convention.
- `occurrence_files` is a **nullable** count of distinct files matching the
  rule's probe regex. See "Occurrence count" below for why it is nullable and
  not zero.
- `ConventionScanState` carries everything the page header needs about the
  last scan, including its cost and what the grounding gate dropped.
- `ConventionSkillDraft` is the server-generated, fully editable draft the
  Create-skill modal seeds itself from.

```ts
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);

export const ConventionEvidence = z.object({
  path: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  snippet: z.string(),
});

export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  evidence: z.array(ConventionEvidence),
  occurrence_files: z.number().int().nullish(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
});
```

**Honesty requirement, same rule as `SkillStats`:** every nullable field on
`ConventionScanState` and `occurrence_files` must pass `null` through to the
client rather than being coerced to `0`. The UI renders `—` or hides the chip;
a fabricated `0` would read as a measurement that was actually never taken.

The two LLM step schemas (`ConventionFileSelection`, `ConventionExtraction`)
are **internal** to the module and live in `src/modules/conventions/service.ts`.
They describe a model dialogue, not an API surface, and nothing outside the
module may depend on their shape.

## Migration

**Component:** `src/db/schema/knowledge.ts` → `pnpm db:generate` →
`pnpm db:migrate`. Never hand-edit `src/db/migrations/*.sql`.

`conventions` drops `accepted`, `evidence_path`, `evidence_snippet` and gains
`status`, `evidence jsonb`, `occurrence_files`, `skill_id`, `memory_id`,
`created_at`, plus a `conventions_repo_idx` index on `repo_id` — every read is
`WHERE repo_id = $1` and the table has no index today. The three `DROP COLUMN`
statements are safe: the table is empty in every environment and has no
readers.

New table `convention_scans`, modelled on `repo_index_state`: primary key is
`repo_id`, one row per repo kept current by the worker. It holds
`status`, `job_id`, `sampled_files`, `selected_files`, `candidate_count`,
`dropped_count`, `dropped_reasons`, `path_prefix`, `cost_usd`, `tokens_in`,
`tokens_out`, `model`, `degraded_reason`, `error`, `started_at`,
`finished_at`.

**Why a table and not the `jobs` row:** `jobs.payload` is the job's *input*.
The page header needs the scan's *results* — how many files were sampled, what
the gate dropped and why, what it cost — and none of that fits in a job
record.

## Module layout

**Component:** new `src/modules/conventions/`, following `src/modules/skills/`
(onion: `routes.ts → service.ts → repository.ts`, pure logic split out into
its own files).

**Behavior:** `routes.ts` (Zod request schemas, registration, job-handler
registration), `service.ts` (orchestration, the two step schemas, the scan job
handler), `repository.ts` (Drizzle over `conventions` + `convention_scans`),
and four **pure** modules that carry the interesting logic:
`prompt-input.ts` (rendering the model's input and filtering its file
choice), `grounding.ts` (the evidence gate), `merge.ts` (re-scan decision
carry-over), `skill-body.ts` (slug/name/description/markdown generation).
`helpers.ts` holds `toConventionDto` / `toScanStateDto`; `constants.ts` holds
the tunables.

The four pure modules are split out for the same reason `skills/` splits out
`stats.ts` and `diff.ts`: they are algorithms, fully testable with no DB, no
clone and no LLM, and they do not belong in a service whose other methods
mutate rows. They are where nearly all the feature's test coverage lives.

Registered in `src/modules/index.ts`: one import + one entry in `modules`.

## Routes

**Component:** `src/modules/conventions/routes.ts`.
**Behavior:** workspace-scoped through `getContext`; the service returns
`undefined` for a miss and the route throws `NotFoundError` — mirrors
`skills/routes.ts` exactly. Accept/reject are generated from a
`CONVENTION_ACTIONS` const array, the pattern `reviews/routes.ts` uses for
`FINDING_ACTIONS`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/repos/:id/conventions` | `{ state, candidates }` — the single endpoint the page polls |
| `POST` | `/repos/:id/conventions/scan` | Enqueue the scan job; `202 { jobId }`. Optional `path_prefix` narrows the sample |
| `POST` | `/conventions/:id/accept` | `status → 'accepted'` |
| `POST` | `/conventions/:id/reject` | `status → 'rejected'` |
| `PATCH` | `/conventions/:id` | Edit `rule` only |
| `POST` | `/repos/:id/conventions/status` | Bulk set status for the given ids — one round-trip for "Deselect all" |
| `GET` | `/repos/:id/conventions/skill-draft` | `ConventionSkillDraft`; 404 when nothing is accepted |
| `POST` | `/repos/:id/conventions/skill` | Create the skill, or update an existing one when `skill_id` is sent |

`POST /repos/:id/conventions/scan` is rate-limited (5/min). It fans out to two
LLM calls, the same reasoning `POST /pulls/:id/review` uses.

**Why the merge is a conventions route and not `POST /skills`:** the public
skills route accepts a client-supplied `source`. A client that posted the
generated body with `source: 'manual'` would receive an **enabled** skill whose
text is raw model output, defeating the creation gate procedurally. The
conventions route hardcodes `source: 'extracted'` server-side and attaches
`evidence_files` itself, so no request shape can bypass the gate.

## Edit semantics

**Component:** `PATCH /conventions/:id`.
**Behavior:** `rule` is the only editable field. Evidence paths, snippets,
line numbers, `occurrence_files` and `confidence` are **not** editable.

The gate *proved* that the snippet occurs at those lines in that file. The
generated skill body prints `Detected in \`path:lines\`:` as a statement of
fact; letting a user retype the snippet would make that statement a lie, and
there is no cheap way to re-verify it later — the clone may have moved on.
The user still has full freedom at merge time, where the entire body is plain
editable markdown.

Editing a rule does not change its `status`.

## The two-step pipeline

**Component:** `src/modules/conventions/service.ts`, registered as a
`JobRunner` handler of kind `conventions-scan` from within the routes plugin
(the pattern `repo-intel/routes.ts` uses for its index jobs).

**Behavior:**

1. `container.repoIntel.getConventionSamples(repoId, CANDIDATE_FILE_COUNT)`
   gives the candidate pool, narrowed by `path_prefix` when one was sent. An
   empty pool finishes the scan `done` with `degraded_reason: 'not_indexed'`
   and **zero LLM calls**.
2. **Step 1 — `ConventionFileSelection`.** The model sees only the path list
   and picks the most representative files. Cheap, and it means step 2's
   expensive prompt carries files chosen for signal rather than the first N by
   rank.
3. The selection is filtered against the candidate list before use: a path the
   model invented, "corrected" or shortened is discarded. If nothing survives,
   the first `SELECTED_FILE_COUNT` candidates are used instead — a bad answer
   degrades, it does not fail the scan.
4. Each selected file is read with `container.git.readFile`, **each call
   individually wrapped** because it throws `ENOENT`, truncated per file and
   in total. No readable file finishes the scan `done` with
   `degraded_reason: 'no_clone'`.
5. **Step 2 — `ConventionExtraction`.** Files are rendered with a 1-based line
   gutter, which is what makes the model's reported line numbers meaningful
   and the gate's recomputation checkable.
6. Ground, count occurrences, carry over prior decisions, replace the repo's
   rows in one transaction, and record the scan's totals.

Model resolution is `resolveFeatureModel(container, workspaceId,
'conventions')`. The doc comment on `getFeatureModelOverride` names conventions
as a caller with "its own dynamic default", but no such default exists — the
only default is the registry entry, which is precisely the case
`resolveFeatureModel` documents. The stale parenthetical is corrected in the
same commit.

**The scan is a fire-and-forget background task, not a `JobRunner` job.** The
route awaits `beginScan` (which writes the `running` row, so a caller that got a
202 never polls a state older than its own request), then starts `runScan`
without awaiting it and answers immediately.

It was originally a `JobRunner` job, and that was wrong twice over:

- **The 120s handler timeout is global**, with no per-kind override, and it is
  shorter than a legitimate two-call scan. `completeStructured` also runs its own
  schema-repair retry loop, so one call at 45s can take 135s and blow the budget
  by itself. Real scans against a large model timed out every time.
- **The `jobs` row was redundant.** `convention_scans` already carries
  everything the UI reads; the job row duplicated a status nobody queried.

What the runner did give — bounded concurrency and retries — is not wanted here:
a retry re-runs both model calls at full token cost, and the route is already
rate-limited to 5/min with a single upserted row per repo.

**Failures are recorded, never thrown.** `runScan` catches everything and writes
`convention_scans.status = 'failed'` with the message — the same shape
`repo-intel` uses when it returns a degraded index result instead of throwing.
The route adds a `.catch` for the errors `runScan` itself could not record (an
unreachable database, say), which would otherwise leave the row `running`
forever.

**A dead process still orphans a scan**, since the background task dies with it.
The module therefore reaps `running` scans at plugin load, before the server
accepts requests, the way `app.ts` reaps orphaned `agent_runs`.

**Per-call timeouts remain**, not to fit an external budget but so a hung
provider connection cannot pin a scan at `running` indefinitely:
`SELECT_TIMEOUT_MS = 30_000`, `EXTRACT_TIMEOUT_MS = 120_000`,
`STRUCTURED_MAX_RETRIES = 1`.

> The unrelated `JobRunner` hazard this feature uncovered — `enqueue` rethrowing
> into a `done` promise no caller awaits, which killed the API process — was
> fixed in the platform and is covered by `server/test/jobs.it.test.ts`. It no
> longer concerns this module, but it still protects `repos` and `repo-intel`.

## Prompts

**Component:** `src/prompts/conventions.select.md` and
`src/prompts/conventions.extract.md`, loaded through `renderPrompt`.

**Behavior:** per `docs/agent-prompts/README.md`, **neither template describes
the output schema**. Structure is enforced out-of-band by `completeStructured`;
field *meaning* lives only in the Zod `.describe()` calls. The templates carry
judgment (what counts as a house rule, what makes a file representative) and
the evidence discipline the gate enforces: copy paths verbatim from the list,
copy snippets character for character including indentation, never elide with
`…`, report line numbers from the printed gutter, and no rule quota.

Repository content is wrapped in `<untrusted source="…">`. Repo source is
input, not instruction.

> `platform/prompts.ts` resolves templates relative to the module, i.e.
> `dist/prompts` in a compiled build. A production build must copy
> `src/prompts` → `dist/prompts`; `tsx` in dev needs no copy.

## Grounding gate

**Component:** `src/modules/conventions/grounding.ts` — pure, no I/O.
`groundConventions(raw, files) => { kept, dropped }`.

**Behavior:** a convention survives only if the repository agrees with it.

- The rule text must be within `[MIN_RULE_CHARS, MAX_RULE_CHARS]`.
- Each evidence entry's path must be one of the files actually read.
- **Each snippet must occur in that file.** The comparison is on normalised
  lines (trimmed, inner whitespace collapsed, blanks dropped), searching for
  the snippet's line sequence as a contiguous window. Exact string matching
  would drop honest citations the model merely re-indented; normalisation
  tolerates formatting drift without tolerating invention.
- **The matched window's real line numbers replace the model's.** This is
  stronger than dropping on mismatch: it guarantees that the `path:lines`
  printed in the skill body is always true, whatever the model reported.
- Evidence entries fail individually; a rule left with zero verified entries
  is dropped whole.
- `confidence` is clamped to `[0,1]`; rules with the same normalised text are
  deduplicated, keeping the higher-confidence one.

Every drop carries a reason, and the service rolls the reasons into
`dropped_reasons` so the page can say *"5 candidates · 2 dropped"* and name the
cause. A gate whose work is invisible looks like a model that found less.

**Why here and not in `reviewer-core`:** that package is the pure *review*
engine and a shared dependency of the CI runner, which will never hold a
`ConventionCandidate`. Putting the gate there would widen its public API for a
caller that does not exist. What this module copies is the *shape* of
`reviewer-core/src/grounding.ts` — a pure function returning kept and dropped
sets — not its location.

## Occurrence count

**Component:** `service.ts`, after grounding.
**Behavior:** the extraction step asks for an optional `probe` — a regex
matching a line that follows the rule. When present, the server runs it through
`container.codeIndex.grep` (ripgrep) and sets `occurrence_files` to the number
of distinct matching files.

`occurrence_files` is **null** whenever the probe is absent, invalid, times
out, or matches nothing — never `0`. Null means "not measured" and hides the
chip; `0` would claim the convention was measured and found nowhere, which is
a different and unsupported statement. The verified `evidence` array remains
the hard signal; the probe count is a soft one, and it is the model's regex,
so it is length-capped and its failures are swallowed.

## Re-scan semantics

**Component:** `src/modules/conventions/merge.ts` — pure.
**Behavior:** a re-scan replaces the repo's rows, but any incoming rule whose
normalised text matches an existing row inherits that row's `status`.

Re-scan is a first-class button on the page. Resetting a user's accept/reject
decisions every time they pressed it would make the feature hostile to the
work it just asked them to do. A rule the user hand-edited will usually no
longer match and comes back `pending` — acceptable, and the reason edits are
best made at merge time.

## Merge to skill

**Component:** `src/modules/conventions/skill-body.ts` — pure — and the two
merge routes.

**Behavior:** the draft is generated server-side so that the preview the user
edits and the body that is saved come from one function and cannot disagree.

- Name: `<repo-name>-conventions`. Description: the count and the source repo.
- Body: an `# <name>` heading, one intro paragraph, then a `## <rule-slug>`
  section per accepted convention carrying the rule text and its citations as
  `Detected in \`path:lines\`:` followed by a fenced snippet. Section slugs are
  kebab-cased from the rule and de-duplicated. Fences escalate past any
  backtick run inside the snippet.
- `evidence_files` is the unique path list in section order — the first thing
  ever to write `skills.evidence_files`.

`POST /repos/:id/conventions/skill` takes the **edited** draft back, calls
`SkillsService.create({ source: 'extracted' })` — which forces
`enabled: false` — and stamps `skill_id` onto the merged rows.

**Update instead of duplicate.** `GET .../skill-draft` looks for an existing
`source: 'extracted'`, `type: 'convention'` skill whose name equals the slug.
When one exists the draft carries `existing_skill` and a `body_patch` computed
with the skills module's own `skillBodyPatch`, and the merge route routes to
`SkillsService.update()` instead — which already bumps `version` and snapshots
into `skill_versions`. Without this, every re-scan would leave another
near-identical skill behind. `enabled` is left untouched on update: re-merging
must not silently re-arm a skill the user deliberately disabled, nor disarm one
they vetted and enabled.

**Write-through to `memory`.** Each merged convention is also upserted into the
`memory` table (`scope: 'repo'`, `kind: 'convention'`, the rule as `content`,
the evidence paths as `sources`), embedded through `container.embedder()` when
a key is configured and with a null embedding when it is not. The id is kept in
`conventions.memory_id` so a re-merge replaces rather than accumulates. A
failure here never rolls back the skill.

> **This is forward-looking, not active.** Nothing reads the `memory` table
> today: `run-executor.ts` passes `memory: null` and `memory_pulled: []` into
> `reviewPullRequest`, even though `ReviewInput` accepts a `memory` slot. The
> write-through changes no review behaviour until a later lesson wires
> retrieval. It is recorded here so the next author does not mistake it for a
> live path.

## `evidence_files` passthrough

**Component:** `src/modules/skills/repository.ts` and
`src/modules/skills/service.ts` — the only edits this feature makes outside
its own module.

**Behavior:** `InsertSkill` and `CreateSkillInput` gain an optional
`evidenceFiles` / `evidence_files`. The creation gate line is unchanged, and
`POST /skills`'s route body is deliberately **not** extended: the column is
server-populated evidence, not client input.

## Server tests

**Component:** `server/test/`.
**Behavior:**

- `conventions-grounding.test.ts` — pure: a snippet the model re-indented is
  kept and its line numbers are recomputed from the file; a fabricated snippet
  and an invented path are dropped with their reasons; one bad entry does not
  take down a rule that has another good one; rules with zero surviving
  entries are dropped; duplicates collapse to the higher confidence.
- `conventions-prompt.test.ts` — pure: the gutter renders 1-based and stays
  correct after truncation; `filterSelection` drops invented paths, dedupes,
  clamps, and falls back to the head of the candidate list when the model's
  answer is unusable.
- `conventions-skill-body.test.ts` — pure: section slugs collide safely, the
  fence escalates past a triple-backtick snippet, multiple citations render,
  `evidence_files` is unique and ordered.
- `conventions-merge.test.ts` — pure: an unchanged rule keeps `accepted`, a
  rejected rule stays rejected, a new rule arrives `pending`.
- `conventions.it.test.ts` — integration: the scan makes exactly two
  `completeStructured` calls with schema names `ConventionFileSelection` then
  `ConventionExtraction`, and the second prompt contains only the selected
  paths; an unindexed repo finishes `done` with zero LLM calls; accept /
  reject / edit round-trip and a foreign-workspace id 404s; `skill-draft` 404s
  with nothing accepted; the merge lands `source: 'extracted'`,
  `enabled: false` **even when the request asks otherwise**, populated
  `evidence_files`, `version: 1` and a v1 snapshot; a second merge reports
  `existing_skill` and lands `version: 2`; a re-scan preserves an accepted
  rule's status.
- `routes-smoke.test.ts` — the new routes appear in the route registry.

## Out of scope

Triage ergonomics — categories, "Accept all", confidence filtering, keyboard
navigation — are deliberately not built; the page ships with per-card
accept/reject and a bulk deselect only. Scheduled/automatic re-scanning is not
built: a scan costs money and stays user-initiated. Memory *retrieval* belongs
to a later lesson (see the write-through note above).
