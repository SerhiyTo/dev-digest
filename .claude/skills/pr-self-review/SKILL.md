---
name: pr-self-review
description: Reviews all open local changes before a pull request is opened, by routing the diff to the project's own skills — UI skills audit UI files, backend architecture skills audit backend files — and blocks the merge path when a CRITICAL finding is found. Use this whenever the user is about to open a PR, asks to check or self-review their changes, runs /pr-self-review, or reaches the "commit, push, open a PR" step; also use it when a PR-opening command was blocked and the user asks why. Complements the per-domain skills rather than replacing them — it decides which of them apply to this diff and enforces the outcome.
version: 1.0.0
user-invocable: true
metadata:
  scope: shared
  tags: [code-review, pull-request, quality-gate, pre-merge, hooks, orchestration]
---

# PR Self Review

A rule nobody checks is a rule that does not exist. This repo carries twelve
skills' worth of accumulated conventions, and every one of them only fires when
an agent happens to load it while writing code. Nothing compares the finished
diff against them before it becomes a pull request.

This skill closes that gap: take every open change, route it to the skills that
actually govern it, and stand in front of the merge path until the CRITICAL
findings are gone.

## The default answers

| Question | Answer |
|---|---|
| What is reviewed? | Branch vs `main` **plus** uncommitted and untracked — what will actually land |
| Where does severity come from? | `contracts/findings.ts`. `CRITICAL`/`WARNING`/`SUGGESTION`. Never invent a scale |
| What blocks a merge? | An un-acknowledged `CRITICAL`. Nothing else |
| Is an architecture violation CRITICAL? | No, unless it is in the short list in `references/severity.md` |
| Who decides an onion violation? | `dependency-cruiser`, not a model. The auditor may confirm, never originate |
| Zero findings — is that a failure? | No. It is a valid and good answer |
| Does a draft PR get blocked? | No. The gate stands on `gh pr ready`, not on `gh pr create --draft` |
| Can the gate be bypassed? | `PR_SELF_REVIEW_OVERRIDE=1`, logged. A gate with no exit gets uninstalled |
| A check could not run — then what? | Report it as `skipped`. Silence reads as "clean" |
| Re-run after fixing one file? | Only the auditors whose slice changed re-run |

## The flow

```
/pr-self-review
  │
  ├─ 0. preflight.sh ──── halt? ──► report why, stop
  │      deterministic: typecheck, depcruise, contracts, secrets, tests, hygiene
  │
  ├─ 1. route the diff ──► one slice per applicable skill        (references/routing.md)
  │
  ├─ 2. dispatch auditors in parallel, one per slice             (references/auditor-prompt.md)
  │
  ├─ 3. reduce: ground → normalise → dedup → verdict             (references/report.md)
  │
  └─ 4. write last-report.json + pr-draft.md, print the summary
         │
         └─ gh pr create / gh pr ready ──► pr-gate.sh reads the report ──► exit 2 on CRITICAL
```

## Running it

**Step 0 first, always.** It is the only step that can stop the run.

```bash
.claude/skills/pr-self-review/assets/preflight.sh
```

It prints one JSON object: `{halt, base, files, findings, checks}`. A non-null
`halt` means nothing was reviewed — on `main`, no merge-base, or the branch does
not compile. Report the reason and stop. Do not dispatch auditors anyway.

**Then route, dispatch, reduce, report** — each step has a reference file, listed
below. Dispatch every auditor in a single message so they run concurrently.

**Subcommands.**

| Invocation | Does |
|---|---|
| `/pr-self-review` | Full run |
| `/pr-self-review ack <id> "reason"` | Record a justification for one CRITICAL; expires when its file changes |
| `/pr-self-review describe` | Regenerate `pr-draft.md` from the current report |

## The two rules that make this work

**Deterministic before probabilistic.** Anything a command can decide is decided
by a command, in step 0, at zero token cost and with no false positives. The
auditors are for judgement, not for facts. When the two collide, the command wins.

**Only what this diff introduces.** Nine onion violations in this codebase are
known and documented; `contracts/trace.ts` has carried a mirror drift since
before your branch. Re-reporting inherited debt as a merge blocker trains people
to bypass the gate, which costs more than the debt does. Step 0 anchors every
check to added lines, git status, or the state at the merge-base.

## Where to read more

| Read this | When |
|---|---|
| `references/preflight.md` | What step 0 checks, the depcruise baseline, why a check is skipped, awk regex traps |
| `references/routing.md` | Which skill audits which files, packages with no skill, slice size limits |
| `references/severity.md` | The taxonomy, what each auditor may call CRITICAL, anti-inflation rules |
| `references/auditor-prompt.md` | The subagent prompt template and its slots |
| `references/report.md` | Reduction, report schema, staleness, incremental re-run, ack, the PR draft |

## Project profile: dev-digest

Root `CLAUDE.md`, `<module>/CLAUDE.md` and `<module>/INSIGHTS.md` win if they
ever contradict this file.

| Thing | Where |
|---|---|
| Report the gate reads | `.claude/pr-self-review/last-report.json` (gitignored) |
| PR description draft | `.claude/pr-self-review/pr-draft.md` |
| Hook registration | `.claude/settings.json`, `PreToolUse` on `Bash` |
| Onion ruleset | `.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs` |
| Severity contract | `server/src/vendor/shared/contracts/findings.ts` |
| Reviewer prompt wording this skill reuses | `docs/agent-prompts/general-reviewer.md` |

**Local rules that override the generic advice.**

- **No comments in new code** (root `CLAUDE.md`) — including the shell scripts in
  `assets/`. Step 0 flags added comment lines, so this skill must not violate the
  rule it enforces. Intent goes in function names; the "why" goes in these
  references.
- The gate stands on the **merge path**, not on sharing. `gh pr create --draft`
  passes; `gh pr ready` is where it fires. Blocking a draft PR blocks the fastest
  way to get a second opinion.
- `server/package.json` is `skip-worktree` — never add scripts to it. Invoke
  `npx --no-install depcruise` directly.
- Do not copy `dependency-cruiser.onion.cjs` into `server/` the way
  `onion-architecture/references/migration.md` suggests. The copy becomes an
  untracked file that the next run reviews as part of the diff. Pass an absolute
  `--config` instead; verified to work from `server/`.
- The clean-tree depcruise baseline is **0 errors, 35 warnings**. Errors are new
  by definition; a warning count above 35 is a WARNING, not a blocker.
- Contracts live in `server/src/vendor/shared/` and are mirrored to
  `client/src/vendor/shared/` in the same commit — but only report the drift as
  CRITICAL when the two sides were identical at the merge-base.
- The hook is Claude Code only. Other agents can invoke the skill, but nothing
  stops them from opening a PR without it.
