# Spec: `@devdigest/mcp` — local stdio MCP server

DevDigest can import a PR, run a reviewer agent on it, and extract a repo's
conventions — but only through the studio at `:3000`. This module is a thin
adapter that puts the same capability inside Claude Code: five tools, backed
entirely by HTTP calls to the running `server/`. It carries no domain logic
of its own — every fact it returns, the API already computed.

This is the first half of the course roadmap's L04
(`README.md:85` — "`devdigest-mcp` server · Blast Radius"). Blast radius ships
as a **declared stub** so the tool surface is final now; the follow-up lesson
changes the body of one function, not the surface.

## Four tool-design principles

Each principle has one file where it can be checked.

### 1 · Outcome, not operation

**Component:** `mcp/src/tools/run-agent-on-pr.ts`.

**Behavior:** `run_agent_on_pr` performs all three steps of a review in one
call: `POST /pulls/:id/review` → `waitForRun()` (`mcp/src/review/wait.ts`) →
a composition of `GET /pulls/:id/runs` + `GET /pulls/:id/reviews`. The happy
path returns `{verdict, score, findings}`. A bare `run_id` is **only** a
fallback for when the wait budget is exhausted, and even then the message
carries the exact next call to make.

### 2 · Flat arguments

**Component:** every `inputSchema` in `mcp/src/tools/*.ts`.

**Behavior:** each input schema is a flat `ZodRawShape` of primitives —
`repo: string`, `pr: number`, `agent: string`, `run_id?: string`,
`min_severity?: enum(3)`, `limit?: number`. No nested objects, no packed
`"owner/repo#42"` string. The cost of flatness is a resolver
(`mcp/src/resolve/refs.ts`) that turns those primitives into the uuids the
API actually wants. That cost is paid by the server, not by the model.

### 3 · Compact structured response

**Component:** `mcp/src/format/compact.ts`.

**Behavior:** one `text` block of un-indented `JSON.stringify`. A finding is
projected onto five fields — `severity, file, line, title, fix` — dropping
`id`, `category`, `confidence`, `rationale`, `kind`, `evidence`, `review_id`,
`accepted_at`, `dismissed_at`. Every tool's response passes through the same
`capPayload()`, a hard cap of 6000 characters. **No `outputSchema`** (it would
cost context with no consumer) and no `structuredContent`.

### 4 · An error leads somewhere

**Component:** `mcp/src/format/errors.ts`.

