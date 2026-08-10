# Lifecycle — versions, the vendored case, expired windows

Everything the `SKILL.md` tables state without arguing for it.

**Contents**

- [Replace → Announce → Remove](#replace--announce--remove)
- [What counts as breaking](#what-counts-as-breaking)
- [Version bumps in depth](#version-bumps-in-depth)
- [Bootstrapping a version](#bootstrapping-a-version)
- [The vendored-contract case](#the-vendored-contract-case)
- [When a window expires with callers still live](#when-a-window-expires-with-callers-still-live)
- [Removal day](#removal-day)
- [The migration spec](#the-migration-spec)

---

## Replace → Announce → Remove

Three acts, in this order, and the order is not negotiable.

**Replace.** The new path is merged and works before anything is marked. A
deprecation whose replacement is not usable yet tells the consumer to leave with
nowhere to go, and the only honest version of that is
`@deprecated ... — no replacement; <reason>`.

**Announce.** The marker goes on. The old path keeps its old behaviour verbatim
from this moment until it is gone — bug fixes only. This is the act that starts
the clock.

**Remove.** After the window, in a later release, in its own commit.

### What starts the clock

**`since` is the version the marker shipped in, not the version the replacement
appeared in.** Those are often the same release; when they are not, the earlier
one does not count. A consumer's clock starts when they can *see* the warning,
which is when the marker is in a release they can install.

Three consequences that catch people out:

- **Writing the marker is not announcing it.** An unmerged branch announces
  nothing. If the marker sits in review for three weeks, those three weeks are
  not part of the window.
- **`@removeAfter` is an absolute date, so it must be written relative to the
  merge, not the drafting.** A marker drafted on the 1st, merged on the 20th,
  carrying a date 30 days from the 1st, gives the consumer ten days.
- **A window cannot start before the replacement exists.** If the replacement
  lands in `0.5.0` and the marker in `0.6.0`, the clock starts at `0.6.0`.

## What counts as breaking

Not this skill's call — `semver-discipline` owns it, and
`.claude/skills/semver-discipline/references/breaking-catalog.md` has a row for
nearly every change you can make to a Zod contract, an HTTP route, an export, a
type, a column or an env var. Ask it first.

What this skill needs from that answer is narrower: **is the old thing still
reachable by somebody who is not rebuilt by this PR?** That question has a
mechanical answer and it is the one that decides whether a marker is required.

```bash
rg -n --type ts '\bbuildPrBrief\b' server/src client/src reviewer-core/src e2e
```

Three traps in reading that output:

- **A barrel makes it public.** A symbol in `reviewer-core/src/review/run.ts` is
  module-local; the same symbol re-exported from `reviewer-core/src/index.ts` is
  a public entry point. Grep the barrel, not just the definition.
- **A string reference is invisible to the type system.** Route paths live inside
  `fetch` template literals. Grep the path, not the handler.
- **`vendor/shared/` is public by construction.** The folder exists to be copied
  into another package, so a contract with exactly one caller today is still a
  public boundary.

And one that no grep answers: `reviewer-core` is consumed by a CI runner
documented in `reviewer-core/src/index.ts` that is **not in this tree**. For that
package a clean grep is necessary, not sufficient.

## Version bumps in depth

| Change | 0.x | ≥ 1.0 |
|---|---|---|
| Add the replacement, old path untouched | minor | minor |
| Mark the old thing deprecated | minor — never patch | minor — never patch |
| Remove it | minor, ≥ 2 minors after the announcement | major |
| Fix a bug in something already deprecated | patch | patch |
| Extend a `@removeAfter` date | patch — the API did not change, the promise did |

**Why a deprecation is never a patch.** Patch means "same API, fewer bugs" — safe
to take blindly. A deprecation changes what the API promises about its own
future, and on a typed boundary it changes observable output at every call site:
tsserver strikes the symbol through, and `deprecation-audit.sh` starts counting
down. A consumer who took it blindly gets new warnings in a release that
promised none.

**Why announcement and removal never share a release.** A consumer who upgrades
one version at a time must land on at least one version where the old thing still
works *and* the warning is visible. If `0.6.0` both announces and removes, the
warning was never announced — it was narrated after the fact. This is the rule
pre-1.0 makes easy to violate, because `minor` does double duty as both the
announcement bump and the removal bump.

The rule is about **releases**, not about calendar time, and it is independent of
the window. Ninety days of `@removeAfter` protects nobody if all three steps ship
in one release. `breaking-change` owns that sequencing; this skill owns the clock.

## Bootstrapping a version

Every package here reads `"version": "0.0.0"` — `@devdigest/api`,
`@devdigest/web`, `@devdigest/reviewer-core`, `@devdigest/e2e`. That is a
placeholder, not a version: `since 0.0.0` and `@removeAfter 0.0.0` are
indistinguishable, and neither can ever be reached.

**The first deprecation in a package is also the commit that gives that package a
version.** Set it to `0.1.0` in `package.json`, in the same commit as the marker.
One line, and every marker written afterwards means something.

Do not bootstrap a package you are not deprecating anything in. A version number
nobody increments is the same placeholder with a different value.

## The vendored-contract case

`@devdigest/shared` has no `package.json`. It is a folder —
`server/src/vendor/shared/` — copied byte-identically to
`client/src/vendor/shared/`. So which version does a marker inside it name?

**`server/package.json`.** The server copy is canonical (root `CLAUDE.md`), so the
contract's clock is the API's clock. Three consequences:

1. **The marker is byte-identical in both copies**, like every other line in that
   folder. The `client/` copy therefore also names the *server's* version. That
   reads oddly for a second and is correct: there is one contract, so there is one
   number, and which file you happened to open does not change it.
2. **Editing one copy and not the other is not a partial deprecation, it is
   drift.** `pr-self-review`'s `check_contract_mirror` fails the PR. Both copies
   change in the same commit or neither does.
3. **Deprecating a contract field bumps `server/package.json`**, even when the
   only consumer you had in mind was the client.

A field cannot simply be marked, either. A required field with a marker is still
required, and a consumer that stops sending it fails validation — so the marker
and `.optional()` land together:

```ts
export const ConventionCandidate = z.object({
  id: z.string(),
  /**
   * @deprecated since 0.5.0 — use `evidence`, which carries line ranges
   * @removeAfter 0.7.0 2026-11-04
   * @migration server/specs/2026-08-06-convention-evidence.md
   */
  evidence_path: z.string().optional(),
  evidence: z.array(ConventionEvidence),
});
```

Widening the old field is what makes the two paths coexist. Narrowing is the
break; loosening never is.

## The windows, and why those lengths

| Boundary | Calendar | Version condition |
|---|---|---|
| Public — HTTP, `vendor/shared/`, `reviewer-core` entry points | 90 days | next major; pre-1.0: ≥ 2 minors |
| Internal — cross-module export, shared component or prop, env var, flag | 30 days | ≥ 1 minor |
| Module-local | none | none — delete it |

The numbers are not arbitrary, and knowing what each one is buying makes it
obvious when to exceed it.

**90 days, public.** The consumer is something you cannot recompile: a deployed
browser bundle, a CI runner built from another tree, a stored payload. You are
not waiting for a code change, you are waiting for a *deploy cycle you do not
control*, plus the vacation of whoever owns it. Ninety days is roughly one
quarter — the smallest unit of planning most teams actually have.

**30 days, internal.** The consumer is in this repo and you could migrate it
yourself. The window is not for the migration, it is for the branches already in
flight: someone rebasing a two-week-old branch onto a symbol you deleted gets a
conflict they did not cause. Thirty days clears the queue.

**None, module-local.** Nothing outside the folder can reach it, so there is no
consumer to protect and the ceremony would be pure cost. This tier exists to keep
the other two credible — a policy that applies to everything gets ignored
everywhere.

**The version condition is the part that is easy to satisfy on paper and easy to
break in practice.** Both conditions must hold, plus zero remaining call sites.
Ninety days with all three acts in one release protects nobody: there is no
version a consumer can sit on where the old path works and the warning is
visible. `breaking-change` owns that sequencing.

**When to exceed the window.** The lengths are minimums keyed to the consumer's
deploy cycle, so an unusually slow consumer justifies a longer date up front —
which is free, and much better than extending later.

## When a window expires with callers still live

The date passing is **permission to remove, not an obligation**. There are
exactly two honest moves:

1. **Fix the callers.** Usually right, usually smaller than it looked.
2. **Extend `@removeAfter` once**, with the new date and the reason written into
   the migration spec named by `@migration`. Not in the commit message, where
   nobody looking at the marker will find it.

"Once" is doing real work in that sentence. A second extension means the
replacement is not actually usable, and the honest response is to say so and
withdraw the deprecation rather than move the date a third time. A marker that
has slipped twice teaches everyone that markers do not mean anything.

What is never a move: **removing on the date because the date said so.** That is
the same outage as the silent delete, arriving on schedule with documentation.

`deprecation-audit.sh` reports an overdue marker as an ERROR and exits non-zero,
so an expired window blocks CI until somebody makes one of those two decisions.
That is the point — the alternative is a marker that quietly ages forever.

## Removal day

The removal commit does four things, and a review should check for all four:

1. deletes the symbol, route, column-read, prop or key;
2. deletes its marker — a marker outliving its subject points readers at nothing;
3. updates the `@migration` spec to record that the removal happened;
4. bumps the version per the table above.

Then re-run the audit. A clean run after a removal is the evidence that step 2
actually happened:

```bash
bash .claude/skills/deprecation-policy/assets/deprecation-audit.sh
```

## The migration spec

`@migration` points at a file, and that file is the only place a consumer can go
to find out what to do. It lives at `<module>/specs/YYYY-MM-DD-<slug>.md`, next to
the module's other specs.

Keep it short. It is a set of instructions, not a design document:

````markdown
# Deprecating `FindingRecord.dismissed_at`

Status: announced in 0.5.0 (2026-08-06) · removal in 0.7.0, after 2026-11-04

## What changed
`dismissed_at` is replaced by `rejected_at`. Same value, same semantics; the
name was wrong once the action stopped being reversible.

## What you have to do
Read `rejected_at`. During the window both fields are populated and identical,
so a consumer can switch at any point without coordinating with the server.

```ts
- const at = finding.dismissed_at;
+ const at = finding.rejected_at;
```

## Consumers
- `client/src/app/repos/[repoId]/pulls/helpers.ts` — migrated in #142

## Log
- 2026-08-06 announced in 0.5.0
- 2026-11-06 removed in 0.7.0
````

Three parts do real work. **Status** is the line a reader checks first and the one
that must be updated on removal day. **What you have to do** is a diff, not prose
— a consumer should be able to copy it. **Log** is where an extension gets
recorded, with its reason; a date that moves with no entry here is a date that
moved for no reason.

The spec is created in the same commit as the marker. A `@migration` pointing at
a file that does not exist is caught by `deprecation-audit.sh` as a warning, and
it is exactly the kind of warning that is still there a year later.
