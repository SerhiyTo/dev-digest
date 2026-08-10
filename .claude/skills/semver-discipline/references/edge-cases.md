# Edge cases

The cases where the three questions in `SKILL.md` produce an answer people argue
with. Each one has a default — take it unless you can state why this instance
differs.

**Contents**

- [Pre-1.0 (`0.x`)](#pre-10-0x)
- [Unpublished and internal packages](#unpublished-and-internal-packages)
- [The bug fix that breaks someone](#the-bug-fix-that-breaks-someone)
- [Security fixes](#security-fixes)
- [Undocumented and "private" behaviour](#undocumented-and-private-behaviour)
- [Dependency bumps](#dependency-bumps)
- [Vendored and mirrored code](#vendored-and-mirrored-code)
- [Pre-releases and unreleased work](#pre-releases-and-unreleased-work)
- [Runtime, platform and toolchain](#runtime-platform-and-toolchain)
- [Behaviour that is not in any signature](#behaviour-that-is-not-in-any-signature)
- [Feature flags](#feature-flags)

---

## Pre-1.0 (`0.x`)

Semver gives `0.x` an exemption: anything may change at any time. Consumers do
not experience the exemption — their build breaks exactly as hard.

**Default:** run the same analysis and report the same level, then map it:
`MAJOR → 0.(y+1).0`, `MINOR → 0.y.(z+1)`, `PATCH → 0.y.(z+1)`. Say it as
`MAJOR (→ 0.4.0 while pre-1.0)`.

What `0.x` legitimately buys you is skipping the deprecation window — it does not
buy silence. Announce the break, write the migration, skip the two-step. The
moment you have a consumer you did not write, treat `0.x` as `1.x` regardless of
the number.

## Unpublished and internal packages

Nothing in this repo is published and every package sits at `0.0.0`, so no
registry will stop anything. This changes what you *do*, not what you *report*.

**Default:** classify normally. On a MAJOR, the deliverable is the verdict plus
the migration note, and the fix usually lands in the same PR as the break. That
is the advantage of a monorepo-shaped codebase — take it, but only after
confirming that *every* consumer really is in this repo. A stored database row,
an in-flight deployment, and a cached client bundle are all consumers you cannot
edit in the same commit.

## The bug fix that breaks someone

Two reflexes, both wrong: "behaviour changed, so MAJOR", and "it was a bug, so
PATCH — they should not have relied on it".

**Default: PATCH.** Fixing a defect is what patches are for.

**Escalate to MAJOR when any of these hold:**

- The wrong value was persisted, so fixing forward leaves bad rows behind.
- Consumers branch on the buggy value (grep before asserting they do not).
- The bug lasted long enough to become the documented behaviour.
- The "fix" is a judgement call about intent, not a clear defect.

Whichever way you go, say both halves: *"the old value was wrong"* **and**
*"here is who was depending on it"*. A verdict that only argues correctness has
skipped the analysis.

## Security fixes

A fix that closes a vulnerability may be breaking — tightened validation, a
revoked default permission, a new required credential — and the security value
does not make it non-breaking.

**Default:** classify honestly, ship promptly, and do not hold the fix behind a
deprecation window. Label it in the changelog so consumers can tell an urgent
break from a routine one:

```markdown
### Breaking (security)
- `POST /repos/:id/import` now requires a `token` with `repo:read`. Calls with
  a broader-scoped legacy token are rejected. CVE-…, see the migration note.
```

The one exception to "announce loudly": while an embargo is active, publish the
fix before the detail. Do not let the embargo turn into a silent break — the
entry goes in as soon as the embargo lifts.

## Undocumented and "private" behaviour

"It was internal" is a claim about reachability, and reachability is checkable.

**Default:** PATCH — *after* verifying nothing reaches it. Grep the symbol, check
the barrel files, check whether a `dist` or deep path exposes it, check test
fixtures. In this repo, `vendor/shared/index.ts` re-exports broadly, so a
contract that looks module-local is often public through the barrel.

If it is reachable and something reaches it, it is public regardless of naming,
`_` prefixes, or intent. Classify against reality.

## Dependency bumps

**Default:** a dependency's level does not pass through to yours. What matters is
whether *your* surface changed.

| Situation | Level |
|---|---|
| Bump a dependency, your surface unchanged | PATCH |
| Bump a dependency whose types appear in your exports | MAJOR if those types changed |
| Bump a **peer** dependency's supported range | MAJOR — consumers must upgrade in step |
| Raise a minimum version of a required runtime or service | MAJOR |
| Transitive-only bump, e.g. a lockfile refresh | PATCH |

The trap is a dependency's types leaking into your public API — a Zod major, a
Drizzle row type in an exported signature. Then their MAJOR is your MAJOR, even
though your source did not change.

## Vendored and mirrored code

`@devdigest/shared` lives in `server/src/vendor/shared/` and is mirrored to
`client/src/vendor/shared/`. The mirror is not a copy for convenience; it is the
client's only view of the contract.

**Default:** the two sides move in the **same commit**. A contract edited on one
side only is a break that no version number describes — the client compiles
against a schema the server no longer speaks. `pr-self-review` flags the drift;
this skill's job is to say what the drift costs.

The same rule covers any duplicated definition: an error-code list repeated in
two modules, an enum mirrored between server and e2e fixtures. Duplicated
definitions are one surface with two edit sites.

## Pre-releases and unreleased work

**Default:** while a version is unreleased, edits to it do not each get their own
bump. Amend the pending entry.

Once released — tagged, deployed, or consumed by another module in the repo — it
is frozen. The next change gets its own classification. "Nobody has upgraded yet"
is not a reason to rewrite a shipped version; it is a reason to ship the fix
quickly.

Pre-release identifiers (`3.0.0-rc.1`) let you publish a MAJOR for testing
without promising stability. Useful when the migration is large enough that
consumers want to try it before you cut the final tag.

## Runtime, platform and toolchain

| Change | Level |
|---|---|
| Raise the minimum Node / Postgres / browser version | MAJOR |
| Add support for a new runtime | MINOR |
| Drop support for a runtime | MAJOR |
| Change build output format (CJS → ESM, target downlevel) | MAJOR |
| Change TypeScript `target`/`lib` in a way that alters emitted types | MAJOR |
| Bump a dev-only tool (linter, test runner, bundler) | PATCH |

Dev-only means dev-only: if the bundler change alters what consumers receive, it
is not dev-only.

## Behaviour that is not in any signature

Timing, ordering, concurrency, retries, idempotency and side effects break
consumers without touching a type.

| Change | Level |
|---|---|
| Sync → async, or eager → lazy | MAJOR |
| An operation stops being idempotent | MAJOR |
| Results become unordered where the order was documented | MAJOR |
| Results become unordered where the order was never documented | MINOR — document it now |
| Add a retry with backoff to a previously single-shot call | MINOR, MAJOR if it changes observable timeouts |
| Add a side effect (writes a row, emits an event, calls out) | MAJOR |
| Remove a side effect anyone can observe | MAJOR |
| Make something faster or use less memory | PATCH |

Ask question 3 from `SKILL.md` here especially: *does the consumer have to do
anything?* Waiting differently is doing something.

## Feature flags

**Default:** a change that ships dark behind a default-off flag is MINOR — no
consumer's behaviour moves. The classification lands on the flip.

Which means: **turning a flag on by default is the MAJOR**, and it deserves its
own entry even though the code shipped weeks earlier. The commonest way a break
escapes classification is arriving in a release where the diff is one boolean.
