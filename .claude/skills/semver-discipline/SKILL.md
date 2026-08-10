---
name: semver-discipline
description: Decides whether a change is MAJOR, MINOR or PATCH by what it costs the people who already depend on it, and writes the verdict, the migration note and the changelog entry that follow. Use this skill whenever a change touches something another party already consumes — a Zod contract in vendor/shared, an HTTP route or response shape, a reviewer-core export, a database column, an env var, a CLI flag, a public type, or a skill's own interface — and whenever the user asks "is this breaking", "which version bump", "can I rename this field", "do I need a major", "is it safe to remove this", how to write a changelog entry, how to deprecate something, or how to cut a release. Trigger it even when versioning is never mentioned: proposing a rename, a removal, a newly required field, a tightened validation, a changed default, a narrowed enum or a new error code IS a versioning decision whether or not anyone bumps a number. Complements onion-architecture (where code lives) and pr-self-review (the pre-merge gate); this skill owns the breaking / non-breaking call and everything downstream of it.
version: 1.1.0
user-invocable: true
metadata:
  scope: shared
  tags: [semver, versioning, breaking-changes, api-contracts, changelog, deprecation, release, compatibility]
---

# Semver Discipline

Nobody sets out to break a consumer. What happens is smaller: the diff was four
lines, the rename was obviously an improvement, the field was "basically
internal", and the release went out as a patch. Three days later somebody else's
build is red and no version number predicted it.

The number is not a description of your work. It is a promise about **their**
work: *patch* means take it blindly, *minor* means take it and read later,
*major* means stop and budget time. This skill decides which promise a change
makes, and refuses to let the size of the diff answer that question.

**This skill owns one question: what level is this change, and who pays for it.**
Everything downstream of the verdict belongs to a companion skill, and each of
them calls back here for the level rather than deciding it itself:

| Skill | Owns |
|---|---|
| `semver-discipline` (here) | The MAJOR / MINOR / PATCH call, the evidence for it, the changelog entry |
| `deprecation-policy` | The `@deprecated` marker and how long the old path must stay |
| `breaking-change` | Detection in the diff, the version registry, the expand → migrate → contract rollout |
| `pr-self-review` | Whether the PR may merge |

Ask this one first: until you know whether there is a break and whom it lands
on, there is nothing to deprecate, stage or block. Do not invent a marker format
or a rollout sequence here — classify, then hand off. It also does not decide
where code lives (`onion-architecture`, `frontend-ui-architecture`) or how to
write a Zod schema (`zod`).

## The default answers

If your question is here, you have your answer. The references carry the
reasoning and the edge cases.

| Question | Default answer |
|---|---|
| Rename a field, export, route or column? | **MAJOR.** A rename is a removal plus an addition |
| Remove anything reachable by a consumer? | **MAJOR** |
| Add a new **optional** field / export / route? | **MINOR** |
| Add a new **required** request field? | **MAJOR** — every existing caller is now invalid |
| Make an optional field required? | **MAJOR** |
| Make a required field optional? | **MAJOR** for output, **MINOR** for input |
| Add a value to an enum? | **MINOR** for input, **MAJOR** for output |
| Remove a value from an enum? | **MAJOR** either way |
| Tighten a validation rule (`.min`, `.email`, `.strict`)? | **MAJOR** — data that passed yesterday fails today |
| Loosen a validation rule? | **MINOR** |
| Change a default value? | **MAJOR** — silent behaviour change is the worst kind |
| Change an error code, status or error shape? | **MAJOR** if anyone branches on it |
| Add a response field? | **MINOR** — unless the schema is `.strict()` or the type is exhaustively matched |
| Fix a bug that consumers worked around? | Judged by blast radius, not by who was right — see `references/edge-cases.md` |
| Performance, logging, internal refactor, docs? | **PATCH** |
| Change something private? | **PATCH** — if it is genuinely unreachable. Verify, do not assume |
| Deprecate something? | **MINOR.** Removal is the MAJOR, and it comes later — marker and window in `deprecation-policy` |
| Version is `0.x`? | Same analysis. Report `MAJOR (→ 0.y+1 while pre-1.0)` — never suppress the finding |
| Several changes in one release? | Take the **maximum**, never the average |
| Consumer is "just our own client in this repo"? | Still a consumer. Same classification |
| Zero breaking changes found? | A valid, good answer. Say `PATCH` and move on |

