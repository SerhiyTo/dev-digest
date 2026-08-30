# Findings catalog

One entry per finding type: how it shows up, what it actually costs, its default
tier, and the thing that looks exactly like it and is fine. The tier is a
default — move it when the evidence says so, and say why you moved it.

## Phantom dependency — default **P0**

**Signal:** `phantom[]`. Imported in source, declared in no `package.json`.

**Cost:** it resolves today because some other package hoisted it into a
reachable `node_modules`. Change an unrelated dependency and the import fails at
runtime with no diff that explains it.

**Word it:** name the importing file and line, and the package that should
declare it.

> P0 — `mcp/src/http/client.ts:8` imports `undici`, which appears in no
> `mcp/package.json` section. It resolves through a transitive install today.
> Declare it in `dependencies` at the version currently resolved (`6.21.0`).

**Looks identical, is fine:** an import that matches a tsconfig `paths` alias
(the collector classifies those separately and will not report them); a Node
builtin written without the `node:` prefix; a subpath import (`#internal`)
declared in `imports`.

## Deep import past a package's public entry — default **P0**

**Signal:** `crossPackageEdges[]` with `kind: "deep-relative"`, or an alias
resolving to a file below a package's entry point.

**Cost:** the target package can no longer change its internals without breaking
a consumer that was never supposed to see them. In this repo it also breaks the
premise that `reviewer-core` is standalone and pure.

> P0 — `reviewer-core/test/run.test.ts:3` imports
> `../../server/src/adapters/mocks.js`, reaching into `server`'s internals from
> the package that is supposed to have no dependency on it. Move the mock into
> `reviewer-core/test/`, or export it from `server`'s public surface if it is
> genuinely shared.

**Looks identical, is fine:** a relative import inside the same package; the
declared aliases (`@devdigest/shared`, `@devdigest/reviewer-core`) — those are
the public surface, not a bypass of it.

## Version drift — **P0** or **P2**, by what the package carries

**Signal:** `versionDrift[]`. Read `distinctResolved`, not only
`distinctRanges` — different ranges that resolve identically are Info; identical
ranges resolving differently across lockfiles is the case people miss.

**Tier by boundary:** if types or values from the package cross a package
boundary, drift is **P0** — two copies of a schema library produce two
structurally identical, mutually incompatible inferred types, and the error
message will be about neither. If the package is dev-only tooling and nothing
crosses on it, drift is **P2**.

> P0 — `zod` resolves to 3.24.1 in `server` and 3.22.4 in `client`, and
> `@devdigest/shared` contracts cross that boundary. `z.infer` output from one
> copy is not assignable to the other.
>
> P2 — `@types/node` resolves to five versions across six packages
> (22.19.19 … 22.20.1). Type-only, no boundary crossing, no runtime effect.
> Worth aligning next time the lockfiles are touched.

**Looks identical, is fine:** a package deliberately pinned per-consumer via
tsconfig `paths` — see the last entry in this file.

## Unused dependency — default **P1**

**Signal:** `unused[]` with `confidence: "high"`. **Always open the package
before reporting.** This is the highest-false-positive signal in the report.

**Cost:** install time, disk, an audit surface nobody uses, and the next reader
believing the package is load-bearing.

> P1 — `testcontainers` is declared in `server/package.json:48`. The integration
> lane imports `@testcontainers/postgresql` (`server/test/helpers/pg.ts:1`), a
> different package; nothing imports `testcontainers` itself. Recommend removing
> it and re-running `pnpm -C server test` to confirm.

**Looks identical, is fine — the whole list:**

| Pattern | Why it is not imported | How to confirm |
|---|---|---|
| `@types/*` | Consumed by the compiler through `node_modules/@types`, never by an `import` | Always fine. Never report |
| Tool run by its binary — `typescript`→`tsc`, `drizzle-kit`, `vitest`, `next` | `scripts` calls the bin, not the package name | Read the installed package's `bin` field, then grep `scripts` for those names |
| Config-file dependency — `tailwindcss`, `postcss`, `@tailwindcss/postcss` | Named as a string in `postcss.config.mjs` | Grep the package's root config files |
| Named-by-string runtime plugin — `pino-pretty` | `server/src/app.ts:57` passes `{ target: 'pino-pretty' }`; pino resolves it | Grep source for the quoted package name |
| Wanted for its binary — `@vscode/ripgrep` | Code uses the shipped executable's path | Grep for the package name in any form |
| Loaded through a dynamic import with a type assertion | `await import('x' as string)` | The collector handles this; a hand-written grep for `from 'x'` will not |
| A framework's peer that the framework loads — `react-dom` in some setups | Never imported by application code | Check the framework's requirements before touching it |

