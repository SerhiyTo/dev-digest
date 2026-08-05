---
name: deprecation-policy
description: How to retire anything that sits on a shared boundary — HTTP endpoints and response fields, `@devdigest/shared` Zod contracts, exported TS symbols and types, React components and props, env vars and feature flags — by announcing it with a versioned, dated `@deprecated` marker and a working replacement, instead of deleting it quietly. Use this skill whenever a change removes, renames, replaces or reshapes something another module, package or client already depends on: deleting an export or an endpoint, renaming a field or a prop, narrowing a response shape, "cleaning up dead code", merging two functions into one, dropping an env var, or retiring a route. Trigger it even when the request is just "delete this", "прибери старий", "нікому не треба" or "почисти" — the whole point is that a silent deletion looks safe to the person making it and expensive to everyone else. Also use it when reviewing a diff whose removed lines touch a shared boundary, when writing or auditing a `@deprecated` marker, and when asked how long something has to stay before it can go. This skill owns the marker format, the removal window and the mechanics per surface; `semver-discipline` owns whether a change is MAJOR, MINOR or PATCH — invoke both together on a removal. It does not decide where code lives (`onion-architecture`, `frontend-ui-architecture`) and does not cover database schema or migrations (`postgresql-table-design`).
version: 1.0.0
metadata:
  scope: shared
  tags: [deprecation, versioning, semver, breaking-changes, api-lifecycle, contracts, sunset, migration]
---

# Deprecation Policy

Deleting code is the only refactor that ships its cost to somebody else. The
author sees a clean diff and a green typecheck; the consumer sees a 404, a Zod
parse error, or an import that resolved yesterday. In this repo that consumer is
usually the other half of the same PR — `client/` calls `server/`, both read the
vendored `@devdigest/shared` contracts, `reviewer-core/` is consumed by name —
and none of those boundaries is protected by a compiler. Three packages, three
lockfiles, one vendored contract folder copied twice: a green `pnpm typecheck`
in `server/` proves nothing about `client/`.

So the rule is not "never delete". It is: **a removal is a two-step change with
a version and a date between the steps.** Announce it where the consumer will
see it, keep the old thing working, then remove it once the window has passed.

This skill decides **how to mark something as going away, how long it stays, and
what has to be true before it can go**.

It works in pairs with `semver-discipline`, which answers a different question:
*is this change MAJOR, MINOR or PATCH, and who does it break?* Ask that one
first — it tells you whether you are looking at a break at all and who the
consumers are. Then come back here for the marker, the window and the mechanics.
Where the two touch, the split is: **`semver-discipline` classifies the change,
this skill specifies the marker it must carry.**

## The default answers

Start here. If your question is on this list you have your answer; the reference
files carry the reasoning and the edge cases.

| Question | Default answer |
|---|---|
| Is this change MAJOR, MINOR or PATCH? | Not this skill's call — `semver-discipline`. Come back here for the marker |
| Can I delete an export nobody in this repo calls? | Only if it is module-local. Crossing a package or module boundary → deprecate first |
| What proves "nobody calls it"? | A `grep` across **all three** packages, pasted into the PR. Not a memory, not a typecheck |
| What does a deprecation consist of? | A working replacement **plus** a marker. A marker alone is a complaint, not a policy |
| What is the marker? | `@deprecated since <ver> — <replacement>` + `@removeAfter <ver> <YYYY-MM-DD>` + `@migration <path>` |
| Are those three lines optional? | No. A marker without a version and a date never gets removed — it becomes furniture |
| Does the no-comments rule in `CLAUDE.md` ban this? | No. That rule bans explanatory prose. This is a machine-read marker — tsserver, the audit script and the PR gate all parse it |
| How long does a public boundary live after being deprecated? | ≥ 90 days **and** into the next major (pre-1.0: ≥ 2 minors) |
| How long does an internal cross-module boundary live? | ≥ 30 days **and** ≥ 1 minor |
| Which version bump does adding a deprecation get? | `minor`. Never `patch` — it changes what the API promises |
| Which version bump does the removal get? | `major` (pre-1.0: `minor`). Never in the same release as the announcement |
| Every `package.json` here says `0.0.0` — what do I write in the marker? | Set that package to `0.1.0` in the same commit. `since 0.0.0` is not a clock |
| How does an HTTP consumer learn about it? | `Deprecation` + `Sunset` + `Link` response headers (RFC 9745 / RFC 8594), on the old route only |
| Can I remove a required field from a Zod contract? | No. Make it `.optional()` first, deprecate it, remove after the window |
| Can I change what the deprecated thing does? | No. It keeps its old behaviour verbatim until it is gone. One change at a time |
| The window expired but callers remain — remove it? | No. Fix the callers or extend the date **once**, in writing. Never break a live caller on schedule |
| Replacement does not exist yet — can I deprecate anyway? | Only with `@deprecated ... — no replacement; <reason>`. Without a reason it reads as an oversight |
| Where do I record the migration? | `<module>/specs/YYYY-MM-DD-<slug>.md`, referenced from the marker |
| How do I check nothing is overdue? | `bash .claude/skills/deprecation-policy/assets/deprecation-audit.sh` |

