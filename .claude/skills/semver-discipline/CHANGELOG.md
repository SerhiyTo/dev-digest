# Changelog

This skill is versioned by its own rules. Its surface is three things: the
`description` in the frontmatter (which decides when it triggers), the report
format under "Report like this" (which is what consumers read), and the
`references/` file paths (which other skills and prompts link to). Changing any
of those is MAJOR; adding a rule, a table row or a reference file is MINOR;
rewording for clarity is PATCH.

## 1.1.0 — 2026-08-06

MINOR by this skill's own rules: rules and examples were added, and the report
format, the reference paths and the `description` are untouched — so nothing
that consumes this skill has to change.

Driven by iteration 1 of the evals, where the skill scored 22/23 against a
baseline's 20/23 but made one factual error the baseline did not.

- **Step 2 now requires verifying the mechanism, not just the location.** The
  skill already demanded a named consumer file, and the eval run supplied one —
  then asserted the wrong reason it would break (that renaming a contract field
  strips it from the HTTP response). Naming a file turned out to be satisfiable
  without opening the path, so "read the code in the path, not the doc about it"
  and "prefer the failure you can demonstrate" are now explicit.
- **Good-bad pair 6 gained a second bad example** — the confidently-cited
  verdict with an invented mechanism, which is what iteration 1 actually
  produced. The abstract hedge was never the realistic failure mode.
- **"Do not concede in the last paragraph."** The baseline run reached MAJOR,
  proved it, then closed with "effectively it passes as a MINOR here" — handing
  the user back the premise it had just refuted. Cost-lowering constraints
  belong in *Cheaper path* as a deliberate choice, not as a softening.
- **Project profile records that no route declares a `response:` schema**,
  verified across all of `server/src/modules/*/routes.ts`. `server/CLAUDE.md`
  claimed the opposite and was corrected in the same change; the agent believed
  the doc, which was the right instinct and the wrong fact.

## 1.0.0 — 2026-08-06

Initial release.

- `SKILL.md` — the ownership split against `deprecation-policy`,
  `breaking-change` and `pr-self-review`; the default-answers table; the
  five-step decision procedure built on the three questions (build / runtime /
  work); six good-bad pairs; the report format; the dev-digest project profile.
- `references/breaking-catalog.md` — per-surface classification tables for Zod
  contracts, HTTP API, package exports and signatures, TypeScript types,
  database schema, and config/env, closing with the direction rule that
  generates them.
- `references/changelog.md` — entry format, good and bad entries, the migration
  section, and the commit-prefix-vs-verdict conflict.
- `references/edge-cases.md` — `0.x`, unpublished packages, bug-fix-vs-break,
  security fixes, "private" code, dependency bumps, the vendored contract
  mirror, pre-releases, runtime bumps, non-signature behaviour, feature flags.

Design decisions worth recording:

- **The verdict must name a consumer and a file.** Early drafts allowed a bare
  level, which reads as authoritative while being unfalsifiable. Requiring
  evidence forces Step 1 to actually happen.
- **Direction, not pattern-matching, is the core rule.** Loosen what you accept
  (MINOR) / loosen what you promise (MAJOR) collapses most of the per-surface
  tables into one idea, so an unlisted change is still decidable.
- **Step 4 looks for the additive alternative before committing to MAJOR.**
  Without it the skill classifies correctly and still leaves the team with an
  expensive release it did not need.
- The deprecation *marker* was deliberately removed from
  `references/changelog.md` once `deprecation-policy` v1.0.0 landed in this repo
  claiming that surface. Two skills defining one format is how a convention dies.
