# deprecation-policy — sources and rationale

Not part of the skill payload. This records where the skill's claims come from,
which of them are contested, and how the contested ones were decided.
Research done 2026-08-06.

---

## Contested calls and how they were decided

### 1. Is a `@deprecated` JSDoc block a "comment"?

**Decision: no — it is a marker, and root `CLAUDE.md`'s no-comments rule does not
reach it.** Confirmed by the repo owner on 2026-08-06.

This was a real fork, and the competing answer was already written down: a
parallel draft of `breaking-change` held that `CLAUDE.md`'s "Do not add comments
to code" is absolute, and that deprecations should therefore live in a
`server/src/vendor/shared/contracts/registry.ts` file with `path`, `since`,
`removeAfter` and `replacedBy` entries.

That reading is defensible on the letter of the rule. It was rejected on three
grounds:

- **Visibility at the call site.** `@deprecated` is understood by tsserver, so
  every call site renders struck through in the editor with no tooling, no lint
  rule, no build step. A registry entry is invisible at the point of use — the
  developer has to already suspect something to go look. The rule this skill
  exists to enforce is "the person deleting it and the person paying for it are
  different people"; a marker that only the first person will ever see does not
  serve that.
- **Coverage.** A contracts registry naturally covers contracts. It fits React
  props, env vars, feature flags and ordinary exported functions badly, and those
  are the majority of deprecations in a repo like this.
- **Drift surface.** `vendor/shared/` is vendored twice, so a registry there is a
  third file to keep in sync, and the one most likely to go stale — nothing
  breaks when it does.

