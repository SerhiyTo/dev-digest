# `@devdigest/web` — the studio (Next.js 15)

The DevDigest UI: import repos, browse pull requests, run and read AI reviews,
and author agents. App Router + React Server/Client components, data via
**TanStack Query** hooks over the Fastify API. (This is the starter surface;
course lessons add the Skills, Memory, Eval, Blast/Brief, multi-agent, CI, and
dashboard screens.)

- **Stack:** Next.js 15 (App Router), React 19, TanStack Query, `next-intl`
  (messages in `messages/<locale>/*.json`), `recharts`, `mermaid`,
  `react-markdown`. UI primitives are vendored under `src/vendor/ui`
  (`@devdigest/ui`) and shared Zod contracts under `src/vendor/shared`
  (`@devdigest/shared`).
- **API base:** `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`), used by
  `src/lib/api.ts`. Every data hook lives in `src/lib/hooks/*`.
- **Run:** `pnpm dev` (`:3000`). **Test:** `pnpm test` (vitest + jsdom, fetch
  mocked — no API needed). **Typecheck:** `pnpm typecheck`.

## UI route map

Routes (`src/app/**/page.tsx`) and the API surface each leans on (via
`src/lib/hooks/*` → `src/lib/api.ts`):

```mermaid
flowchart TD
  ROOT["/"] -->|"useRepos → GET /repos"| PULLS["/repos/:repoId/pulls<br/>PR list"]
  ONB["/onboarding<br/>add repo"] -->|"POST /repos"| API[("Fastify API")]
  PULLS --> PR["/pulls/:number<br/>review detail<br/>(overview · diff · findings)"]

  AGENTS["/agents"] --> AGENT["/agents/:id<br/>editor (config · skills · evals · context)"]
  SETTINGS["/settings/:section<br/>API keys · models"]
  CONTEXT["/repos/:repoId/context<br/>project context<br/>list · preview (?path=)"]
  EVALS["/evals<br/>eval dashboard<br/>agent cards"] --> AGENTEVAL["/evals/:agentId<br/>per-agent dashboard<br/>metrics · trend · runs · compare"]
  AGENTEVAL -->|"Configure eval cases →"| AGENT
  AGENT -->|"Evals tab: Open eval dashboard →"| AGENTEVAL

  PULLS -->|"GET /repos/:id/pulls · /repos/:id/index-state"| API
  PR -->|"GET /pulls/:id · /reviews · /pulls/:id/comments<br/>POST /pulls/:id/review · /findings/:id/(accept|dismiss)"| API
  AGENTS -->|"/agents · /agents/:id"| API
  SETTINGS -->|"/settings · /providers"| API
  CONTEXT -->|"GET /repos/:id/context · /context/file<br/>POST /context/resync · /context/estimate"| API
  AGENT -->|"GET · PUT /agents/:id/context (Context tab)"| API
  EVALS -->|"GET /evals"| API
  AGENTEVAL -->|"GET /agents/:id/eval-(dashboard|runs) · /eval-runs/compare · /eval-suite-runs/:id<br/>POST /agents/:id/eval-runs/start · /eval-suite-runs/:id/cancel"| API
  AGENT -->|"Evals tab: GET /agents/:id/eval-cases<br/>POST · PATCH · DELETE /eval-cases/:id · POST /eval-cases/:id/run"| API
  PR -->|"POST /findings/:id/eval-case (Turn into eval case)"| API
```

Cross-cutting chrome lives in `src/components/app-shell` (nav, breadcrumbs,
`g`-then-key shortcuts). Pages are thin; feature logic sits in colocated
`_components/<Name>/` folders, each with its own `*.test.tsx`. A page is only
reachable from the sidebar once it is also registered in `src/vendor/ui/nav.ts`
— that file, not the App Router, is the list of nav entries and `g`-shortcuts,
and it holds routes this map does not draw (`/skills`,
`/repos/:repoId/conventions`). A component shared by two routes lives in
`src/components/` and takes its user-facing strings as props rather than
reading a route's `next-intl` namespace (`src/components/doc-attach`; see
`specs/2026-08-23-project-context.md`).

## Testing

Component/interaction tests (`*.test.tsx`) run under vitest + jsdom with `fetch`
mocked, so they need neither the API nor a browser. The real browser journeys
(client + API + seeded DB) are covered by the deterministic agent-browser suite
in [`../e2e`](../e2e/README.md) and the `e2e-web.yml` workflow. See
[`../TESTING.md`](../TESTING.md).
