# Routing — which skill audits which files

Every reviewable file from step 0 is matched against the table below. A file can
match several rows; each auditor then sees only its own slice. A skill whose
slice is empty gets no subagent — that is the whole point of routing.

| Pattern | Auditors |
|---|---|
| `client/src/**/*.{ts,tsx}` | `frontend-ui-architecture`, `react-best-practices` |
| `client/src/app/**`, `client/next.config.*`, `client/src/middleware.ts` | `next-best-practices` |
| `client/**/*.{test,spec}.{ts,tsx}` | `react-testing-library` |
| `server/src/**`, `reviewer-core/src/**` | `onion-architecture` |
| `server/src/**/routes.ts`, `server/src/**/plugin.ts`, `server/src/app.ts`, `server/src/platform/**` | `fastify-best-practices` |
| `server/src/db/schema/**`, or any file whose added lines mention `drizzle-orm` | `drizzle-orm-patterns` |
| `server/src/db/migrations/*.sql`, `server/src/db/schema/**` | `postgresql-table-design` |
| `**/vendor/shared/contracts/**`, or any added line containing `z.` | `zod` |
| `*.{ts,tsx}` with an added generic, `as ` cast, `any`, or a `.d.ts` file | `typescript-expert` |
| **any diff** | `security` |
| **any diff** | `project-rules` |

## The two rows that are not ordinary skills

**`security` runs on every diff**, regardless of file type. A config change, a
new dependency, or a migration can all introduce exposure, and the cost of one
extra auditor is far below the cost of missing it.

**`project-rules` is not a skill** — it is an auditor with no `Skill` call. It
reads root `CLAUDE.md`, the touched modules' `CLAUDE.md` and `INSIGHTS.md`, and
checks the diff against the local conventions that no generic skill knows: ESM
`.js` import specifiers, `specs/` before implementing, static module
registration, pinned `fastify-type-provider-zod@^4`, `*.it.test.ts` naming.
Step 0 already covers the mechanical subset (comments, mirrored contracts,
`process.env`), so `project-rules` handles only what needs reading.

## Packages with no skill of their own

`e2e/` has no dedicated skill — it receives `security` and `project-rules` only.
`agent-runner/` likewise. Do not stretch a frontend skill over them; an auditor
applying rules that were never written for the code it is reading produces
confident nonsense.

## Slicing

An auditor's prompt carries its file list plus the patch restricted to those
files. Two limits keep a run sane:

- **more than ~25 files in one slice** — split by module (`server/src/modules/x`,
  `server/src/modules/y`) rather than handing one agent everything;
- **more than ~9 auditors** — drop the lowest-value rows first
  (`typescript-expert`, `react-testing-library`), and say in the report which
  ones were dropped. A silently narrowed review reads like a clean one.
