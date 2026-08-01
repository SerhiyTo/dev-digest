# @devdigest/web — Next.js 15 studio

UI: import repos, browse PRs, run/read reviews, author agents. App Router +
React 19 + TanStack Query. Uses **pnpm**.

## Commands

- `pnpm dev` — :3000
- `pnpm test` — vitest + jsdom, fetch mocked (no API needed)
- `pnpm typecheck`

## Map

- `src/app/**/page.tsx` — routes (route map with API calls: README.md)
- `src/lib/hooks/` — ALL data hooks; `src/lib/api.ts` — the only fetch layer
- `src/components/` — shared components
- `src/vendor/ui/` — vendored UI primitives (`@devdigest/ui`)
- `src/vendor/shared/` — mirrored Zod contracts (canonical copy is in server)
- `messages/<locale>/*.json` — next-intl translations

## Conventions (non-default)

- Data access ONLY through `src/lib/hooks/*` → `src/lib/api.ts`; never fetch
  directly from components.
- API base: `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).
- Every user-facing string goes through next-intl messages, all locales.

## Gotchas / Do not touch

- `src/vendor/shared` is a mirror — edit the canonical copy in
  `server/src/vendor/shared` and sync, never diverge them.
- `src/vendor/ui` is vendored, not a dependency — changes affect only this app.

## Docs

- `README.md` — UI route map diagram, stack details
- `docs/` — topic docs
- `specs/` — feature specs; find the spec before implementing a feature
- `INSIGHTS.md` — lessons from past sessions. Read it before starting work
  here (high-confidence guidance). At wrap-up run the `engineering-insights`
  skill — append only substantive, deduplicated entries; do not skip this step.