## How to decide

**Step 1 — Name the surface and the consumers.** A change is only breaking
relative to somebody. Write down who: the web client, another module, a stored
row, a running deployment, an agent reading a contract. If you cannot name a
consumer, you are looking at private code and the answer is PATCH — but check
before believing it. Reachability is a fact about the repo, not a feeling
(`grep` the symbol; a "private" helper re-exported from a barrel is public).

**Step 2 — Run the three questions on each changed element.** Any single *yes*
makes that element MAJOR:

1. **Does it fail to build?** Could code that type-checked yesterday stop
   type-checking today, unchanged?
2. **Does it fail at runtime?** Could it still build but throw, 4xx, return a
   different shape, or take a different branch?
3. **Does it need work?** Must the consumer edit config, migrate data, backfill a
   column, or deploy in a particular order to keep working?

Question 3 is the one people skip. A change that compiles and runs but requires a
migration to be run first is a MAJOR — the cost simply moved from the compiler to
the on-call engineer.

**Answer them by reading the path, not by reasoning about it.** Naming the file
that breaks is half the evidence; the other half is the mechanism — *how* the
break reaches that file. Trace it: does the route declare a `response:` schema,
or does a hand-written DTO build the body? Does the map that indexes this enum
have an exhaustive type, or a `Record<string, …>` with a `??` fallback? Is the
symbol re-exported from the barrel, or reachable only through a deep path?

This matters because the plausible mechanism and the real one often disagree,
and a verdict built on the wrong one survives review while being wrong about
what will actually happen. Two habits protect you:

- **Read the code in the path, not the doc about it.** A `CLAUDE.md` or a README
  describes intent at the time it was written; the wiring drifts away from it
  silently. Where they conflict, the code is the fact.
- **Prefer the failure you can demonstrate.** "The client will not compile,
  because `severity.ts:18` reads a field the type no longer has" is checkable.
  "The field will be stripped from the response" is a claim about machinery you
  have not opened yet.

**Step 3 — Take the maximum.** One MAJOR among nineteen patches is a MAJOR.
Averaging is how breaks ship as minors.

**Step 4 — Before you commit to MAJOR, look for the additive alternative.**
Almost every break has a two-step form: add the new thing alongside the old,
deprecate the old, remove it in the next major. If the two-step is cheap, propose
it — a MINOR that consumers absorb on their own schedule is worth more than a
MAJOR that is technically honest. If the two-step is not worth it, say so and go
MAJOR without apologising.

**Step 5 — Report.** Verdict, evidence, migration, changelog entry. Format below.

## Good and bad

The pattern in every pair: the bad version is defensible if you look only at the
diff, and wrong as soon as you look at a consumer.

**1. The rename**

```ts
// ❌ PATCH — "just a rename, no logic changed"
-  export const FindingRecord = Finding.extend({ dismissed_at: ... });
+  export const FindingRecord = Finding.extend({ rejected_at: ... });
```
```ts
// ✅ Either MAJOR, or make it additive and stay MINOR
export const FindingRecord = Finding.extend({
  /** @deprecated since 2.1 — use `rejected_at` (marker format: deprecation-policy) */
  dismissed_at: z.string().nullable(),
  rejected_at: z.string().nullable(),
});
```
The diff is one word. For the consumer it is a removal and an addition, and every
`row.dismissed_at` in the client goes red. Renames are the single most
under-classified change there is.

**2. The new field**

