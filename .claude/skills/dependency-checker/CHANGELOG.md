# Changelog

This skill is versioned by the rules in `semver-discipline`. Its surface is
three things: the `description` in the frontmatter (which decides when it
triggers), the five-section report format and the P0/P1/P2/Info tiers (which are
what consumers read), and the collector's JSON keys plus the `references/` file
paths (which other prompts and scripts link to). Changing any of those is MAJOR;
adding a finding type, a rule or a reference file is MINOR; rewording is PATCH.

## 1.1.0 — 2026-08-28

MINOR by this skill's own rules: a rule and a `Scope` requirement were added; the
five section names, the tiers, the collector's JSON keys and the `references/`
paths are untouched, so nothing that consumes this skill has to change.

Driven by the first eval run, which passed all three cases (6/6, 2/3, 5/5) and
failed one practice: the report flagged a deep cross-package import as P0 but
never stated that internal links and npm packages are different kinds of
dependency. Naming the distinction turned out to be satisfiable without the
report ever making it, so it is now required rather than implied.

- **`Scope` must count external npm packages and internal cross-package links
  separately, by name.**
- **A new rule** — "Internal and external dependencies are two different kinds,
  and the report says which it means" — with the reason: an npm version is a
  one-line change, an internal link is hand-maintained coupling that no lockfile
  explains, and a reader who cannot tell them apart cannot tell who fixes it.

## 1.0.0 — 2026-08-28

Initial release.

- `SKILL.md` — the ownership split against `onion-architecture`,
  `architecture-reviewer`, `security` and `semver-discipline`; the five-section
  report format; the four tiers with their anchors; six good-bad pairs; the
  dev-digest project profile.
- `assets/collect-deps.mjs` — dependency-free Node collector emitting one JSON
  inventory: packages, external dependencies with sizes and import counts,
  cross-package edges with `file:line` evidence, version drift, duplicate
  installs, unused, phantom, misplaced, and optional audit counts.
- `references/collect.md` — how to run the collector, the JSON shape, recipes
  for slicing it, and the manual fallback per package manager.
- `references/findings-catalog.md` — ten finding types with detection, default
  tier, wording, and the look-alikes that are not findings.
- `references/graph.md` — what belongs in the package graph and what does not.

Design decisions worth recording:

- **The tiers are the product.** Early drafts led with the inventory and put
  priorities last, which reproduced the failure the skill exists to fix: a true,
  complete, unactionable report. The four sections before `Findings & Priorities`
  are now explicitly framed as the evidence for it.
- **The collector exists because prose collection was not reproducible.** Three
  concrete failures forced it: `du` on a pnpm symlink measures the link unless
  `-L` is passed; the unused-dependency answer changed run to run with whichever
  grep was used; and `server/clones/`, which holds cloned third-party
  repositories, contributed phantom dependencies from unrelated applications
  until enumeration moved to `git ls-files`.
- **Template literals are blanked, not just comments.** Both this skill's own
  eval cases and `server/test/astgrep.test.ts` embed `import` statements inside
  template literals as fixture data. Stripping comments alone left those as
  phantom findings.
- **An alias resolving into `node_modules` is a pin, not an internal edge.**
  `reviewer-core` and `mcp` map `zod` to their own copy through tsconfig `paths`.
  Treating that as an internal dependency made `zod` look unused in both
  packages; it is now classified as external and reported in Info with its reason.
- **`unused` carries a confidence rather than being filtered.** Suppressing
  low-confidence candidates would have hidden the three real ones behind the
  heuristics that produced twenty-two others.
- **No file is written and nothing is installed or removed.** A dated report
  under `docs/` was considered and declined — see `README.md`.