The *intent* of the `CLAUDE.md` rule is against explanatory prose that duplicates
what naming and types should say ("Non-obvious 'why' goes in the module's
`specs/` or `INSIGHTS.md`"). A `@deprecated` block says nothing about what the
code does; it is structured metadata for three consumers — tsserver, the audit
script, and `pr-self-review`. To stop the next agent re-litigating this from the
letter of the rule, the exception is now written into root `CLAUDE.md` rather
than left to inference.

Note that `@migration` points at `<module>/specs/…`, which is exactly where the
rule says the "why" belongs. The marker is a pointer, not a substitute.

### 2. Two removal windows, not one

**Decision: 90 days for public boundaries, 30 for internal, none for
module-local.**

A single window is simpler to state and worse in practice. Applied at 90 days it
makes retiring a private helper a quarter-long project, and people respond by
not retiring anything, or by quietly reclassifying things as module-local. At 30
days it is too short for an HTTP consumer that nobody is currently editing.

The tiers track the distance between the change and the person who pays for it,
which is the only variable that matters. The module-local tier exists so the
policy stays credible: most deletions in a healthy repo genuinely are safe, and a
policy that says "delete it, paste the grep" for those buys the authority to be
strict about the rest.

The 90-day and 30-day figures are conventions chosen here, not values sourced
from a spec — RFC 8594 defines how to *communicate* a sunset date and is silent
on how far out it should be. 90 days was picked as roughly one quarter, long
enough that a consumer who is not currently touching the code still gets a full
planning cycle. Both numbers are minimums, not targets, and either can be
lengthened in a marker without asking anyone.

### 3. No global `/v1` prefix

**Decision: version the endpoint that broke, by name.**

Routes here register flat — `/settings`, `/settings/secrets-status`,
`/repos/:id/pulls` — with no version prefix anywhere. The textbook answer to a
breaking API change is "cut `/v2`", but retrofitting `/v1` onto a flat API in
order to deprecate one endpoint is a far larger break than the one that prompted
it: every client path changes, and every route file needs touching.

So the replacement gets a new *name* that says what changed
(`/settings/providers`), not a version suffix (`/settings/secrets-status-v2`).
A name survives the next change; a number needs incrementing again.

If the API ever grows a version prefix for its own reasons, this decision should
be revisited — at that point `/v2` is the cheaper move.

### 4. Both a version and a date in `@removeAfter`

**Decision: both, always.**

A version alone is the SemVer-native answer and it is what most published
libraries use ("removed in 3.0"). It fails here because nothing in this repo is
released on a schedule — "removed in 0.7.0" is indistinguishable from "someday"
when nobody knows when `0.7.0` ships, and no script can tell you it is overdue.

A date alone is checkable but tells a consumer nothing about which version they
can safely pin to.

Carrying both costs one line and makes the marker answer both questions a
consumer actually has: *does the version I am on still have it*, and *how long do
I have*. The audit script keys off the date because that is the field that can be
compared to `today` without a release process.

### 5. Removal requires date **and** version **and** zero callers

**Decision: all three, and the date is permission rather than obligation.**

The alternative — remove on the date, callers are their own problem — is what
"deprecation policy" means at a large vendor with thousands of anonymous
consumers, where waiting for everyone is impossible. It is the wrong import for a
repo where every consumer is visible, reachable, and usually the same person.
Here, breaking a known live caller on schedule is just a scheduled outage.

Hence the one-extension rule: extend once in writing, and if you need a second
extension, the honest conclusion is that the removal is not actually decided and
should either be dropped or scheduled as its own task.

---

## Sources

Fetched 2026-08-06 unless noted.

| Source | Type | Used for |
|---|---|---|
| [RFC 9745 — The Deprecation HTTP Response Header Field](https://www.rfc-editor.org/rfc/rfc9745.html) | Standards Track, Mar 2025 | `Deprecation` header name and Date-structured-field syntax (`@<unix>`); the `deprecation` link relation; the rule that `Sunset` must not precede `Deprecation` |
| [RFC 8594 — The Sunset HTTP Header Field](https://www.rfc-editor.org/rfc/rfc8594.html) | Informational | `Sunset` header, HTTP-date syntax, the `sunset` link relation for retirement policy |
| [Semantic Versioning 2.0.0](https://semver.org/) | Spec | MAJOR/MINOR/PATCH definitions; §4 — anything may change at any time pre-1.0, which is why minor is the breaking slot here |
| [TypeScript JSDoc reference — `@deprecated`](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) | Docs | That tsserver renders call sites of `@deprecated` symbols struck through with no additional tooling |
| [`@typescript-eslint/no-deprecated`](https://typescript-eslint.io/rules/no-deprecated/) | Docs | Named as the gap-closer if ESLint is ever added; the repo currently has no lint config at all |

Repo facts the skill relies on, verified by reading the tree on 2026-08-06:

- `server/`, `client/` and `reviewer-core/` all carry `"version": "0.0.0"`.
- No ESLint, Biome or other lint config exists in any package — only `typecheck`
  and `test` scripts. Enforcement therefore has to be a script.
- No `@deprecated` marker exists anywhere in `server/src`, `client/src` or
  `reviewer-core/src` today. This skill starts from zero.
- Routes register without a version prefix; `settings/routes.ts` is the shape the
  HTTP examples are drawn from.
- `vendor/shared/` exists twice, and `pr-self-review`'s preflight already compares
  the two copies.

## Boundaries with neighbouring skills

Three skills touch this territory and the split is deliberate:

| Skill | Owns |
|---|---|
| `semver-discipline` | Is this MAJOR/MINOR/PATCH; who does it break; the changelog entry |
| `breaking-change` | Detecting it in the diff; expand → migrate → contract release sequencing; database expand-and-contract; the pre-merge gate |
| `deprecation-policy` | The marker format, the removal window, the mechanics per surface, the audit script |

`breaking-change` and `semver-discipline` were written in a parallel session on
the same day; both now delegate the marker and the window here explicitly. If a
fourth skill starts specifying a marker format, that is the duplication to
collapse first — a second format is worse than no format, because a `grep` that
finds only some of the deprecations reads like a clean repo.