**Behavior:** one module owns the whole taxonomy. Every message ends with the
*next call* or the *next action*, never a bare status. Non-terminal states —
`running`, `failed`, wait budget exhausted — return `isError: false`, because
`isError: true` reads to the model as "this path is dead." See
[`../docs/tool-surface.md`](../docs/tool-surface.md#discrepancy-against-the-plan)
for the one function (`unknownRunId`) this module has that the plan's
original taxonomy table omitted.

## Why `run_agent_on_pr` owns the waiting

**Component:** `mcp/src/review/wait.ts`, called from
`mcp/src/tools/run-agent-on-pr.ts`.

**Behavior:** `POST /pulls/:id/review` is fire-and-forget by design —
`ReviewService.runReview` creates the `agent_runs` rows, starts execution
without awaiting it, and returns immediately with `reviews: []`
(`server/src/modules/reviews/service.ts:131-137`). A tool that returned right
after that call would hand the model an empty findings array and a run id it
has no use for without a second tool call. Principle 1 requires the outcome,
so the wait has to live somewhere — and the API is the wrong place for it,
since `POST /pulls/:id/review`'s whole contract is "started, not finished."
The tool owns the wait instead: it polls `GET /pulls/:id/runs` until the run
is `done`/`failed`/`cancelled` or the budget runs out, then composes the
final answer itself.

## SSE vs. polling

**Component:** `mcp/src/review/wait.ts`.

**Behavior:** polling was chosen over consuming `GET /runs/:id/events`
(SSE), for four reasons:

1. **No terminal event in the contract.** `RunEventKind` is
   `info | tool | result | error`
   (`server/src/vendor/shared/contracts/trace.ts:9`); completion is signalled
   by the stream *closing*
   (`server/src/modules/reviews/routes.ts:46-88`) — "the stream ended" is
   indistinguishable from "the connection dropped."
2. **The replay buffer is in-process memory** (`container.runBus`). An API
   restart mid-run destroys it **and** flips the row to `failed`
   (`server/src/app.ts:81`). Polling `GET /pulls/:id/runs` observes that
   transition immediately; an SSE consumer sees silence.
3. **Node has no built-in `EventSource`** — consuming the stream would mean
   hand-parsing lines out of a `fetch` stream, or pulling in a dependency for
   it.
4. **Polling reads the authoritative record.** `RunSummary`
   (`server/src/vendor/shared/contracts/trace.ts:97`) carries `status`,
   `error`, `score`, `findings_count` — exactly what the tool answers with.

**Parameters:** endpoint `GET /pulls/:id/runs`, matched by `run_id` — a cheap
DB read, no GitHub call, no rate limit. Interval `2000ms` for the first 15
polls (~30s), then `5000ms` (`POLL_FAST_MS`, `POLL_SLOW_MS`,
`POLL_FAST_COUNT` in `mcp/src/constants.ts`) — roughly 45 requests across the
full budget. Budget `180_000ms`, a `Config` field
(`mcp/src/config.ts`), not a tool input. One MCP progress notification per
poll. These reset the client's **idle** timeout
(`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, 30 min for stdio servers) — not the
wall-clock `MCP_TOOL_TIMEOUT`, which progress does not extend. At a 180s
budget both windows are far away, so the notifications are not what keeps the
call alive; their real value is that the user sees the review progressing
instead of a silent stall. They would matter for timeout survival only if the
budget ever grew past the idle window. `extra.signal` is checked before every poll and passed
into `fetch`. `waitForRun()` takes `{pollRuns, sleep, now, onProgress,
signal}` as injected dependencies so `mcp/test/wait.test.ts` can run it
against a fake clock at zero real time.

## Why the blast-radius stub makes no API calls

**Component:** `mcp/src/tools/get-blast-radius.ts`.

**Behavior:** the handler never calls `ctx.resolver` or `ctx.api`. Resolving
even the `pr` argument would call `GET /repos/:id/pulls` to look it up, and
that endpoint is also the GitHub import path
(`server/src/modules/pulls/routes.ts:31`) — it upserts and can trigger a
sync. A tool that is a declared no-op has no license to spend that cost for
an answer it always returns as empty. `repo` and `pr` are echoed back
unresolved so the model can see what it asked, and the response is built
directly from `BlastRadiusResult.parse()`.

## Why the extended shape is local, not in `vendor/shared`

**Component:** `mcp/src/blast/contract.ts`.

**Behavior:** `BlastRadiusResult = BlastRadius.extend({degraded, reason})`,
defined in this package, not in `server/src/vendor/shared`. `BlastRadius`
(`server/src/vendor/shared/contracts/brief.ts:88`) already exists as a
contract with real consumers; adding `degraded`/`reason` to it there would be
a shared-contract change requiring the byte-identical mirror in
`client/src/vendor/shared` this repo's vendoring convention demands. Neither
field means anything to the client today — they exist purely so this stub can
say "I did not compute this" without inventing a sentinel inside
`changed_symbols`/`downstream`/`summary`. Extending locally keeps the change
additive with **zero** contract diff and no client sync. Note
`BlastRadiusResult.parse()` strips the `repo`/`pr` fields the tool later
echoes back — `.extend()` inherits zod's default strip-unknown-keys mode from
the base object schema, so the tool re-attaches them after parsing rather
than before.

## Token-budget targets and measured numbers

**Component:** `mcp/test/token-budget.test.ts`.

**Behavior:** Claude Code defers MCP tool schemas by default
(`.claude/settings.json`'s `ENABLE_TOOL_SEARCH: true`); only tool names and
server `instructions` stay resident for the session. Targets and what is
actually measured:

| Target | Budget | Measured |
|---|---|---|
| `INSTRUCTIONS.length` | < 2048 chars (Claude Code's truncation point) | **1278** chars |
| Per-tool description | ≤ 320 chars (`MAX_DESCRIPTION_CHARS`) | 158 / 204 / 221 / 175 / 180 |
| Serialized `tools/list` response | < 3500 chars | **3243** chars |
| Resident session cost (tool names + `INSTRUCTIONS`, ÷4 chars/token) | < 400 tokens | **≈337** tokens |

All four are inline-snapshotted so an edit to `instructions.ts` or any
`DESCRIPTION` shows up as a reviewed diff, not a silent budget drift.
Registration order is pinned too — `TOOL_ORDER` in `mcp/src/constants.ts`
must match `TOOLS` in `mcp/src/tools/registry.ts` exactly, since a stable
order improves prompt cache hits.

> The plan that preceded this spec stated `INSTRUCTIONS` at 1274 chars; the
> shipped string measures 1278. The test's inline snapshot and the number in
> this table are the source of truth going forward — the tree, not the plan,
> is the fact.

## Rejected alternatives

- **Nested/packed ref arguments** (`{repo: {owner, name}}`, or
  `"owner/repo#42"`) — rejected under principle 2; flat primitives are what
  MCP tool search matches against, and packing would move parsing work from
  the resolver (server-side, testable) into ad hoc string splitting inside
  every tool.
- **`outputSchema` / `structuredContent`** — rejected under principle 3; MCP
  clients that read structured content still pay to carry the schema at
  `tools/list` time, and nothing in this repo consumes it.
- **SSE consumption for `run_agent_on_pr`** — rejected for the four reasons
  above; polling `GET /pulls/:id/runs` is simpler, survives an API restart
  correctly, and needs no stream-parsing dependency.
- **Extending `BlastRadius` in `vendor/shared`** — rejected; see "Why the
  extended shape is local" above. It would force a `client/` mirror update
  for two fields the client never reads.
- **`isError: true` for a still-running or failed review** — rejected under
  principle 4; a running or failed run is *data* the tool successfully
  retrieved, not a tool failure. Only genuine failures to answer (unreachable
  API, unknown ref, malformed response, rate limit, other HTTP errors) are
  `isError: true`.

## Out of scope

- The real blast radius (the second half of L04, reading `repo-intel`) —
  `get_blast_radius` stays a stub until that lands in `server/`.
- Starting a conventions scan from `get_conventions` or any other read tool —
  a scan spends LLM tokens, and a read tool must not spend money on the
  model's behalf.
- Consuming `GET /runs/:id/events` (SSE) — see "SSE vs. polling" above.
- Any write tool (`create_agent`, `accept_finding`, `import_pr`, …) — five
  read/compose tools is the final surface for this iteration.
- Remote/HTTP transport, auth, multi-workspace support — this server is
  local stdio only, matching `LocalNoAuthProvider`
  (`server/src/adapters/auth/local.ts:14`).
- Root-level integration — the `mcp/` row in the package table, the roadmap
  line, and the architecture diagram in the root `README.md`; the row in
  root `TESTING.md`; `.github/workflows/mcp.yml` — deferred to a follow-up
  iteration.
