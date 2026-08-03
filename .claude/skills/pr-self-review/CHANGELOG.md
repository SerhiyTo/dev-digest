# Changelog

## 1.0.0 — 2026-08-04

Initial release.

- `SKILL.md` — the flow (preflight → route → dispatch → reduce → report → gate),
  default-answers table, and the dev-digest project profile.
- `assets/preflight.sh` — deterministic step 0: typecheck halt, dependency-cruiser
  against the onion ruleset, contract mirror, `SecretsProvider`, `reviewer-core`
  purity, hand-edited migrations, secret scan, tests dimension, PR hygiene,
  large files. Emits `Finding`-shaped JSON.
- `assets/pr-gate.sh` — `PreToolUse` gate on `gh pr create` (non-draft) and
  `gh pr ready`; blocks on missing report, stale report, or un-acknowledged
  CRITICAL.
- `references/` — preflight, routing, severity, auditor-prompt, report.
- Wiring: `.claude/settings.json` hook registration, `.gitignore` entry for
  `.claude/pr-self-review/`, catalog row in `.claude/skills/README.md`.

Verified against this repo during authoring:

- depcruise baseline reproduced exactly — 0 errors, 35 warnings — and an
  absolute `--config` works from `server/` with no config copy.
- Three CRITICAL paths fire on planted probes (`process.env` in a module, a
  `drizzle-orm` import in `reviewer-core`, an API-key-shaped literal).
- A clean branch yields zero CRITICAL; the pre-existing `contracts/trace.ts`
  mirror drift reports as WARNING rather than blocking.

Two bugs found and fixed while testing, both worth remembering:

- Patterns reach `awk` through `-v`, which strips one backslash level. `/\*`
  arrived as `/*`, matched the empty string, and flagged all 2218 added lines as
  comments. All patterns now use POSIX bracket expressions.
- The first `contract-mirror` implementation compared only the current tree and
  raised CRITICAL on a drift that predates the branch. It now compares the
  merge-base state first.
