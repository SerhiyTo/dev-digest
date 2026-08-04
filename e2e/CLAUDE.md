# @devdigest/e2e — deterministic browser e2e

UI flows driven by Vercel agent-browser (Rust + CDP CLI). **No Playwright, no
LLM, no API key — keep it that way.** Uses **npm**.

## Commands

- `npm test` — run all flows via `run.ts` (app must be running)
- `npm run e2e:hermetic` — `../scripts/e2e.sh`, full hermetic run
- `npm run typecheck`
- `E2E_BASE_URL` overrides `{BASE}` (default `http://localhost:3000`)

## Map

- `specs/NN-name.flow.json` — one flow = ordered JSON list of agent-browser
  commands, numbered by run order (01-app-boot … 07-settings)
- `run.ts` — runs flows against one shared browser session
- `lib/assert.ts` — optional stdout assertions
- `agent-browser.json` — browser config

## Conventions (non-default)

- `wait --text` / `wait --url` ARE the assertions — they exit non-zero on
  timeout. A failing step fails the flow.
- Each `cmd` is passed verbatim to agent-browser; optional
  `"assert": { "stdoutIncludes": … }` adds a substring check.
- New flows: next `NN-` prefix, one user-visible behavior per flow.

## Gotchas

- Flows assume the seeded DB state (`pnpm db:seed` in `server/`) — e.g. the
  seeded PR `#482`. Changing the seed breaks specs.
- Don't introduce Playwright or an LLM here; determinism is the point.

## Docs

- `README.md` — flow format spec, agent-browser details
- `specs/` here = **e2e flow specs** (JSON), not feature specs
- `docs/` — topic docs and feature specs for the e2e harness itself
- `INSIGHTS.md` — lessons from past sessions (flaky waits, timing quirks).
  Read it before starting work here (high-confidence guidance). At wrap-up run
  the `engineering-insights` skill — append only substantive, deduplicated
  entries; do not skip this step.
