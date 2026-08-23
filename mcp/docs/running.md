# Running the MCP server

From a clean checkout to a working `devdigest` server inside Claude Code, plus
how to run it standalone and how to diagnose it when it will not start.

## What "running" means here

A stdio MCP server **is not a daemon**. It has no port, no PID to manage, no
`start`/`stop` lifecycle of its own. The client — Claude Code, or the MCP
Inspector — spawns `node mcp/bin/devdigest-mcp.mjs` as a child process and
talks JSON-RPC over its stdin/stdout; when the client exits, the process dies
with it.

Two consequences worth internalising:

- **`./scripts/dev.sh` does not and cannot start it.** The dev script brings up
  Postgres, the API and the web app — three things that do have their own
  lifetimes. This server has nothing for it to start.
- **The API does not have to be up when the server starts.** `readConfig()`
  validates `DEVDIGEST_API_URL` but deliberately never probes it, because
  Claude Code launches this server before `dev.sh` may have run. Start Claude
  Code whenever you like; bring the API up only when you actually want to use
  a tool. Until then the tools answer with the "cannot reach the API" message,
  which names the command that fixes it.

## From zero

### 1. Prerequisites

Node ≥ 22, pnpm ≥ 10, Docker. Check with `node -v`, `pnpm -v`, `docker info`.

### 2. Bring up Postgres and the API

The MCP server is a client of the API, so the API is what actually needs
running. Either the scripted path:

```sh
./scripts/dev.sh          # Postgres + migrations + seed + API :3001 + web :3000
```

or by hand, if you want the API without the web app:

```sh
docker compose up -d
cd server && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev
```

Confirm it answers:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/agents   # expect 200
```

### 3. Install this package's dependencies

**This is the one step specific to the MCP server, and it is mandatory.**
`dev.sh` does not do it.

```sh
cd mcp && npm ci
```

Without `mcp/node_modules` the bin shim cannot resolve `tsx` and the process
dies before it speaks a single JSON-RPC frame.

### 4. Verify it standalone, before involving Claude Code

Fastest check, from `mcp/`:

```sh
cd mcp && npm run inspect        # MCP Inspector CLI: tools/list
```

Expect the five tools in order: `list_agents`, `run_agent_on_pr`,
`get_findings`, `get_conventions`, `get_blast_radius`.

Then repeat **from the repo root**, because that is the working directory
Claude Code spawns it from and the two are not equivalent:

```sh
printf '%s\n%s\n%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
| node mcp/bin/devdigest-mcp.mjs 2>/dev/null
```

You should get three JSON-RPC frames back. Silence means it crashed — drop the
`2>/dev/null` to see why.

### 5. Register it with Claude Code

The root [`.mcp.json`](../../.mcp.json) is committed, so there is nothing to
write. Restart Claude Code, approve the project server when prompted, then:

```
/mcp
```

`devdigest` should be listed as connected with five tools. Ask for a review in
plain language — *"review PR 42 in acme/api with the Security agent"* — and it
should come back as **one** tool call returning `{verdict, score, findings}`.

## Running it manually

```sh
cd mcp && npm start
```

It prints one line to stderr and then sits waiting for JSON-RPC on stdin. That
is correct behaviour, not a hang. This is mostly useful for watching the stderr
diagnostics while a separate client drives it.

For interactive exploration, the Inspector's web UI is better than raw stdin:

```sh
cd mcp && npx -y @modelcontextprotocol/inspector node bin/devdigest-mcp.mjs
```

Call a specific tool from the CLI:

```sh
cd mcp && npx -y @modelcontextprotocol/inspector --cli node bin/devdigest-mcp.mjs \
  --method tools/call --tool-name list_agents
```

Point it at a different API instance with `DEVDIGEST_API_URL=http://host:port`.

## Turning it off

`.mcp.json` makes Claude Code connect the server at the start of every session
in this repo. Claude Code has **no native "connect on demand"** mode for stdio
servers, so if you want it off, you turn it off:

- **Per project, via the UI:** `/mcp`, then toggle `devdigest` off. This is
  recorded per project path and persists across sessions — it is not a
  session-only switch.
- **Per project, via settings:** add `"disabledMcpjsonServers": ["devdigest"]`
  to `.claude/settings.local.json`. `disabledMcpjsonServers` beats
  `enabledMcpjsonServers` when a name appears in both.
- **Reset the approval prompt:** `claude mcp reset-project-choices`.

Leaving it connected costs about **337 tokens** at session start — the
`instructions` string plus five tool names. Tool schemas are not resident:
Claude Code defers them until it searches for a tool (`ENABLE_TOOL_SEARCH` is
already `true` in `.claude/settings.json`).

## When it will not start

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_MODULE_NOT_FOUND: Cannot find package '@devdigest/shared'` | `tsx` resolved a `tsconfig.json` without the path alias — usually because `mcp/node_modules` is missing, or the shim's `TSX_TSCONFIG_PATH` line was removed | `cd mcp && npm ci`; confirm `bin/devdigest-mcp.mjs` still sets `TSX_TSCONFIG_PATH` from its own directory |
| `tsx must be loaded with --import instead of --loader` | The shim was changed to `node:module`'s `register('tsx/esm', …)`, which fails on Node 25 / tsx 4.23 | Use `tsx/esm/api`'s `register()` |
| Server connects, every tool answers "cannot reach the DevDigest API" | The API is not running, or is on another port | `cd server && pnpm dev`, or set `DEVDIGEST_API_URL` |
| `⏸ Pending approval` in `claude mcp list` | The project server has not been approved yet | Run `claude` interactively and accept the workspace-trust dialog |
| Tools missing in a session that previously had them | The server was toggled off for this project | `/mcp` and toggle it back on; check `disabledMcpjsonServers` |
| Connected, but garbled or truncated responses | Something under `src/` wrote to stdout, corrupting the JSON-RPC channel | `cd mcp && npm test` — `test/token-budget.test.ts` greps for it |

Inspect state and logs:

```sh
claude mcp list                 # status of every configured server
claude mcp get devdigest        # detail, including an Issue: line on failure
claude --debug=mcp              # captures the server's stderr for the session
                                # → ~/.claude/debug/<session-id>.txt
```

## Timeouts

`run_agent_on_pr` polls for up to 180s (`waitBudgetMs` in `src/config.ts`),
emitting one progress notification per poll. Those notifications reset Claude
Code's **idle** timeout (`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, 30 min for stdio)
— they do not extend the wall-clock `MCP_TOOL_TIMEOUT`. At a 180s budget both
limits are far away, so nothing needs tuning; the notifications are there so
the wait is visible, not to survive a timeout. If the run outlives the budget
the tool returns its `run_id` and tells the model to call `get_findings`.
