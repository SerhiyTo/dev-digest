# DevDigest — local-first AI pull-request review

Course starter: import a PR → run an agent review. Deep architecture + diagrams
live in README.md — read it before structural changes; do not duplicate it here.

## Modules

| Folder           | Package                    | What it is                                  | Port |
|------------------|----------------------------|---------------------------------------------|------|
| `server/`        | `@devdigest/api`           | Fastify 5 + Drizzle/Postgres (pgvector)     | 3001 |
| `client/`        | `@devdigest/web`           | Next.js 15 studio UI                        | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine (diff → LLM → findings)  | —    |
| `e2e/`           | `@devdigest/e2e`           | Deterministic browser e2e (agent-browser)   | —    |

Each module has its own CLAUDE.md (auto-loads when you work there) and README.

## Non-default conventions

- **Not a monorepo workspace.** Each package has its own package.json + lockfile.
  Cross-package code is shared via tsconfig path aliases, not published modules.
- Package managers differ: `server/` and `client/` use **pnpm**;
  `reviewer-core/` and `e2e/` use **npm**. Don't mix lockfiles.
- `@devdigest/shared` (Zod contracts) is vendored: canonical copy in
  `server/src/vendor/shared`, mirrored in `client/src/vendor/shared`.
- Only Postgres runs in Docker (`docker-compose.yml`); API and web run on the
  host via `pnpm dev` in each folder.
- **Do not add comments to code.** Convey intent through naming, types, and
  small functions. Non-obvious "why" goes in the module's `specs/` or
  `INSIGHTS.md`, not inline. Leave existing comments in place unless you are
  rewriting that code — this is a rule for new code, not a cleanup task.
  One exception: a `@deprecated` marker block is metadata, not a comment —
  tsserver, `deprecation-audit.sh` and `pr-self-review` all read it. Write it in
  the shape the `deprecation-policy` skill specifies, and nothing else in it.

## Commands (root)

- `docker compose up -d` — Postgres only
- Per-module dev/test commands: see the module's CLAUDE.md

## Docs map

- `README.md` — architecture, review-flow diagram, course roadmap
- `TESTING.md` — cross-module testing strategy
- `docs/` — cross-cutting docs (`docs/agent-prompts/` — prompt templates)
- `<module>/docs/`, `<module>/specs/`, `<module>/INSIGHTS.md` — per-module;
  before implementing a feature, check the module's `specs/` for its spec.
  Read the module's `INSIGHTS.md` before working in it; at wrap-up run the
  `engineering-insights` skill to append substantive learnings (append-only).