If any of these applies, the entry is **Info at most**, and only if the reader
gains something by knowing.

## Dependency in the wrong section — default **P1**

**Signal:** `misplaced[]`.

**`runtime-import-declared-as-dev`** is the one that bites: a production install
(`--omit=dev`, `--prod`) drops the package and the entry point crashes.

> P1 — `mcp/bin/devdigest-mcp.mjs:4` imports `tsx`, which `mcp/package.json`
> declares under `devDependencies`. The bin is the package's entry point; a
> production install leaves it unable to start.

**`test-only-declared-as-runtime`** is P2 — it only wastes install weight.

**Looks identical, is fine:** a package whose `src/` *is* test infrastructure.
`evals/src/dsl/case.ts` imports `vitest` and `evals` declares it as a dev
dependency; that is correct, because the whole package is a test harness and is
never installed for production.

## Duplicate installs — default **P2**, **Info** without a workspace

**Signal:** `duplicateInstalls[]`.

In a workspace this is a fixable hoisting problem. Here it is the price of six
independent packages, and the only fix is a restructure far larger than a
dependency report should propose. Report the number, name the cost, and stop.

> Info — `typescript` is installed six times at 22.8 MB each, 137 MB total.
> With six lockfiles and no workspace root there is nothing to hoist into;
> this is the cost of package independence, not a defect.

## Heavy dependency — **P1** only when the weight is paid by a user

Installed size is CI time and disk. Bundle size is a person waiting. Only
`client/` can produce the second kind, and only for code that reaches the
initial payload.

Before calling a client dependency heavy, find its import and read it: a
`await import(...)` inside an effect or handler, or a `next/dynamic` wrapper,
puts it in a lazy chunk. If you have not measured the bundle, say so and file it
as Info.

The import *shape* decides the cost as much as the package does. A namespace
import (`import * as Icons from 'lucide-react'`) hands the bundler nothing to
drop; the named form does. Check which one the code uses before assuming the
weight is paid:

> Info — `lucide-react` is 36.2 MB installed, the third-heaviest package in
> `client`. `client/src/vendor/ui/icons.tsx:83` imports it by name
> (`import { PanelRight, … } from "lucide-react"`), which is the tree-shakeable
> form, so the installed size is disk cost and not payload. Not a finding.

## Two packages doing one job — default **P1**

**Signal:** not in the JSON. It comes from reading `externalDeps[]` and
recognising overlap — two date libraries, two HTTP clients, two markdown
renderers, one of them used twice.

Name both, name where each is used, and say which one to keep and why. Without a
recommendation this is an observation, not a finding.

## Unpinned build-critical tool — default **P2**

A caret range on something that decides whether the build works at all means two
machines can produce different output from one commit. Everything here is
`^`-ranged, so raise this only for a tool that has actually caused drift —
otherwise it is a repo-wide policy question, not a finding.

## Vulnerability from `--audit` — **P0** at critical/high, else **P2**

Report the count and the package. Do not assess exploitability, do not propose a
patch strategy, do not write a remediation plan: hand the finding to the
`security` skill and say so.

Quote the counts the tool actually printed, name the package and how it got
here, and stop there — the shape is `<severity> in <package>: <dependency>
(direct | transitive via <parent>)`. Never write a CVE you did not see in the
audit output.

## Deliberate pin that looks like a defect — **Info**

`reviewer-core/tsconfig.json` and `mcp/tsconfig.json` map `zod` to their own
`./node_modules/zod`. Without the pin, a second copy reachable through a path
alias could give `z.infer` two incompatible identities. It is a fix for the
duplicate-install problem above.

Record these in Info **with the reason**, so the next run recognises them
instead of re-discovering them as findings.
