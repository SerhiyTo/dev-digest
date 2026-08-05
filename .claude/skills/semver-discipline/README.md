# semver-discipline — sources, contested calls, limits

`SKILL.md` says what to do. This file says why, and where a reasonable engineer
would have chosen differently.

## Where it sits

Four skills in this repo touch the same change and split cleanly by question:

| Question | Skill |
|---|---|
| Is this a break, at what level, and who pays? | **semver-discipline** |
| How do I mark the old thing and how long does it stay? | `deprecation-policy` |
| How do I detect it in a diff and roll it out? | `breaking-change` |
| May this PR merge? | `pr-self-review` |

The other three delegate the level here, so the classification has to be usable
without any of them loaded — which is why `SKILL.md` carries the whole decision
procedure rather than pointing outward for it.

## Contested calls

**The verdict must name a consumer and a file.** The alternative — allow a bare
`MAJOR` — is faster and reads as authoritative, which is the problem. A level
with no named consumer cannot be checked or argued with, so nobody does either.
Requiring the citation forces Step 1 ("name the surface and the consumers") to
actually happen instead of being skipped on the way to a confident answer. The
cost is a slower answer on trivial changes; accepted, because the trivial ones
land in the default-answers table and never reach the procedure.

**Direction beats pattern-matching.** `references/breaking-catalog.md` is a
lookup table, but the tables are all one rule — *loosen what you accept, tighten
what you promise* — and `SKILL.md` teaches the rule rather than the tables. A
catalog alone fails on the first change nobody listed; the rule decides those
too. The catalog stays because per-surface phrasing is what makes a verdict
citable in review.

**Step 4 hunts for the additive alternative.** A classifier that only classifies
leaves the team holding an expensive release. Most breaks have a two-step form
(add alongside, deprecate, remove later) and the moment to notice that is before
the MAJOR is announced, not after. The risk is a skill that talks people out of
necessary breaks — hence the explicit permission in Step 4 to go MAJOR "without
apologising" when the two-step is not worth it.

**PATCH is allowed to be the answer.** Skills that audit things drift toward
finding something. The default table says a zero-breaking-change verdict is
"valid and good", and the private-code row says PATCH *after* verifying
reachability, which is the honest version of the same permission.

**Bug fixes default to PATCH, not MAJOR.** The purist position is that any
observable behaviour change is breaking. Applied literally it makes every fix a
MAJOR and the levels stop carrying information. The escalation list in
`references/edge-cases.md` (persisted wrong values, consumers branching on the
bug, bug-as-documented-behaviour, judgement calls) covers the cases where the
purist is right.

**`0.x` does not suppress the finding.** Semver exempts `0.x` from
compatibility; consumers experience no exemption. Reporting
`MAJOR (→ 0.y+1 while pre-1.0)` keeps the analysis honest while respecting the
numbering. Everything in this repo is `0.0.0`, so without this rule the skill
would return PATCH for everything and be worthless here.

**No enforcement script.** `pr-self-review` already owns the merge path and
`breaking-change` owns detection. A third gate would be a third thing to bypass.
This skill produces a verdict those can cite.

## Sources

- Semantic Versioning 2.0.0 — the level definitions and the `0.x` clause.
- Keep a Changelog — section names (`Breaking`/`Added`/`Fixed`/`Deprecated`) and
  the dated-release convention in `references/changelog.md`.
- Expand-and-contract (parallel change) — the three-step migration in the
  database section.
- Repo surfaces — `server/src/vendor/shared/contracts/*.ts`,
  `server/src/modules/*/routes.ts`, `reviewer-core/src/`, and the mirror rule in
  root `CLAUDE.md`.
- Sibling skills whose boundaries this one respects — `deprecation-policy`
  (marker, windows), `breaking-change` (registry, rollout), `pr-self-review`
  (severity taxonomy, the gate).

## Known limits

- **Advisory only.** Nothing here blocks anything. If a MAJOR ships as a patch,
  this skill will have said so and not stopped it.
- **Nothing in the repo is published.** Every `package.json` is `0.0.0`, so the
  verdict has no number to attach to unless a package or a skill carries one.
  The changelog entry is the durable artefact.
- **Reachability is checked by grep**, so dynamic access — a field read through a
  string key, a route called from an untracked client, an LLM prompt naming a
  contract field — can make "private" wrong.
- **The database section assumes Postgres and forward-only Drizzle migrations**,
  which is what this repo has. Other engines differ on constraint and enum
  mechanics.
- **No opinion on release cadence, tagging or publishing.** Only on what the
  number should be.
