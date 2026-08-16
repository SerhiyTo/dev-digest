# Testing & CI strategy

DevDigest is four independent packages (no workspace), so testing is organised
as **one suite per package**, each with its own CI workflow, runner, and path
filter. A package's suite runs only when that package (or a package it depends
on at type-check time) changes.

## Philosophy — typological, not exhaustive

We do **not** chase line coverage. Each suite covers the *kinds* of things that
can break in that layer — one happy path plus the edge that actually matters per
workflow — and deliberately skips the rest. Concretely:

- **Test behaviour at the seams**, not implementation details. Routes, adapters,
  contracts, the review pipeline, the rendered component.
- **Mock the outside world.** LLMs, GitHub, and git are stubbed via
  `server/src/adapters/mocks.ts` so unit tests are hermetic and key-free.
- **One real integration per data-backed workflow**, against a real Postgres —
  not a mock DB — because the bugs there live in SQL, migrations, and wiring.
- **A few end-to-end browser flows** over the *main* user journeys, on seeded
  data, with no LLM in the loop.

If a test wouldn't catch a class of regression we care about, we don't write it.

## Suite map

| Suite | Package | Kind | Runner | Workflow | Docker? |
|-------|---------|------|--------|----------|---------|
| client | `client/` | component / unit (jsdom) | vitest | `client.yml` | no |
| server-unit | `server/` | unit (hermetic) | vitest | `server-unit.yml` | no |
| server-integration | `server/` | integration (real Postgres) | vitest | `server-integration.yml` | **yes** |
| reviewer-core | `reviewer-core/` | unit (engine) | vitest | `reviewer-core.yml` | no |
| mcp | `mcp/` | unit (hermetic, stdio server) | vitest | — (not yet wired) | no |
| e2e web | `e2e/` | browser e2e (deterministic) | agent-browser + `run.ts` | `e2e-web.yml` | yes (stack) |

## What each suite covers

**client** — components render and react to interaction (React Testing Library
+ jsdom). `fetch` is mocked; no API, DB, or browser. Covers the PR-review
surface (list, diff, findings, run controls) and the agent editor.

**server-unit** — the DB-free majority: adapters, prompt assembly, grounding,
repo-intel ranking & indexing, pricing, route smoke. The `typecheck` job also
runs on Windows, which doubles as the `@ast-grep/napi` prebuilt gate (install
fails there if the win32 prebuilt is missing).

**server-integration** — the `*.it.test.ts` files. Each starts a real Postgres
(pgvector) via testcontainers, builds the Fastify app, migrates + seeds, and
drives routes end-to-end: reviews + run lifecycle (incl. grounding), agents CRUD,
repo-intel symbol clamping, pulls comments, settings models. They self-skip when
Docker is unavailable.

**reviewer-core** — the pure engine: `toReview` selection, prompt construction,
and a `run` with a stubbed model → grounded findings. No DB / GitHub / FS.

**mcp** — the stdio MCP server, fully hermetic: no Docker, no API, no network,
no LLM. The HTTP client runs against `test/helpers/fake-api.ts`, so a tool's
composition (resolve → call → project → cap) is tested without a server.
Two lanes are unusual and worth knowing about: `token-budget.test.ts` pins the
resident context cost — instructions length, per-tool description length, the
serialized `tools/list` size and tool order — as **inline snapshots**, so any
prose edit surfaces as a reviewed diff rather than silent budget drift; and it
greps `src/**` for `console.log(` / `process.stdout.write(`, because stdout is
the JSON-RPC channel and one stray write corrupts every message Claude Code
reads. Note `mcp/` has **no CI workflow yet** — it runs locally and via
`scripts/verify-l04.sh`.

**e2e web** — see `e2e/README.md`. Deterministic agent-browser flows over the
main journeys (boot → PR list → PR detail; agents) against a real seeded stack.
No `chat`, no model key.

## Running locally

```sh
# every lane for one lesson, in one command
./scripts/verify-l04.sh                 # latest lesson (adds mcp + the L04 gates)
./scripts/verify-l03.sh                 # or: cd server && pnpm verify:l03
VERIFY_SKIP_IT=1 ./scripts/verify-l04.sh        # no Docker
VERIFY_SKIP_BUILD=1 ./scripts/verify-l04.sh     # no `next build`

# per package
cd client        && pnpm test           # + pnpm typecheck
cd reviewer-core && npm test
cd mcp           && npm test            # + npm run typecheck

# server — the unit/integration split (see note below)
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit, no Docker
cd server && pnpm exec vitest run .it.test                      # integration, needs Docker
cd server && pnpm test                                          # both

# browser e2e (needs the full stack + agent-browser CLI)
./scripts/dev.sh
npm i -g agent-browser && agent-browser install
cd e2e && npm install && npm test
```

## Conventions

- **Integration tests end in `*.it.test.ts`.** The unit lane excludes that glob
  (`vitest run --exclude '**/*.it.test.ts'`); the integration lane selects only
  it (`vitest run .it.test`). A DB-backed test that imports `test/helpers/pg.ts`
  must use the `.it.test.ts` suffix.
- **`server/package.json` is `skip-worktree`** (a local variant diverges from the
  committed file). CI therefore invokes the split with
  `pnpm exec vitest run …` rather than relying on committed `test:unit` /
  `test:integration` scripts.
- **A per-lesson verifier is a shell script, not a package script.** It spans four
  packages, so it belongs to none of them, and the `skip-worktree` note above
  makes a `server/package.json` entry an unreliable entry point. `scripts/verify-l03.sh`
  is the real thing; the `verify:l03` entries in `server/` and `client/` only
  forward to it. It reports a lane it could not run as **skipped** rather than
  passing — Docker absent, or a dev server holding `:3000` (building under
  `pnpm dev` poisons the shared `.next`).
- **Two things no suite checks, so `verify-l04.sh` checks them.** (1) The
  `vendor/shared` mirror: `server/src/vendor/shared` is canonical and
  `client/src/vendor/shared` is a hand-synced copy, and *nothing* in any suite
  compares them — a one-sided contract edit typechecks on both sides and only
  surfaces in a browser, so a `diff -q` gate is the only defence. (2) The onion
  ruleset: `server/.dependency-cruiser.cjs` does not exist and no package script
  runs depcruise, so import-direction rules are honour-system. The report has a
  documented pre-existing baseline (7 errors / 36 warnings), so grep your own
  paths out of it rather than expecting a clean exit.
- **Hermetic by default.** Reach for `src/adapters/mocks.ts` (MockLLMProvider,
  MockGitClient) rather than real network/keys.
- **E2E specs are deterministic batch JSON** (`e2e/specs/*.flow.json`) using
  only `--url` / `--text` / `find` locators — never the AI `chat` command.
- **CI is path-filtered per package.** Cross-package source aliases are encoded
  in each workflow's `paths:` (e.g. `reviewer-core/**` triggers `server-unit`
  because the server type-checks against `../reviewer-core/src`).
- **`server/clones/**` is runtime data** (git-ignored) and never collected by
  any suite.