## Step 0 — does this even need a deprecation?

Ceremony applied to everything gets ignored everywhere. Only three tiers exist,
and most deletions are the third.

| Tier | What it covers | What you owe |
|---|---|---|
| **Public boundary** | HTTP routes and response fields; anything exported from `vendor/shared/` (both copies); `reviewer-core/`'s public entry points | Full marker, ≥ 90 days, removal in the next major (pre-1.0: ≥ 2 minors) |
| **Internal boundary** | A symbol imported by another module or package; a shared React component or one of its props; an env var or feature flag | Full marker, ≥ 30 days, removal ≥ 1 minor later |
| **Module-local** | Used only inside its own folder, and nothing outside imports it | **Delete it.** Paste the grep in the PR description and move on |

The grep is the whole decision procedure, and it must cross package lines
because nothing else does:

```bash
rg -n --type ts --type tsx '\bbuildPrBrief\b' server/src client/src reviewer-core/src e2e
```

Two consequences worth internalising. A symbol that lives in
`server/src/modules/reviews/helpers.ts` and is imported by
`server/src/modules/pulls/` is **not** module-local — module boundaries are real
here even inside one package. And a contract in `vendor/shared/` is public even
if today only one caller exists, because the folder's entire purpose is to be
copied into another package.

## The marker

One shape, everywhere, so that one `grep` finds all of them:

```ts
/**
 * @deprecated since 0.4.0 — use {@link buildPrBriefV2} instead
 * @removeAfter 0.6.0 2026-11-04
 * @migration server/specs/2026-08-06-brief-v2.md
 */
export function buildPrBrief(diff: Diff): PrBrief {
```

Three lines, each earning its place:

- **`@deprecated since <version> — <replacement>`** — the tag TypeScript itself
  understands, so every call site gets struck through in the editor without any
  extra tooling. `since` answers "is my pinned version affected?".
- **`@removeAfter <version> <YYYY-MM-DD>`** — both, not either. The version is
  what a consumer pins; the date is what makes the promise checkable by a script
  on a day when nobody has released anything. A version alone in a repo that
  releases irregularly means "someday".
- **`@migration <path>`** — where the consumer goes next. A deprecation without
  an escape route just relocates the work to whoever is unlucky enough to hit it.

When there is genuinely no replacement, say so and say why — the reader's next
question is always "so what do I do instead?":

```ts
/**
 * @deprecated since 0.4.0 — no replacement; briefs are assembled by the agent now
 * @removeAfter 0.6.0 2026-11-04
 * @migration server/specs/2026-08-06-brief-v2.md
 */
```

Surfaces that are not TypeScript symbols carry the same three fields in their own
idiom — HTTP headers, an env-schema entry, a `Warning` in a dev build. The
mapping for each is in `references/surfaces.md`; the fields never change.

## Versioning

`semver-discipline` decides the level of a change — a removal is MAJOR, an
announcement is MINOR, and it can tell you which of the two you are actually
holding. What follows is only what a **deprecation** additionally requires: the
two version numbers a marker has to name, and the rule that keeps them apart.

