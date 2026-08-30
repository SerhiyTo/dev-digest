# How to operate and debug Project Context

Practical steps for the three questions this feature actually raises: *why does
the page show nothing*, *what did a run really send*, and *how do I inspect the
attachments*. The reasoning behind the design is in
`specs/2026-08-23-project-context.md`; this page is the checklist.

## Get the demo repository to show documents

```sh
docker compose up -d          # from the repo root — Postgres only
cd server && pnpm db:migrate && pnpm db:seed
```

`pnpm db:seed` writes a fixture clone for `acme/payments-api` under
`<cloneDir>/acme/payments-api` with four markdown documents, and points
`repos.clone_path` at it. It is idempotent — re-run it freely. Then open
`http://localhost:3000/repos/<repoId>/context`, or press `g d` in the studio.

`<cloneDir>` is `DEVDIGEST_CLONE_DIR` if set, otherwise
`~/.devdigest/workspace`. A **relative** `DEVDIGEST_CLONE_DIR` is resolved
against the process's working directory (`src/platform/config.ts:66-68`), so
start the API from the same directory that cloned the repositories.

## The page says something unexpected

| What you see | What it means | What to check |
|---|---|---|
| *"{repo} isn't cloned yet"* | `repos.clone_path` is `NULL` | re-import or resync the repository so the clone job runs |
| *"No project documents found"* | the clone was walked and matched nothing | the checklist below |
| a document count lower than the files on disk | some paths failed the guard, or the cap fired | the checklist below; a `… beyond the discovery cap` note appears in the subtitle when 500 is exceeded |
| *"Couldn't read \<path\>"* + "resync to refresh the list" | the file is gone from the clone | resync; the walk is live, nothing is cached |
| *"Couldn't read \<path\>"* **without** resync advice | the file is listed but unreadable | file permissions or a non-UTF-8 encoding in the repository |

**Checklist for "no documents found"** — a file is discovered only if *all* of
these hold (`src/adapters/clonedocs/index.ts`, `src/modules/context/paths.ts`):

1. it sits under a **top-level** `docs/`, `specs/`, `plans/` or `insights/`
   directory of the clone — matched case-insensitively, and nested one level
   deep at minimum (`docs/x.md`, not `docs.md`);
2. its extension is `.md` or `.mdx`;
3. no path segment is a symlink — symlinked files **and** symlinked directories
   are skipped outright, never followed;
4. no ancestor directory is `node_modules`, `dist`, `build`, `coverage`,
   `.next`, `out`, `vendor` or `.git`;
5. it is within 10 directory levels of the clone root, and within the walk's
   20,000-entry budget;
6. the path contains no backslash, NUL byte, percent-encoding, `..` segment or
   URL scheme.

Confirm what the server sees, without the UI:

```sh
curl -s localhost:3001/repos/<repoId>/context | jq '{n: (.documents|length), omitted, reason}'
curl -s 'localhost:3001/repos/<repoId>/context/file?path=specs/idempotency-keys.md' | jq '.truncated'
curl -s -X POST localhost:3001/repos/<repoId>/context/resync | jq '.last_synced_at'
```

A `400` from the `file` route means the path itself was rejected (rule 1, 2 or
6). A `404` means the path was accepted and the read failed — the `error` code
distinguishes `not_found` from `document_unreadable` and `not_cloned`.

## Find out what a run actually injected

Three places, in increasing detail:

1. **The run-trace drawer** — open the PR, open the run, read the `Specs read`
   row (the injected paths, in injection order) and expand the
   `Project context — attached specs (untrusted)` prompt segment for the literal
   text as sent.
2. **The persisted run log** in the same drawer — one line
   `project context: N injected, M skipped`, and when anything was dropped a
   second line `project context skipped: <path> (<reason>); …`. Reasons are
   `invalid_path`, `unreadable`, `empty` and `block_budget`.
3. **The API**, for scripting:

```sh
curl -s localhost:3001/runs/<runId>/trace | jq '{specs_read, specs: .prompt_assembly.specs}'
```

**If a document is attached but not in `specs_read`**, work down this list:

- the run's repository has no clone → every attachment is skipped as
  `unreadable` and a `warn` is logged with the repo name;
- the file is missing from *that* repository's clone — attachments are paths,
  not links to a repository, so the same agent on another repo resolves them
  against that repo;
- the body is empty after trimming → skipped as `empty` **on purpose**; an empty
  entry would render a heading with nothing under it;
- earlier documents used up the 120,000-character block budget → skipped as
  `block_budget`; reorder so the important documents come first;
- it is attached **only** through a skill that is **disabled** → not injected,
  and the trace reports the skill as skipped;
- more than 20 documents resolve → only the first 20 in merge order are used.

A document longer than 32,000 characters is **not** skipped: it is injected
truncated, ending in `… (truncated)`.

## Inspect the attachments directly

```sql
-- what one agent will inject, in order
SELECT path, "order" FROM agent_docs WHERE agent_id = '<uuid>' ORDER BY "order", path;

-- everything an agent reaches, including through its enabled skills
SELECT a.name, d.path, 'direct' AS via FROM agent_docs d
  JOIN agents a ON a.id = d.agent_id
UNION ALL
SELECT a.name, sd.path, s.name FROM skill_docs sd
  JOIN skills s ON s.id = sd.skill_id
  JOIN agent_skills xs ON xs.skill_id = sd.skill_id
  JOIN agents a ON a.id = xs.agent_id
 WHERE s.enabled;
```

Only a path and an order index are stored — **never a document body**. Editing a
file in the repository changes the next run with no write here. Detaching is the
same `PUT` as attaching: send the whole ordered list.

```sh
curl -s -X PUT localhost:3001/agents/<agentId>/context \
  -H 'content-type: application/json' \
  -d '{"paths":["specs/idempotency-keys.md","docs/architecture.md"]}' | jq
```

A `409` is the 20-document limit. A `400` is a path that is not a project
document path. A `422` is a malformed body — the request schema, not the rule.

## Check the token cost before running

```sh
curl -s -X POST localhost:3001/repos/<repoId>/context/estimate \
  -H 'content-type: application/json' \
  -d '{"paths":["specs/idempotency-keys.md"]}' | jq
# → { "tokens": 412, "estimator": "cl100k_base" }
```

`estimator` is `heuristic` when the `cl100k_base` encoder failed to load, in
which case the count is `ceil(chars/4)` and the flag stays `heuristic` for the
life of the process. Treat the number as an estimate either way — it prices the
assembled block (merged, deduplicated, path-labelled, truncated), which is what
a run actually sends, but not the tokenizer of every provider.

## Run the tests for this area

```sh
cd server
pnpm exec vitest run test/context-paths.test.ts test/context-discovery.test.ts \
  test/context-assemble.test.ts test/context-prompt-section.test.ts \
  test/context-estimate.test.ts test/context-service.test.ts     # no Docker

pnpm exec vitest run test/context.it.test.ts test/reviews-context.it.test.ts \
  --no-file-parallelism                                          # Docker required
```

`--no-file-parallelism` is not optional advice: without it the Docker probe can
lose a race and skip a whole file while the lane still exits 0. See root
`TESTING.md`.