```ts
// ❌ MINOR — "I only added a field"
export const CreateAgentRequest = z.object({ name: z.string(), model: z.string() });
```
```ts
// ✅ MINOR — additive means optional
export const CreateAgentRequest = z.object({
  name: z.string(),
  model: z.string().default('claude-sonnet-5'),
});
```
Required-by-default is the trap. Every existing caller sends a payload that is
now invalid, so the top version is a MAJOR. A default or `.optional()` keeps the
same feature at MINOR cost. Note the asymmetry: on a **response** the reverse
holds — adding a field is safe, making one optional is the break.

**3. The enum**

```ts
// ❌ MINOR — "adding a value can't break anyone"
export const Verdict = z.enum(['request_changes', 'approve', 'comment', 'blocked']);
```
```ts
// ✅ MINOR on the way in, MAJOR on the way out
// Accepting a new value: MINOR — old callers are unaffected.
// Returning a new value: MAJOR — every exhaustive switch on Verdict now falls through.
```
Direction decides it. Widening what you *accept* is safe; widening what you
*emit* pushes a case onto every consumer that matched exhaustively. Removing a
value breaks both directions.

**4. The tightened validation**

```ts
// ❌ PATCH — "we were always supposed to validate this"
-  email: z.string(),
+  email: z.string().email(),
```
```ts
// ✅ MAJOR — or ship it as a warning first and enforce in the next major
```
Being right about the rule does not make the change free. Requests that succeeded
yesterday now 400, and stored rows that were valid now fail to parse. Tightening
is a break; loosening is not.

**5. The bug fix that was load-bearing**

```ts
// ❌ MAJOR reflexively — "behaviour changed, so it's breaking"
// ❌ PATCH reflexively — "it was a bug, they shouldn't have relied on it"
```
```ts
// ✅ Classify by blast radius, then say both parts out loud:
//    "PATCH — the wrong value was never persisted and no caller can observe it"
//    "MAJOR — three call sites branch on the buggy value; fixing it changes their path"
```
Neither reflex is a decision. Look at who consumes the wrong behaviour today.
See `references/edge-cases.md` for the full rule and the security exception.

**6. The verdict itself**

```markdown
❌ "This is probably a minor bump. The API change might affect some clients."

❌ **MAJOR** — renaming the field strips it from the API response, so clients
   break at runtime.          ← plausible mechanism, never opened the route
```
```markdown
✅ **MAJOR** — `FindingRecord.dismissed_at` renamed to `rejected_at`.
   Consumer: `client/src/lib/severity.ts:18` reads `dismissed_at`; it stops
   compiling. The routes declare no `response:` schema, so the server keeps
   emitting the old name from the hand-written DTO in `reviews/helpers.ts:52` —
   the contract lies rather than the field disappearing.
   Cheaper alternative: keep both fields for one minor, remove in the next major.
```
A verdict without a named consumer and a named file is a guess wearing a
confident font — and a named file with an invented mechanism is the same guess
with better citations. If you cannot point at what breaks and say how, you have
not finished Steps 1–2; go back rather than hedge.

**Do not concede in the last paragraph.** Having established a MAJOR, it is
tempting to close with "…but in this repo it will effectively be fine". That
sentence is the whole verdict, and it is the one the reader acts on. Constraints
that genuinely lower the cost belong in the *Cheaper path*, as a decision the
reader makes on purpose — not as a softening after the fact.

## Report like this

Keep it short. The reader wants the level, the reason, and what it costs them.

```markdown
## Verdict: MAJOR

<one sentence: what breaks, for whom>

| Change | Surface | Who it breaks | Level |
|---|---|---|---|
| `dismissed_at` → `rejected_at` | shared contract | client pulls helpers | MAJOR |
| `+ FindingRecord.confidence` (optional) | shared contract | nobody | MINOR |

**Cheaper path** (omit if none): keep `dismissed_at` as deprecated for one minor.

**Migration**: what a consumer must do, in the order they must do it.

**CHANGELOG entry**:
### Breaking
- `FindingRecord.dismissed_at` is now `rejected_at`. Update reads; the value and
  semantics are unchanged.
```

When several levels appear, lead with the maximum. Burying one MAJOR under six
MINORs is how it gets missed.

## Two rules that generate the rest

