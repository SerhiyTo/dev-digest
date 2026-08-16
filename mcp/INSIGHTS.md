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

## Codebase Patterns
<!-- Module-specific conventions, architecture decisions, naming patterns -->
- 2026-08-14: the resolver caches the repo/agent/pull *lists*, never a per-ref
  lookup, and never caches a miss — `ResolveError` is thrown straight from
  `resolveRepo`/`resolvePr`/`resolveAgent` without ever touching the cache. So
  a repo or PR added mid-session becomes visible at the next TTL expiry
  instead of being poisoned as "not found" for a full cache window (evidence:
  mcp/src/resolve/cache.ts `get`/`set`; mcp/src/resolve/refs.ts
  `listReposCached`/`listPullsCached`/`listAgentsCached` cache the array
  returned by the port call, `resolveRepo`/`resolvePr`/`resolveAgent` throw
  `ResolveError` directly on a miss)

## Tool & Library Notes
<!-- Quirks, gotchas, and useful behaviors discovered about dependencies -->
- 2026-08-14: `tsx` resolves `tsconfig.json` from the process's working
  directory, not from the entry file's location — so the bin shim has to set
  `TSX_TSCONFIG_PATH` itself, from its own path, before calling `register()`.
  This broke silently under every check that happens to run from inside
  `mcp/` (`npm test`, `npm run inspect`) and only surfaced once the server was
  spawned from the repo root, which is how `.mcp.json` actually launches it.
  The lesson generalizes: a verify step run from the wrong directory can pass
  while the real invocation fails (evidence: mcp/bin/devdigest-mcp.mjs:6-7
  `process.env.TSX_TSCONFIG_PATH ??= resolve(packageRoot, 'tsconfig.json')`)
- 2026-08-14: `node:module`'s `register('tsx/esm', import.meta.url)` — the
  form shown in this plan's own "Конфіги" section — fails on this Node/tsx
  pair with "tsx must be loaded with --import instead of --loader". The
  working replacement is `tsx/esm/api`'s own `register()`, called with no
  arguments (evidence: mcp/bin/devdigest-mcp.mjs:4,9 `import { register }
  from 'tsx/esm/api'` + bare `register()`)
- 2026-08-14: `TS2589: Type instantiation is excessively deep` on
  `@modelcontextprotocol/sdk@1.30` + zod 3.25 hits whenever a generic,
  non-literal `ZodRawShape` meets the SDK's mapped output type. It showed up
  twice independently — registering tools in a loop, and calling the SDK's
  own shape-to-object helper in a test — and both times the only fix was a
  narrow `as unknown as <T>` cast at that one call boundary, not a broader
  type change (evidence: mcp/src/server.ts:45 `registerTool.bind(server) as
  unknown as RegisterAnyTool`; mcp/test/token-budget.test.ts:12-14 three
  `as unknown as` casts around `objectFromShape`/`normalizeObjectSchema`)
- 2026-08-14: zod 3's `.nullish()` makes a field optional, not merely
  nullable — `PrMeta.id` is `z.string().nullish()`
  (server/src/vendor/shared/contracts/platform.ts:159), so the mirroring
  `ports.ts` row type had to be `id?: string | null`, not `id: string | null`,
  or the compile-time `Extends<Pick<PrMeta, …>, PullRow>` assertion in
  `http/schemas.ts` fails. Widening the row type to match is the right fix
  direction — narrowing the assertion instead would have let a future
  contract rename slip through unnoticed (evidence: mcp/src/ports.ts:25
  `PullRow.id?: string | null`; mcp/src/http/schemas.ts:69-70 `_PullRowOk`)
- 2026-08-14: `BlastRadiusResult.parse()` silently strips any key not in the
  schema (zod's default `strip` mode) — `BlastRadius` itself has no `repo`/
  `pr` fields (server/src/vendor/shared/contracts/brief.ts:88-93), so the stub
  tool builds the parsed result first and merges `repo`/`pr` back in
  afterwards rather than passing them into `.parse()` and trusting they'd
  survive (evidence: mcp/src/tools/get-blast-radius.ts:27,37 `BlastRadiusResult
  .parse({...})` then `{ repo, pr, ...stub }`)

## Recurring Errors & Fixes
<!-- Errors seen more than once and their confirmed fixes -->

## Session Notes
<!-- One dated line per session that produced entries: what was accomplished -->
- 2026-08-14: L04 (part 1) — scaffolded `@devdigest/mcp`, a local stdio MCP
  server exposing `list_agents`, `run_agent_on_pr`, `get_findings`,
  `get_conventions` and a stubbed `get_blast_radius` over the running API;
  wired resolver caching, the polling wait loop, the compact/errors
  formatting layer and the in-memory MCP integration suite; 114 tests passing.

## Open Questions
<!-- Unresolved things that need more investigation -->
