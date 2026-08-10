# pr-self-review — sources, contested calls, limits

`SKILL.md` says what to do. This file says why, and where a reasonable engineer
would have chosen differently.

## Wiring

Two files outside the skill folder make it real:

- `.claude/settings.json` — registers `assets/pr-gate.sh` as a `PreToolUse` hook
  on `Bash`. Without it the skill still reviews, but nothing enforces the result.
- `.gitignore` — `.claude/pr-self-review/` holds the report and the PR draft.
  The report records a worktree hash; committing it would make it stale for
  everyone else on the first pull.

Verify the hook without opening a real PR:

```bash
echo '{"tool_input":{"command":"gh pr create --fill"}}' \
  | .claude/skills/pr-self-review/assets/pr-gate.sh; echo "exit=$?"
```

## Contested calls

**Deterministic checks before LLM auditors.** The obvious design is "hand the
diff to a model per skill". Measured against this repo, the mechanical layer
found three of the five CRITICAL classes on its own, with no tokens and no false
positives — and `dependency-cruiser` decides onion violations more reliably than
any prompt, because the baseline (0 errors / 35 warnings) is recorded fact. The
counter-argument is real: two systems to maintain instead of one. Accepted,
because a merge gate that cries wolf gets bypassed within a week.

**Architecture violations are not CRITICAL by default.** `frontend-ui-architecture`,
`zod`, `typescript-expert`, `fastify-best-practices` and `react-testing-library`
have a WARNING ceiling and cannot block a merge at all. Misplaced files are worth
fixing, but they do not corrupt data or break callers, and
`docs/agent-prompts/general-reviewer.md` reserves CRITICAL for things that do. A
gate that blocks on file placement teaches people to reach for the override.

**Draft PRs pass.** The gate fires on `gh pr create` (without `--draft`) and on
`gh pr ready`. Blocking a draft would block the cheapest way to get a second
opinion, which is the opposite of what a review tool should do. The cost is that
a draft can be opened with CRITICALs outstanding — acceptable, since a draft
cannot be merged.

**The override exists.** `PR_SELF_REVIEW_OVERRIDE=1` bypasses the gate and logs
that it did. A local gate with no exit gets deleted the first time it is wrong at
an inconvenient moment; one with a logged exit survives.

**Acks expire on file change.** Storing the file's hash at ack time and burning
the ack when the file changes was chosen over a plain id list, because a plain
list is a permanent hole: the first CRITICAL waved through stays waved through
across every future PR.

**Pre-existing violations are reported, not blocked.** `contract-mirror` compares
the mirror at the merge-base before deciding severity. This repo's
`contracts/trace.ts` has a comment-level drift that predates any current branch —
without the base comparison, the very first run of this skill blocked a PR for
someone else's commit.

## Sources

- Severity and verdict enums — `server/src/vendor/shared/contracts/findings.ts`.
- CRITICAL wording, anti-inflation rules, verdict-is-a-pure-function —
  `docs/agent-prompts/general-reviewer.md` and `security-reviewer.md`; the
  no-parallel-scales rule is from `docs/agent-prompts/README.md`.
- Onion baseline and the nine known violations —
  `.claude/skills/onion-architecture/references/migration.md`.
- Test suite map behind the `tests-dimension` check — `TESTING.md`.
- Local conventions (`no comments in new code`, mirrored contracts,
  `SecretsProvider`, `skip-worktree` on `server/package.json`) — root and module
  `CLAUDE.md`.

## Known limits

- **Claude Code only.** The hook format is Claude Code's. Another agent can
  invoke the skill but nothing stops it from opening a PR without one.
- **`main` is hardcoded** as the base branch, in both scripts.
- **`typecheck` is the slow step.** `--no-typecheck` exists for a fast pass; the
  skill runs it by default because reviewing code that does not compile wastes
  more time than it saves.
- **The comment check is line-based.** It sees `//` and `/*` at the start of an
  added line, so a comment appended after code on the same line slips through,
  and a re-copied vendored file would light up (which is why `vendor/` is
  excluded).
- **Secret patterns are heuristics.** They catch common key shapes, not entropy.
  A gate is not a substitute for a real secret scanner in CI.
- **No cross-file reasoning in step 0.** Anything requiring a call graph is the
  auditors' job.
