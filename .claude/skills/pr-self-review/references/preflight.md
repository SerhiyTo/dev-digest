# Step 0 — the deterministic pre-flight

`assets/preflight.sh` runs before any subagent. Everything it checks is decidable
by a command, so it needs no model, produces no false positives, and costs no
tokens. What it emits is already `Finding`-shaped; the auditors receive it as
input so they do not report the same thing twice.

```bash
.claude/skills/pr-self-review/assets/preflight.sh [--no-typecheck]
```

Output is a single JSON object on stdout:

```json
{ "halt": null, "base": "<merge-base sha>", "files": [...],
  "findings": [...], "checks": [ {"name":"depcruise","status":"ok","detail":"0 errors, 35 warnings"} ] }
```

`halt` non-null means the review did not run at all (on `main`, no merge-base,
or the branch does not compile). Report the reason and stop — do not fall through
to the auditors.

## Scope

`git merge-base main HEAD` gives the base; a plain two-dot `git diff "$BASE"`
against the working tree then covers **both** the branch commits and everything
uncommitted in one pass. Untracked files are appended whole. This is the diff
the auditors see, so the skill reviews what will actually land, not what is
merely committed.

Excluded as noise, not authored code: `**/migrations/meta/**`, lockfiles,
`.claude/skills/*-workspace/**`, `dist/`, `build/`, `.next/`, `coverage/`.

## The checks

| Check | Signal | Severity |
|---|---|---|
| `typecheck` | `pnpm/npm run typecheck` per touched package | **halt** |
| `depcruise` | new dependency-cruiser *error* vs the onion ruleset | CRITICAL |
| `depcruise` | warning count above the 35 baseline | WARNING |
| `contract-mirror` | `server/src/vendor/shared/**` diverges from the client mirror | CRITICAL |
| `secrets-provider` | `process.env` added under `server/src/modules/**` | CRITICAL |
| `core-purity` | DB / fs / GitHub / server import added under `reviewer-core/src/**` | CRITICAL |
| `migration-edit` | an already-committed `migrations/*.sql` was modified | CRITICAL |
| `secret-scan` | credential pattern in an added line | CRITICAL (`kind: secret_leak`) |
| `tests-dimension` | behaviour changed, no test in that package touched | WARNING |
| `pr-readiness` | `.only(` in a test | CRITICAL |
| `pr-readiness` | `console.log` / `debugger` added | WARNING |
| `pr-readiness` | new `TODO`/`FIXME`, comment added to new code | SUGGESTION |
| `large-files` | newly added file over 1 MB | WARNING |

`typecheck` halts rather than reports: reviewing a branch that does not compile
burns tokens on code the compiler has already rejected. `--no-typecheck` skips
it for a fast pass.

## Why depcruise is the source of truth for onion

`.claude/skills/onion-architecture/references/migration.md` records the baseline:
a clean tree is **0 errors and 35 warnings**, so any *error* was introduced by
the changes in front of you. Verified against this repo — the config resolves
`tsConfig: { fileName: 'tsconfig.json' }` from the cwd, so it runs from `server/`
with an absolute `--config` and needs no copy:

```bash
cd server && npx --no-install depcruise \
  --config "$REPO_ROOT/.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs" src
```

Do **not** copy the config into `server/` the way `migration.md` suggests. The
copy would be an untracked file that the very next run picks up as part of the
diff. `server/package.json` is `skip-worktree`, so an `arch` script is not an
option either — invoke it directly.

The exit code is the primary signal (verified: 0 with 35 warnings, non-zero only
when errors exist); the printed `error` lines supply the detail.

## Only what this diff introduces

Every check is anchored to the diff, not to the tree:

- pattern checks read **added lines only**, parsed out of `git diff -U0`;
- `migration-edit` selects git status `M`, so freshly generated migrations pass;
- `large-files` looks at status `A` plus untracked, so touching an existing large
  file is not a finding;
- `contract-mirror` compares the mirror **at the merge-base** first. If the two
  sides already differed there, it reports WARNING and says so, instead of
  blocking a PR for a violation the author did not introduce. This case is real
  in this repo — `contracts/trace.ts` has carried a comment-level drift since
  before the current branch.

## Failure is loud

A check that cannot run emits `"status": "skipped"` with a reason. Silence would
read as "clean", which is the worst failure mode a merge gate can have — report
skipped checks in the summary alongside the findings.

## Regex discipline

Patterns reach `awk` through `-v`, which strips one level of backslash escapes:
`\(` arrives as `(` and opens a group, and `/\*` arrives as `/*`, which matches
the empty string and therefore **every** line. Use POSIX bracket expressions —
`[(]`, `[.]`, `/[*]` — never backslash escapes, in any pattern passed to
`scan_added`.
