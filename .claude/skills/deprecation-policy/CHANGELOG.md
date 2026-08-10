# Changelog

Versioning policy for this skill — it follows the rule it teaches:

- **major** — the marker format changes shape, a default answer reverses, or a
  removal window gets shorter. Anything that invalidates markers already written.
- **minor** — a new surface recipe, a new reference file, a new row in the
  default-answers table, a new audit check.
- **patch** — wording, corrected paths, added sources.

A change to `assets/deprecation-audit.sh` that makes it reject a marker it used
to accept is **major**, not minor: existing markers become errors.

## 1.0.0 — 2026-08-06

**Added**

- `SKILL.md` — the router: 19-row default-answers table; the three-tier test for
  whether a deletion needs a deprecation at all; the canonical three-line marker
  (`@deprecated since` / `@removeAfter` / `@migration`); version rules for a repo
  where every package sits at `0.0.0`; the two removal windows; four inline
  good/bad pairs; an anti-pattern table; the enforcement command.
- `references/lifecycle.md` — Replace → Announce → Remove; what starts the clock;
  giving a `0.0.0` package a real version; how the vendored contracts borrow
  `server/package.json`'s version; per-surface window table with the reasoning
  for each length; what to do when a window expires with live callers; removal-day
  checklist; the migration-spec template.
- `references/surfaces.md` — six recipes: HTTP routes (`Deprecation` / `Sunset` /
  `Link` headers), Zod contracts in the doubly-vendored `vendor/shared/`,
  exported TS symbols and types, React components and props, env vars and feature
  flags, and whole modules.
- `references/examples.md` — ten good/bad pairs on this repo's own files, each
  with the consumer-side reason the bad version is defensible until you look
  outside the diff.
- `assets/deprecation-audit.sh` — greps `server/src`, `client/src` and
  `reviewer-core/src`; fails on a missing or malformed `since`, `@removeAfter` or
  `@migration`, on `since 0.0.0`, and on any marker past its date; warns at 14
  days. Exit 1 on error.
- `evals/evals.json` — five prompts covering a silent delete, a contract rename,
  an endpoint retirement, an overdue marker, and a module-local deletion that
  must *not* be ceremonialised.

**Verified**

- `deprecation-audit.sh` against nine fixtures (well-formed, overdue, due-soon,
  no clock, no migration, migration path missing, no replacement stated,
  no `since`, `0.0.0` placeholder): 7 errors, 2 warnings, 1 silent pass, exit 1.
  Against the live repo: 0 markers, exit 0.
  Two implementation notes worth keeping. Fields reach the validator through
  `\037`, not a tab — bash collapses runs of IFS *whitespace*, so an absent
  `@removeAfter` silently took the value of the next field and reported as
  malformed rather than missing. And `@removeAfter` dates are compared as
  `YYYY-MM-DD` strings, which sorts correctly and avoids BSD/GNU `date` parsing
  differences entirely; only the 14-day warning threshold needs `date`, and it
  falls back from GNU `-d` to BSD `-v`.
- RFC 9745 (`Deprecation`, Standards Track, March 2025) and RFC 8594 (`Sunset`,
  Informational) fetched from rfc-editor.org, not quoted from memory — including
  the rule that `Sunset` must not precede `Deprecation`.

**Contested calls** (reasoning in `README.md`)

- A `@deprecated` JSDoc block is a machine-read marker, not a comment, and is
  therefore outside root `CLAUDE.md`'s no-comments rule. Confirmed by the repo
  owner on 2026-08-06 against the alternative of a `contracts/registry.ts`
  registry; root `CLAUDE.md` carries the exception explicitly so the next agent
  does not have to re-litigate it.
- Two windows (90 / 30 days) rather than one. A single long window applied to
  private helpers is how a policy becomes noise.
- No global `/v1` prefix retrofit. Version the endpoint that broke, by name.

**Boundaries with the neighbouring skills**

- `semver-discipline` — is it MAJOR/MINOR/PATCH, who does it break, changelog.
- `breaking-change` — detecting it in the diff, expand → migrate → contract
  release sequencing, database expand-and-contract, the pre-merge gate.
- This skill — the marker, the window, the per-surface mechanics, the audit.
