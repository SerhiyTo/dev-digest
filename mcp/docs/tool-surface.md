# Tool surface

Reference for the five tools `mcp/src/tools/registry.ts` registers, in
`TOOL_ORDER` (`mcp/src/constants.ts`). Descriptions, input schemas and
example payloads below are taken from the source, not retyped from memory —
each is cited. For the *why* behind these shapes see
[`../specs/2026-08-14-devdigest-mcp.md`](../specs/2026-08-14-devdigest-mcp.md).

Every response is a single compact-JSON `text` block through `capPayload()`
(`mcp/src/format/compact.ts`), capped at `MAX_PAYLOAD_CHARS` = 6000 chars. No
tool declares `outputSchema`.

## 1 · `list_agents`

**Component:** `mcp/src/tools/list-agents.ts`.

**Description** (158 chars):
> List the DevDigest reviewer agents configured in this workspace, with the
> model each one uses. Call this first: run_agent_on_pr takes an agent name
> from here.

**Inputs:** none (`inputSchema: {}`).

**API calls:** `GET /agents`.

**Example:**
```json
{"agents":[{"name":"General Reviewer","model":"claude-sonnet-5","enabled":true,"description":"Broad correctness and maintainability pass"}]}
```
`description` is truncated to 80 chars (`AGENT_DESCRIPTION_MAX_CHARS`); the
API's `provider`, `id`, `version`, `system_prompt`, `strategy`, `ci_fail_on`,
`repo_intel`, `output_schema` fields are dropped.

## 2 · `run_agent_on_pr`

**Component:** `mcp/src/tools/run-agent-on-pr.ts`.

**Description** (204 chars):
> Run one DevDigest reviewer agent on one pull request and return its
> findings. Does the whole job: starts the run, waits for it, returns
> {verdict, score, findings}. There is no separate start or poll call.

**Inputs:**

| field | zod | required | default | `.describe()` |
|---|---|---|---|---|
| `repo` | `z.string()` | yes | — | `owner/name, or just the repository name` |
| `pr` | `z.number().int().positive()` | yes | — | `GitHub pull request number` |
| `agent` | `z.string()` | yes | — | `reviewer agent name, exactly as list_agents returns it` |
| `min_severity` | `Severity.optional()` (`CRITICAL \| WARNING \| SUGGESTION`) | no | no filter | `return only findings at or above this severity` |
| `limit` | `z.number().int().min(1).max(50).optional()` | no | `20` | `max findings to return; default 20` |

