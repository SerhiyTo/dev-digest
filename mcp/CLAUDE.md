# @devdigest/mcp — local stdio MCP server

Exposes DevDigest to Claude Code as five MCP tools. It is a **client of the
running Fastify API** over HTTP (`DEVDIGEST_API_URL`, default
`http://localhost:3001`) — no database, no runtime import from `server/src`,
types only via the `@devdigest/shared` tsconfig alias. Registered for Claude
Code by the root `.mcp.json`. Uses **npm**.

## Commands

- `npm test` — vitest, fully hermetic (no Docker, no API, no network, no LLM)
- `npm run typecheck`
- `npm run build` — the same `tsc --noEmit` as `typecheck`; **this package
  never emits JS**
- `npm start` — runs the server on stdio (`node bin/devdigest-mcp.mjs`)
- `npm run inspect` — MCP Inspector CLI, `tools/list` against the built server

There is no lint script in any module here — do not add one.

## Map

- `src/index.ts` — entrypoint: `readConfig` → `createHttpApi` → `createServer`
  → `StdioServerTransport`
- `src/server.ts` — `createServer(deps)` → `McpServer`; registers the five
  tools in `TOOL_ORDER`
- `src/instructions.ts` — the resident `INSTRUCTIONS` string
- `src/config.ts` — `readConfig(env)` → `{apiUrl, requestTimeoutMs,
  pullsTimeoutMs, waitBudgetMs, cacheTtlMs}`
- `src/ports.ts` — `DevDigestApi`, the interface the tools consume
- `src/constants.ts` — payload cap, limits, poll cadence, `TOOL_ORDER`
- `src/http/` — `client.ts` (`DevDigestApi` over `fetch`, timeouts, `ApiError`)
  + `schemas.ts` (lenient `.passthrough()` parsers)
- `src/resolve/` — `cache.ts` (TTL `Map`) + `refs.ts` (`resolveRepo` /
  `resolvePr` / `resolveAgent`)
- `src/domain/select.ts` — pure selection rules: repo match order, "same run"
  choice, severity ordering, closest agent name
- `src/review/wait.ts` — `waitForRun()`, the polling loop
- `src/format/` — `compact.ts` (payload projection + `capPayload()`) +
  `errors.ts` (the error taxonomy, one function per case)
- `src/blast/contract.ts` — `BlastRadiusResult = BlastRadius.extend({degraded,
  reason})`
- `src/tools/` — the five tool modules + `registry.ts`

## Gotchas / Do not touch

- **stdout is the JSON-RPC channel.** A stray `console.log` under `src/`
  corrupts every message Claude Code reads. All diagnostics go to
  `console.error`. `test/token-budget.test.ts` greps `src/**` for
  `console.log(` / `process.stdout.write(` and fails the build on a hit.
- **The bin shim (`bin/devdigest-mcp.mjs`) sets `TSX_TSCONFIG_PATH` from its
  own location, not from cwd.** `tsx` discovers `tsconfig.json` from the
  working directory, and Claude Code spawns this server from the repo root —
  without that line the `@devdigest/shared` alias never applies and the
  process dies with `ERR_MODULE_NOT_FOUND` before the first JSON-RPC frame.
  This shipped broken once precisely because every check ran from inside
  `mcp/`. Verify from the repo root, not just from `mcp/`.
- **The bin shim uses `tsx/esm/api`'s `register()`**, not `node:module`'s
  `register('tsx/esm', …)` — the latter fails on Node 25 / tsx 4.23 with
  `tsx must be loaded with --import`.
- **The zod self-pin in `tsconfig.json` must stay.** A second zod instance
  breaks `instanceof z.ZodError`, and the MCP SDK validates every tool input
  through it.
- **`GET /repos/:id/pulls` is also the GitHub import path**
  (`server/src/modules/pulls/routes.ts:31`) — it upserts and backfills. The
  resolver's TTL cache is therefore correctness-adjacent, not a performance
  nicety: uncached, three ref resolutions on the same PR mean three GitHub
  syncs. This is also why that one call gets its own, longer
  `pullsTimeoutMs` (30s vs the default 15s) in `config.ts`.
- **`server/src/app.ts:81` flips every `running` row to `failed` on API
  restart** — a restart mid-wait surfaces to the tool as a failed run, not a
  hang.
- **`POST /pulls/:id/review` is rate-limited to 10/min**
  (`server/src/modules/reviews/routes.ts:29`).
- **There is no `GET /runs/:id/findings`.** `get_findings` composes
  `GET /pulls/:id/runs` with `GET /pulls/:id/reviews`, matched by `run_id`.
- **`vendor/shared` is never edited from here.** The blast-radius shape is
  extended locally (`BlastRadius.extend({degraded, reason})` in
  `src/blast/contract.ts`), which is what keeps this an additive change with
  no `client/` mirror to sync. `BlastRadiusResult.parse()` strips the
  `repo`/`pr` echo fields (zod's default mode), so `get_blast_radius` merges
  them back in after parsing.
- **All user-facing error prose lives in `src/format/errors.ts`** under
  inline snapshots, so wording is reviewed as a diff. Do not hand-roll an
  error string in a tool module.
- **No tool declares `outputSchema`**, and the token budget is gated by
  `test/token-budget.test.ts` (instructions length, per-tool description
  length, serialized `tools/list` size, resident token estimate, tool order).

## Docs

- `README.md` — how this is wired into Claude Code, the five tools, the
  request-flow diagram
- `docs/running.md` — bringing it up from a clean checkout, running it
  standalone, turning it off, and what to check when it will not start
- `docs/tool-surface.md` — each tool's exact description, inputs, API calls
  and an example payload
- `specs/` — the design rationale; find the spec before changing tool
  behavior
- `INSIGHTS.md` — lessons from past sessions. Read it before starting work
  here. At wrap-up run the `engineering-insights` skill — append only
  substantive, deduplicated entries; do not skip this step.
