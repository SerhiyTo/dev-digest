# Reduction, the report, and what the gate reads

## Reduction — plain logic, no second LLM pass

Do this in the main agent. Another model call here would re-introduce the
inconsistency the fixed severity table exists to prevent.

1. **Grounding.** Discard any finding whose `file` is not in the diff or whose
   `start_line` falls outside the changed ranges — the same discipline as
   `reviewer-core/src/review/grounding.ts`. An auditor that cannot point at a
   real line did not find a real thing.
2. **Normalise severity** per `severity.md`, then clamp each auditor to its
   ceiling. A WARNING-ceiling auditor returning CRITICAL is downgraded, not
   dropped, and the clamp is noted in the report.
3. **Dedup** on `(file, start_line, normalised title)`. Keep the highest
   severity; append the other sources to `rationale`. **Pre-flight always wins
   over an LLM auditor** on a collision — it proved its case, the auditor argued it.
4. **Verdict.** Any un-acknowledged CRITICAL → `request_changes`; only
   WARNING/SUGGESTION → `comment`; nothing → `approve`.

## The report file

`.claude/pr-self-review/last-report.json` — gitignored, and the only thing
`pr-gate.sh` reads. Field names below are load-bearing; the gate parses them.

```json
{
  "generated_at": "2026-08-04T10:12:00Z",
  "head_sha": "a1b2c3...",
  "base_sha": "66727c8...",
  "worktree_hash": "sha256 of (git status --porcelain ++ git diff HEAD)",
  "file_hashes": { "server/src/modules/x/service.ts": "sha256..." },
  "auditors": [
    { "skill": "onion-architecture", "files": ["..."], "status": "ok" },
    { "skill": "typescript-expert", "files": [], "status": "dropped: agent budget" }
  ],
  "checks": [ { "name": "depcruise", "status": "ok", "detail": "0 errors, 35 warnings" } ],
  "verdict": "request_changes",
  "counts": { "CRITICAL": 1, "WARNING": 4, "SUGGESTION": 2 },
  "acknowledged": [
    { "id": "preflight-003", "file": "server/src/modules/x/service.ts",
      "file_hash": "sha256 at ack time", "reason": "…", "at": "2026-08-04T10:20:00Z" }
  ],
  "findings": [ { "id": "…", "severity": "CRITICAL", "file": "…", "start_line": 42,
                  "title": "…", "source": "depcruise", "…": "…" } ]
}
```

Compute the two hashes exactly as the gate does, or every run will look stale:

```bash
head_sha=$(git rev-parse HEAD)
worktree_hash=$( { git status --porcelain; git diff HEAD; } | shasum -a 256 | cut -d' ' -f1 )
```

## Staleness

The gate recomputes both and refuses if either moved. Without that check the
loop "review clean → write more code → open PR" passes a gate that never saw the
new code. Re-running the skill is the only way to refresh it.

## Incremental re-run

On a second run, compare `file_hashes` against the current files:

- unchanged slice → **do not** re-dispatch that auditor; carry its findings over
  with `"carried_over": true`;
- changed slice → re-dispatch, replace its findings wholesale;
- step 0 always runs in full — it is cheap and its inputs are global.

The usual loop is "fix one file, re-run", which should cost one or two agents,
not nine. Say in the terminal output how many were carried over, so a cheap run
is never mistaken for a thorough one.

## Acknowledgement

`/pr-self-review ack <finding-id> "reason"` appends to `acknowledged` with the
finding's file and **that file's hash at ack time**. The gate treats an ack as
active only while the hash still matches, so editing the file burns the ack and
the finding blocks again.

Rules: an empty reason is rejected; an ack applies to exactly one finding id;
acks do not survive into a report generated for a different `base_sha`.

Without expiry, `acknowledged` becomes a permanent hole in the gate — the first
CRITICAL someone waves through stays waved through forever.

## The PR draft

The skill has just read the whole diff, so the description is nearly free.
Write `.claude/pr-self-review/pr-draft.md`:

- **title** — imperative, one line, matching the repo's `feature: …` / `fix: …` style;
- **what changed** — grouped by module, not a file list;
- **how it was verified** — the `checks` array in prose, including skipped ones;
- **self-review** — `N critical · N warning · N suggestion`, plus any
  acknowledgement and its reason.

`/pr-self-review describe` regenerates just this from a fresh report. This is
what makes the skill worth running rather than something to route around: it
hands back more than it takes.

## Terminal output

Group by severity, highest first, in the style of
`reviewer-core/src/output/to-review.ts`:

```
🔴 1 critical · 🟡 4 warning · 🔵 2 suggestion     verdict: request_changes

CRITICAL
  server/src/modules/x/service.ts:42  process.env in feature code   [preflight/secrets-provider]

checks: typecheck ok · depcruise ok (0 errors, 35 warnings) · secret-scan ok
auditors: 6 run, 1 dropped (typescript-expert), 2 carried over
```

Always print the `checks` line, including skipped entries. A check that silently
did not run reads exactly like a check that passed.
