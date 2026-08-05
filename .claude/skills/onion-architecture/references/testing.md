# Testing: what each ring lets you test without

## The rings decide what you can leave out

Cockburn's stated intent for ports and adapters is being able to develop and
test "in isolation from its eventual run-time devices and databases." That is
the payoff the dependency rule buys, and it is measurable: for each ring, how
much do you have to start up to run a test?

| Test | Needs | Lives in |
|---|---|---|
| Ring 0–1: contracts, domain rules | nothing | `test/*.test.ts` |
| Ring 2: use case with fake ports | nothing | `test/*.test.ts` |
| Ring 4: route behaviour via `inject()` | `buildApp()` + overrides | `test/routes-*.test.ts` |
| Ring 3: repository / real SQL | Docker + Postgres | `test/*.it.test.ts` |

The `.it.test.ts` suffix is load-bearing — CI runs the two lanes with different
flags (`--exclude '**/*.it.test.ts'` vs `vitest run .it.test`). A DB-backed test
without the suffix breaks the fast lane.

## Use-case tests are the ones the rules exist for

Fowler's pyramid argues for many fast low-level tests and few broad ones,
because broad tests are slow, brittle and non-deterministic enough to erode
trust. His "subcutaneous" tier — testing just below the UI — maps exactly onto
ring 2.

That tier is currently empty in this repo, and the reason is structural, not
cultural: `new ReviewService(container)` requires a whole `Container` and then
constructs its own repository internally, so there is nothing to substitute.
Every service test is therefore an integration test. Fixing the constructor
(`wiring.md`) is what unlocks this row of the table.

```ts
const runs: RunStore = {
  findStale: async () => [{ id: 'r1', startedAt: hoursAgo(3) }],
  markFailed: async (id, reason) => { failed.push({ id, reason }); },
};

const service = new ReviewService(runs, fakeLlm, fixedClock);
await service.reapStaleRuns();
expect(failed).toEqual([{ id: 'r1', reason: 'stale' }]);
```

Hand-written fakes, not `vi.mock`. A fake implements the port, so the compiler
tells you when the port changes; a module mock silently keeps passing against an
interface that no longer exists. (Vitest's own docs make no claim either way
here — the argument is Seemann's and Fowler's, not Vitest's.)

## Adapter substitution stays at the container

`ContainerOverrides` is the seam for the *outside world*: `secrets`, `auth`,
`github`, `git`, `codeIndex`, `embedder`, `llm`, `repoIntel`, `depgraph`,
`tokenizer`. `src/adapters/mocks.ts` already provides `MockLLMProvider`,
`MockGitHubClient` and `MockGitClient`.

`server/CLAUDE.md` states the rule as "mock the container, not the modules," and
it stays true. Port injection at the constructor is a *second, inner* seam, not
a replacement — one substitutes infrastructure, the other substitutes
persistence and time.

## Route tests run the whole stack without a socket

`buildApp({ config, overrides })` plus `app.inject()` boots every plugin and
exercises the real validation, serialization and error mapping. postgres-js
connects lazily, so routes that never touch the database need no container at
all — `test/routes-smoke.test.ts` is the pattern.

Use this tier for what is genuinely ring 4: status codes, the
`{ error: { code, message, details } }` envelope, schema rejection, auth
context. Do not use it to test business rules; that is a slow way to get a worse
assertion.

## Integration tests prove the repository, not the rules

`test/helpers/pg.ts` starts `pgvector/pgvector:pg16` via testcontainers, runs
migrations and hands back a `DbHandle`; `dockerAvailable()` lets the suite skip
cleanly when Docker is absent.

Milovic's rule is the right instinct and matches what this repo already does:
never test against a different database than production, because mocking SQL
"hides bugs." So the repository tier is real Postgres — but keep it to one
integration test per data-backed workflow (`TESTING.md`), not one per branch.
The branches belong in ring 1 where they cost milliseconds.

If a global container is ever introduced, note that Vitest's `globalSetup` runs
in a different global scope — the connection info has to travel via
`provide`/`inject()`, not a module-level variable.

## What a new slice should ship

- Contract test if the contract is non-trivial.
- Unit tests for every rule in `domain.ts`.
- One use-case test per meaningful path, with fakes.
- One `*.it.test.ts` covering the repository against real Postgres.
- A route test only where the HTTP behaviour itself is interesting.

If a slice has no `domain.ts` and no `ports.ts`, the middle two rows disappear
and that is legitimate — but then the slice had better be genuinely trivial. A
slice with real rules and only integration tests is the signal that the rings
were skipped rather than earned.