**API calls:** `GET /repos` · `GET /repos/:id/pulls` · `GET /agents` (all
through the resolver's TTL cache) → `POST /pulls/:prId/review {agentId}` →
polling loop over `GET /pulls/:prId/runs` (`waitForRun()`,
`mcp/src/review/wait.ts`) → on `done`, `GET /pulls/:prId/reviews` filtered by
`run_id`.

**Example — happy path:**
```json
{"verdict":"request_changes","score":38,"run_id":"9f1c2b7e-…","findings":[{"severity":"CRITICAL","file":"server/src/modules/reviews/service.ts","line":135,"title":"Background review crash is only logged, never surfaced","fix":"record the failure on the agent_runs row so the UI stops polling"}]}
```

**Example — wait budget exhausted** (`isError: false`, `waitBudgetExceeded()`
in `mcp/src/format/errors.ts`):
```json
{"status":"running","waited_s":180,"next":"call get_findings(repo=\"acme/api\", pr=42, run_id=\"9f1c2b7e-…\") in about a minute"}
```

## 3 · `get_findings`

**Component:** `mcp/src/tools/get-findings.ts`.

**Description** (221 chars):
> Return the findings of a review that already finished on this pull request.
> Pass run_id for a specific run; omit it for the most recent finished one.
> Not needed right after run_agent_on_pr, which already returns findings.

**Inputs:**

| field | zod | required | default | `.describe()` |
|---|---|---|---|---|
| `repo` | `z.string()` | yes | — | `owner/name, or just the repository name` |
| `pr` | `z.number().int().positive()` | yes | — | `GitHub pull request number` |
| `run_id` | `z.string().optional()` | no | newest finished run | `a specific run; omit for the newest finished run on this PR` |
| `min_severity` | `Severity.optional()` | no | no filter | `return only findings at or above this severity` |
| `limit` | `z.number().int().min(1).max(50).optional()` | no | `20` | `max findings to return; default 20` |

`repo` and `pr` are required because `GET /runs/:id/findings` does not exist
in the API — the tool composes `GET /pulls/:id/runs` with
`GET /pulls/:id/reviews`, both PR-scoped. This also makes `get_findings`
usable on its own, without a prior `run_agent_on_pr` call in the same
session.

**API calls:** `GET /repos` · `GET /repos/:id/pulls` (cached, for ref
resolution) → `GET /pulls/:id/runs` → `GET /pulls/:id/reviews`.

**Example:**
```json
{"verdict":"request_changes","score":38,"run_id":"9f1c2b7e-…","agent":"Security","findings":[{"severity":"CRITICAL","file":"server/src/modules/reviews/service.ts","line":135,"title":"Background review crash is only logged, never surfaced","fix":"record the failure on the agent_runs row so the UI stops polling"}]}
```
Same finding shape as `run_agent_on_pr`, plus `agent` so the caller knows
whose findings these are (`get-findings.ts:79`).

## 4 · `get_conventions`

**Component:** `mcp/src/tools/get-conventions.ts`.

**Description** (175 chars):
> Return the coding conventions DevDigest extracted from a repository, each
> with its confidence and the files that evidence it. Read-only: it never
> starts a new extraction scan.

**Inputs:**

| field | zod | required | default | `.describe()` |
|---|---|---|---|---|
| `repo` | `z.string()` | yes | — | `owner/name, or just the repository name` |
| `limit` | `z.number().int().min(1).max(50).optional()` | no | `20` | `max findings to return; default 20` |

**API calls:** `GET /repos` (cached, for ref resolution) →
`GET /repos/:id/conventions`. `POST /repos/:id/conventions/scan` is
deliberately never called — a scan spends LLM tokens, and a read tool has no
license to start paid work behind the model's back.

**Example:**
```json
{"status":"done","scanned_at":"2026-08-11T09:12:03Z","conventions":[{"rule":"Relative ESM imports carry the .js suffix","confidence":0.94,"status":"accepted","occurrence_files":230,"evidence":["server/src/app.ts:12-14"]}]}
```
When `state.status === 'never'` the payload carries a `hint` naming the
manual next step (open the repo page in the DevDigest UI and scan) instead of
leaving the model to guess (`get-conventions.ts:33-39`).

## 5 · `get_blast_radius`

**Component:** `mcp/src/tools/get-blast-radius.ts`.

**Description** (214 chars):
> Blast radius of a pull request: the symbols it changes, who calls them, and
> which HTTP endpoints and cron jobs those callers own. Read-only. Returns a
> degraded best-effort result when the repository is not indexed.

**Inputs:**

| field | zod | required | `.describe()` |
|---|---|---|---|
| `repo` | `z.string()` | yes | `owner/name, or just the repository name` |
| `pr` | `z.number().int().positive()` | yes | `GitHub pull request number` |

**API calls:** `GET /repos` (cached, for ref resolution) →
`GET /repos/:id/pulls` (cached, for ref resolution) →
`GET /pulls/:id/blast-radius`. This tool now pays the same resolve cost
`run_agent_on_pr` and `get_findings` already pay — `GET /repos/:id/pulls` is
also the GitHub import path (`server/src/modules/pulls/routes.ts:31`), and the
resolver's TTL cache (`src/resolve/cache.ts`) dedupes it within a session. See
the amendment in
[`specs/2026-08-14-devdigest-mcp.md`](../specs/2026-08-14-devdigest-mcp.md)
for why this is a deliberate reversal of the original no-API-calls stub.

**Example:**
```json
{"repo":"acme/payments-api","pr":482,"summary":"5 changed symbols, 6 callers across 4 files, 3 endpoints, 1 cron job.","changed_symbols":[{"name":"rateLimit","file":"src/middleware/ratelimit.ts","kind":"function"}],"downstream":[{"symbol":"rateLimit","callers":[{"name":"registerRoutes","file":"src/api/public/index.ts","line":23}],"endpoints_affected":["GET /api/public/items"],"crons_affected":["reset-rate-buckets"]}],"endpoints_affected":["GET /api/public/health","GET /api/public/items","POST /api/public/webhooks"],"crons_affected":["reset-rate-buckets"],"history":[{"pr_number":415,"title":"Tune rate limit buckets","merged_at":"2026-07-04T16:30:00.000Z","author":"diego.reyes","files_overlap":["src/config.ts","src/middleware/ratelimit.ts"],"notes":"merged"}],"truncated":false,"degraded":false,"reason":""}
```
The server's `BlastRadiusResponse` is parsed through the local
`BlastRadiusResult` (`mcp/src/blast/contract.ts`,
`BlastRadius.extend({degraded, reason})`), which zod trims down to
`changed_symbols`/`downstream`/`summary`/`degraded`/`reason`; the tool merges
`repo`/`pr`/`endpoints_affected`/`crons_affected`/`history`/`truncated` back
in from the raw row before `toBlastPayload` pre-caps it (10 symbols, 5
callers per symbol) and `capPayload` applies its size backstop.

## Discrepancy against the plan

The Development Plan's "Поверхня інструментів" section shows the
`run_agent_on_pr` wait-budget-exceeded example with a top-level `run_id`
field and a `"the review is still running; …"` prefix. The plan's own error
taxonomy table (row 8) and the actual `waitBudgetExceeded()` implementation
(`mcp/src/format/errors.ts:94-107`) agree with each other and both omit that
field and prefix — `run_id` appears only inside the `next` string. The
example above follows the source, which is what the tool actually returns.

`mcp/src/format/errors.ts` also exports `unknownRunId()` — used by
`get_findings` when a caller passes a `run_id` that doesn't match any run on
the PR — which is not listed in the plan's 13-row error taxonomy table. It
follows the same shape as the other lookup-miss errors:
`No repository matches…`-style prose naming the known run ids, capped to 10.
