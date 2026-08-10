# Constants, config and flags

## Three categories, three homes

The reason constants end up scattered is that people file them by *shape* — "it
is a constant, so it goes in `constants`" — instead of by what governs them.

| Category | Governed by | Home |
|---|---|---|
| **Domain constants** | Your product's rules. Severity order, page size, retry limit, label maps | Colocated with the feature that owns them |
| **Environment/config** | Deployment. API base URL, keys, ports | Central config module, sourced from env vars |
| **Feature flags** | Runtime decisions, per user or rollout | A flag mechanism, not a constant |

The line that matters: **domain constants colocate, environment config
centralizes.** A severity ordering is a property of the feature and belongs next
to it. An API base URL is a property of the deployment and has nothing to do with
any feature, so it has one home.

## Domain constants stay with their feature

```
✅ app/repos/[repoId]/pulls/constants.ts        // PAGE_SIZE, DEFAULT_SORT
✅ _components/AgentCard/constants.ts           // MODEL_COLOR
❌ src/constants/index.ts                       // everything, forever
```

A root `constants/` folder is the same failure mode as `utils/`: a name that
describes the shape of the contents rather than their purpose, so nothing stops
it growing. It also puts distance between a value and the only code that reads
it, which is how a constant survives long after its feature was deleted.

Query keys are constants too, and the same rule applies — keep them in the
feature next to the hooks that use them, not in a central `queryKeys.ts`.

Promotion works as everywhere else: when a *second unrelated* feature needs the
same constant, lift it to a named shared module (`severity.ts`, not
`constants.ts`). Two components in the same feature is not a promotion signal.

## Naming and magic values

A literal deserves a name when the name carries information the value does not.

```ts
❌ if (findings.length > 50)
✅ if (findings.length > MAX_INLINE_FINDINGS)

❌ const MAX_RETRIES = 3;  // used once, three lines below, obvious from context
```

Both directions are real. Naming `-1` as `NOT_FOUND` earns its keep; naming
every number does not — it adds indirection and a second place to look. The test
is whether a reader would otherwise have to ask "why this number".

Conventions:

- `CONST_CASE` for module-level values that will not change.
- Export as a named group when several belong together
  (`export const PULL_LIST = { PAGE_SIZE: 25, ... }`), which makes call sites
  self-describing and avoids collisions between similarly named values from
  different modules.
- `as const` on literal maps and tuples so the type narrows to the actual values.
- `Object.freeze` if you want runtime protection too; the type-level `as const`
  is usually enough in a TypeScript-only codebase.

## Environment variables

- One module reads `process.env`; nothing else does. Scattering `process.env`
  reads makes it impossible to see what the app actually requires to boot.
- Validate at startup rather than discovering a missing variable three screens
  in. A schema over the env object is the cheap version.
- Defaults belong at that boundary: `BASE_URL: process.env.API_BASE ?? "http://localhost:3001"`.
- Env vars are read once at startup and are strings. Anything that must change
  without a redeploy is not an env var.
- In client bundles, only explicitly public-prefixed variables reach the browser
  — everything else is blank at runtime. Never put a secret behind a public
  prefix, and remember that a value the browser can read is a value anyone can
  read.

## Feature flags vs config

A flag is for something you want to change **at runtime, without deploying**:
staged rollouts, A/B tests, kill switches, per-segment targeting. Config is for
values that are fixed for the lifetime of a deployment.

Do not push ordinary configuration through a flag system — timeouts and batch
sizes as "flags" make every flag evaluation noisier and turn the flag dashboard
into something nobody can read for actual feature state. And flags accumulate:
a flag whose rollout finished is dead code plus a live branch, so removing it is
part of finishing the feature, not a cleanup task for later.