**Compatibility is measured at the boundary, not in the diff.** Line count,
effort, and whether the old behaviour was a mistake are all irrelevant. The only
question is what an unchanged consumer experiences. This is why a one-word rename
outranks a thousand-line refactor.

**Deprecation is what makes MAJOR affordable.** A codebase that cannot say
"deprecated in 2.4, removed in 3.0" ends up choosing between shipping breaks
quietly and never changing anything. Both are worse. Announce in a MINOR, keep
the old path working, remove in the MAJOR. Once you have classified a removal as
MAJOR, hand off to `deprecation-policy` for the marker format and the removal
window — do not invent either here.

## Where to read more

| Read this | When |
|---|---|
| `references/breaking-catalog.md` | Change-by-change tables per surface: Zod contracts, HTTP API, package exports, TypeScript types, database, config/env |
| `references/changelog.md` | Changelog and release-note format, what a good migration section contains, commit prefixes that disagree with the verdict |
| `references/edge-cases.md` | `0.x`, pre-releases, bug-fix-vs-break, security exceptions, transitive dependency bumps, vendored mirrors, monorepo/unpublished packages |
| `deprecation-policy` (skill) | The marker on the deprecated thing and how long it stays |
| `breaking-change` (skill) | Detecting the break in a diff, the version registry, the rollout sequence |

## Project profile: dev-digest

Root `CLAUDE.md` and each `<module>/CLAUDE.md` win if they contradict this file.

**Nothing here is published, and every package sits at `0.0.0`.** That does not
make the classification optional — it makes it more important. Without a
registry to enforce anything, the only thing standing between a rename and a
broken client is somebody noticing. Report the level even when there is no number
to bump; the verdict's job is to surface the cost, and the changelog entry is the
artefact that carries it.

| Surface | Where | Consumers |
|---|---|---|
| Zod contracts | `server/src/vendor/shared/contracts/*.ts` | Web client, LLM structured output, agents |
| Contract mirror | `client/src/vendor/shared/` | Must change in the **same commit** — a one-sided edit is a break in disguise |
| HTTP API | `server/src/modules/*/routes.ts` | `client/`, `e2e/` |
| Review engine | `reviewer-core/src/` exports | `server/` |
| Database | Drizzle schema + migrations | Every running deployment; rows already written |
| Skills | `.claude/skills/*/SKILL.md` | Every agent that loads them |

Local specifics worth knowing:

- **Zod contracts are the API.** They validate requests, shape LLM output, and
  generate the client's types at once, so a single contract edit can break three
  consumers with different failure modes. Classify each separately.
- `z.object` strips unknown keys, so adding a response field is MINOR here.
  `.strict()` inverts that — check which one the schema uses before answering.
- **No route declares a `response:` schema** (verified across all of
  `server/src/modules/*/routes.ts`). Contracts drive request validation only;
  response bodies come from hand-written DTOs such as `reviews/helpers.ts`. So
  editing a response contract does not change the wire at all — it desynchronises
  the contract from what the server actually sends, and nothing fails until a
  consumer trusts the type. Never claim a field was "stripped from the response".
- **A `z.infer` type is part of the surface.** Changing a schema changes an
  exported TypeScript type, and the client compiles against it.
- Migrations are forward-only and hand-edits are flagged by `pr-self-review`.
  Drop, rename and type-narrowing on a column are MAJOR; expand-and-contract
  (add nullable → backfill → switch reads → drop later) keeps each step MINOR.
- **Skills are versioned artefacts in this repo** (`pr-self-review`,
  `onion-architecture`, and this one carry `version:` plus a `CHANGELOG.md`).
  A skill's surface is its `description` (triggering), its output format, and its
  file paths. Changing the report format or renaming a reference file is MAJOR
  for anything that consumes it; adding a rule or a reference file is MINOR;
  rewording for clarity is PATCH. This skill follows its own rule — see
  `CHANGELOG.md`.
- `pr-self-review` is the gate; this skill is the judgement it can cite. Feed it a
  verdict, do not try to block anything from here.