Every deprecation is anchored to two version numbers, so the package has to have
a real one. Today all three read `"version": "0.0.0"`, which is not a version but
a placeholder — `since 0.0.0` and `@removeAfter 0.0.0` are indistinguishable and
neither can ever be "reached".

**The first deprecation in a package is also the commit that gives that package a
version.** Set it to `0.1.0` in `package.json`, in the same commit as the marker.
One line, and every marker written afterwards means something.

Which bump the change gets:

| Change | 0.x | ≥ 1.0 |
|---|---|---|
| Add the replacement, old path untouched | minor (`0.4.0` → `0.5.0`) | minor |
| Mark the old thing deprecated | minor — never patch | minor — never patch |
| Remove it | minor, **≥ 2 minors after the announcement** | **major** |
| Fix a bug in something already deprecated | patch | patch |

Pre-1.0, SemVer puts breaking changes in the minor slot, so `minor` does double
duty: it is both the announcement bump and the removal bump. The rule that keeps
that honest is the one in bold — **announcement and removal never share a
release.** A consumer who upgrades one version at a time must land on at least
one version where the old thing still works *and* the warning is visible.
Otherwise the deprecation was never announced; it was narrated after the fact.

Marking something deprecated is never a patch. Patch means "same API, fewer
bugs"; a deprecation changes what the API promises about its own future, and on
a typed boundary it changes editor and lint output at every call site.

Longer treatment — what counts as breaking, how to bump the vendored contracts
that have no `package.json` of their own, and what to do when a window expires
with callers still live — is in `references/lifecycle.md`.

## Removal windows

| Boundary | Minimum calendar time | Version condition |
|---|---|---|
| Public (HTTP, `vendor/shared/`, `reviewer-core` entry points) | 90 days | next major; pre-1.0: ≥ 2 minors |
| Internal (cross-module export, shared component/prop, env var, flag) | 30 days | ≥ 1 minor |
| Module-local | none | none — delete it |

**Both conditions, plus zero remaining call sites.** The date passing is
permission to remove, not an obligation: if a caller is still there on the day,
the answer is to fix the caller, or extend `@removeAfter` **once** with the new
date and the reason recorded in the migration spec. Shipping a break on schedule
because the calendar said so is the same outage as the silent delete, just
better documented.

The removal commit deletes the old symbol *and* its marker, and updates the
migration spec to say it is done. A marker left behind after the code is gone is
the same lie in the other direction.

## Good / bad

**1. Deleting a shared helper**

```ts
// ✗ Bad — clean diff, green typecheck, broken import in client/
-export function formatSeverity(f: Finding): string { ... }
```

```ts
// ✓ Good — replacement first, old path intact, clock started
export function formatSeverityLabel(f: Finding, locale: Locale): string { ... }

/**
 * @deprecated since 0.5.0 — use {@link formatSeverityLabel}, which takes a locale
 * @removeAfter 0.7.0 2026-09-05
 * @migration client/specs/2026-08-06-severity-locale.md
 */
export function formatSeverity(f: Finding): string {
  return formatSeverityLabel(f, 'en');
}
```

The old function delegates rather than duplicating. Two bodies drift; one body
with a shim cannot.

**2. Renaming a contract field**

```ts
// ✗ Bad — a rename is a delete plus an add. Every stored payload now fails to parse.
export const Intent = z.object({
- in_scope: z.array(z.string()),
+ inScope: z.array(z.string()),
});
```

```ts
// ✓ Good — both accepted, old one optional and marked, removal dated
export const Intent = z.object({
  /**
   * @deprecated since 0.5.0 — use `inScope`
   * @removeAfter 0.7.0 2026-11-04
   * @migration server/specs/2026-08-06-intent-camel-case.md
   */
  in_scope: z.array(z.string()).optional(),
  inScope: z.array(z.string()).optional(),
});
```

Widening never breaks a reader; narrowing always can. Note the marker is edited
in **both** vendored copies — `server/src/vendor/shared/` and
`client/src/vendor/shared/` — in the same commit, or the two halves of the repo
disagree about what the contract says.

