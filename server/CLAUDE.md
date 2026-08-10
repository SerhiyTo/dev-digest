# @devdigest/api — Fastify backend

Imports repos/PRs, indexes repos (repo-intel), stores agents, runs reviews via
reviewer-core. Uses **pnpm**.

## Commands

- `pnpm dev` — :3001 (tsx watch)
- `pnpm test` — vitest
- `pnpm typecheck`
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` — Drizzle
- No API keys required to boot; keys can be set at runtime via Settings

## Map

- `src/modules/<name>/` — feature plugins (repos, pulls, agents, runs,
  repo-intel, …); one self-contained folder per feature
- `src/adapters/` — LLM, GitHub, git, ast-grep, secrets — behind a DI container
- `src/platform/` — config (`config.ts`), DI wiring
- `src/db/` — Drizzle schema, migrate/seed entrypoints
- `src/vendor/shared/` — canonical `@devdigest/shared` Zod contracts

## Conventions (non-default)

- Zod contracts double as route schemas via `fastify-type-provider-zod`, but
  **only for requests**: no route declares `response:`, so nothing validates or
  serializes what goes out. Response bodies are hand-written DTOs (e.g.
  `modules/reviews/helpers.ts`) that no compiler checks against the contract —
  edit a contract without its DTO and the contract silently lies.
- Adapters are swapped for mocks through the DI container in tests — mock the
  container, not the modules.
- Run traces stream over SSE (`fastify-sse-v2`).

## Gotchas / Do not touch

- **Secrets:** only via `LocalSecretsProvider` (`src/adapters/secrets/local.ts`)
  → `~/.devdigest/secrets.json` (0600), env as fallback. Never git, never DB.
  `GITHUB_TOKEN` is canonical; `GITHUB_PAT` accepted as fallback.
- **DB schema contains every table up front** — empty tables belong to future
  course lessons; do not delete them.
- **Never hand-edit `src/db/migrations/*.sql`** — they are generated and
  already applied to existing DBs. Schema changes go: edit `src/db/schema.ts`
  → `pnpm db:generate` → new migration file → `pnpm db:migrate`.
- `src/vendor/shared` is the canonical shared copy — changes here must be
  mirrored to `client/src/vendor/shared`.

## Docs

- `README.md` — module deep-dive, diagrams, testing section
- `docs/` — topic docs; check here before asking the user
- `specs/` — feature specs (`YYYY-MM-DD-<topic>.md`); find the spec before
  implementing a feature
- `INSIGHTS.md` — lessons from past sessions. Read it before starting work
  here (high-confidence guidance). At wrap-up run the `engineering-insights`
  skill — append only substantive, deduplicated entries; do not skip this step.
