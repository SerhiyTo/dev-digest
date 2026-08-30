# dependency-checker — sources, contested calls, limits

`SKILL.md` says what to do. This file says why, and where a reasonable engineer
would have chosen differently.

## Where it sits

Four skills can be pointed at an import statement, and they split by altitude:

| Question | Skill |
|---|---|
| What does the repo depend on, what does it weigh, what do we fix first? | **dependency-checker** |
| Which ring does this file belong to; may it import that? | `onion-architecture`, `frontend-ui-architecture` |
| Does changing this dependency break a consumer? | `semver-discipline` |
| Is this vulnerability exploitable here? | `security` |

The line that matters is between this skill and `onion-architecture`: **level**,
not subject. This one draws the graph between packages; that one governs imports
inside a package. Splitting on subject instead would have both skills competing
to answer "should this file import that one", which is how one of them stops
being loaded.

## Contested calls

**The graph is package-level, and a file-level graph is out of scope.** The
tooling for the richer picture is right there — `dependency-cruiser` is already a
`server/` dependency — and it was still the wrong call. A file-level graph of
this repo is roughly 900 nodes: unreadable as a diagram, and duplicating a
picture `onion-architecture` already owns for the one module where ring direction
matters. The cost is that a cycle between two files in one package is invisible
here. Accepted; that finding has an owner.

**The skill ships an executable collector instead of a list of commands.** The
prose version was tried first and lost on three counts: sizes came out
inconsistent between runs (`du` on a pnpm symlink without `-L` reports the link,
not the package), the "unused" pass produced a different answer every time
depending on which grep the agent reached for, and `server/clones/` — where the
product clones the repositories it reviews — silently added dozens of phantom
dependencies from other people's applications. A script makes those decisions
once. `references/collect.md` keeps the manual commands for when it cannot run.

**`unused` reports a confidence instead of filtering.** The collector could
suppress every low-confidence candidate and hand over a short, clean list. It
does not, because the suppression rules are heuristics — a bin name matched in
`scripts`, a substring found in a config file — and a heuristic that silently
drops the one real finding is worse than one that shows its work. The cost is
that the agent must open files before reporting, which is exactly the behaviour
`SKILL.md` asks for.

**An empty P0 is an explicitly permitted answer.** Audit-shaped skills drift
toward finding something; the tier definitions and good-bad pair 3 exist to make
"nothing at P0" a first-class result. This repo is the reason the rule is
written down — at the time of writing it has three genuinely unused packages,
one boundary violation, and no drift that crosses a contract. A skill that
needed to fill four tiers would have to invent most of that.

**The skill writes no file.** A dated report under `docs/` would give trends
across runs, which is genuinely useful, and it was still declined: a read-only
skill can be run by anyone at any time with nothing to review, and the moment it
writes it acquires a review path, a location argument, and a stale-file problem.
Trends can come later from a script that diffs two collector runs.

**Vulnerabilities get one line, not a section.** `--audit` is off by default and
the finding is handed to `security`. Two skills that both grade severity is how a
severity scale stops meaning anything — and a dependency report that grows a CVE
section stops being read for the other four sections.

**Installed size is reported; bundle size is not.** Measuring the real payload
means building the client and reading the analyzer output, which is a minutes-long
operation with a build environment as a prerequisite. `SKILL.md` instead forbids
presenting one as the other, and requires reading the import site before calling a
client dependency heavy. A report that says "75 MB installed, lazily imported at
this line, unmeasured in the bundle" is more useful than a confident wrong number.

## Sources

- The repo itself: six `package.json` files, six lockfiles, the tsconfig `paths`
  in `server/`, `client/`, `reviewer-core/` and `mcp/`, and the vendored
  contract mirror rule in root `CLAUDE.md`.
- npm / pnpm documentation for `dependencies` vs `devDependencies` resolution
  and for what `--omit=dev` removes.
- The existing `onion-architecture` assets, which set the house pattern for a
  dependency-free `.mjs` analysis script next to a skill.
- Sibling skills whose boundaries this one respects — `onion-architecture`,
  `security`, `semver-discipline`, `mermaid-diagram`.

## Known limits

- **Import detection is regex over pre-processed source, not a parser.**
  Comments are stripped and template literals blanked, which kills the common
  false positives (commented-out imports, prompt strings, test fixtures). What
  survives: a regex literal containing `//` can truncate the rest of its line, a
  template literal containing a nested backtick ends early, and a quoted string
  containing `require('x')` still registers. Verify a surprising finding by
  opening the file.
- **Anything resolved at runtime by string is invisible to static analysis.**
  The collector compensates with a substring pass over the package's sources,
  which is why `pino-pretty` is not reported as unused — but a package named
  through a computed string, an env var, or a plugin registry will be.
- **`du` measures disk, and never the browser payload.** There is no bundle
  measurement anywhere in this skill.
- **Only direct declarations are graphed.** Transitive npm relationships are not
  walked, so "which package pulls this in" needs `pnpm why` / `npm ls`.
- **Sizes do not sum across packages under pnpm.** Each package's `node_modules`
  is measured independently, and pnpm hard-links content from a shared store, so
  adding the six totals overcounts whatever they share. Report per package.
- **Package discovery is one level deep** from the repo root. A package nested
  deeper is not found.
- **`--audit` needs the network** and is off by default. Without it the report
  must say the vulnerability count is unknown, not zero.
- **Advisory only.** Nothing here blocks anything, and nothing here changes a
  file. If a phantom dependency ships, this skill will have named it and not
  stopped it.