**3. Retiring an endpoint**

```ts
// ✗ Bad — the route is gone; the client finds out in production
-app.get('/settings/secrets-status', async (req) => { ... });
```

```ts
// ✓ Good — new route added, old route answers and announces its own end
app.get('/settings/secrets-status', async (req, reply) => {
  reply.header('Deprecation', '@1793491199');
  reply.header('Sunset', 'Wed, 04 Nov 2026 23:59:59 GMT');
  reply.header('Link', '</specs/2026-08-06-secrets-status.md>; rel="deprecation"');
  return secretsStatus(req);
});
```

`Deprecation` (RFC 9745) says it is deprecated as of a moment; `Sunset`
(RFC 8594) says when it stops answering, and must never be earlier than
`Deprecation`. Headers reach the one audience a JSDoc tag never will: a client
that is already deployed.

**4. A marker with no clock**

```ts
// ✗ Bad — real intent, zero mechanism. Nothing can tell you this is overdue.
/** @deprecated use the new one */
```

```ts
// ✓ Good — the audit script can act on every one of these fields
/**
 * @deprecated since 0.5.0 — use {@link buildPrBriefV2}
 * @removeAfter 0.7.0 2026-11-04
 * @migration server/specs/2026-08-06-brief-v2.md
 */
```

Six more pairs — React props, env vars, feature flags, deprecating a whole
module, the "deprecate and fix a bug in one commit" trap, and removal-day
mechanics — are in `references/examples.md`.

## Anti-patterns

| Smell | Why it hurts | Instead |
|---|---|---|
| Silent delete because "the typecheck is green" | One package's typecheck says nothing about the other two, and nothing at all about deployed clients | Run the cross-package grep; deprecate if it crosses a boundary |
| `@deprecated` with no `since`/`@removeAfter` | Cannot be audited, so it never expires. The codebase fills with permanently-dying code | All three lines, always |
| Deprecating something whose replacement is not merged yet | The consumer is told to leave, with nowhere to go | Merge the replacement first, or state `no replacement; <reason>` |
| Announcement and removal in the same release | Nobody ever saw the warning; the window existed only on paper | Removal is a separate, later release |
| Changing behaviour of the deprecated thing "while we're here" | The consumer now has two problems and no stable reference point | Freeze it. Bug fixes only |
| Removing on the date with live callers | The scheduled version of the same outage | Fix the callers, or extend once in writing |
| Rename via delete + add | A rename is a breaking change wearing a friendly word | Add the new name, shim the old, date the removal |
| Marker left behind after removal | Sends readers to a symbol that no longer exists | Removal deletes code, marker, and closes the spec |

## Enforcement

```bash
bash .claude/skills/deprecation-policy/assets/deprecation-audit.sh
```

Scans `server/src`, `client/src` and `reviewer-core/src` for `@deprecated`, and
fails on markers that are malformed, missing `@removeAfter`, or past their date.
Markers due within 14 days are reported as warnings. Exit code is non-zero on
any error, so it works as a CI step or a pre-PR check; `pr-self-review` routes
diffs with removed lines here.

There is no ESLint in this repo, so no lint rule flags call sites of a deprecated
symbol. Editors do it via tsserver (strikethrough) and the audit script covers
the calendar; if ESLint is ever added, `@typescript-eslint/no-deprecated` closes
the remaining gap.

## Where to read next

| You need | Read |
|---|---|
| What counts as breaking, version bumps in depth, the vendored-contract case, expired windows | `references/lifecycle.md` |
| The exact recipe per surface: HTTP, Zod contracts, TS exports, React props, env vars and flags | `references/surfaces.md` |
| Ten good/bad pairs drawn from this repo's own files | `references/examples.md` |
| Whether the change is MAJOR/MINOR/PATCH, who it breaks, the changelog entry | `semver-discipline` |
| Which release each step ships in, database expand-and-contract, the merge gate | `breaking-change` |

Where a shortened `@deprecated` line appears elsewhere in the repo's docs, the
three-line form above is the one to write — it is the shape the audit script
parses and the only one that can expire.
