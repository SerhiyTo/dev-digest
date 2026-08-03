# Severity — the taxonomy is already in the repo

Do not invent a scale. `server/src/vendor/shared/contracts/findings.ts` defines
what this project means by a finding, and `docs/agent-prompts/README.md` is
explicit that a parallel scale ("High/Medium/Low") makes models map severities
inconsistently and inflate them.

```
Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION'
Verdict  = 'request_changes' | 'approve' | 'comment'
```

The three levels, quoted from `docs/agent-prompts/general-reviewer.md`:

- **CRITICAL** — a defect that, once merged, can cause a security breach, data
  loss/corruption, incorrect results, a crash, or a broken contract that callers
  depend on. This is the ONLY level that blocks merge.
- **WARNING** — a real problem worth fixing that does not block: a missed edge
  case, degraded behaviour, or a maintainability/perf risk that bites at scale.
- **SUGGESTION** — a minor improvement or nit; the PR is safe to merge without it.

**Verdict is a pure function of findings.** Any un-acknowledged CRITICAL →
`request_changes`. Only WARNING/SUGGESTION → `comment`. Empty findings →
`approve`. Never `request_changes` with an empty list; never `approve` while
holding a CRITICAL.

## What each auditor may raise to CRITICAL

An architecture violation is not, by itself, a merge blocker. Without the list
below the gate either never fires or fires on every PR. **The default ceiling is
WARNING**; an auditor may only reach CRITICAL for its own listed cases.

| Auditor | May report CRITICAL for | Ceiling |
|---|---|---|
| `onion-architecture` | only what step 0 already proves mechanically — see below | WARNING |
| `security` | a realistically exploitable vulnerability with a concrete attack path: breach, data exposure, RCE, auth bypass, injection | CRITICAL |
| `react-best-practices` | a hook called conditionally or in a loop; direct state mutation | CRITICAL |
| `next-best-practices` | a server secret or server-only import reachable from a `'use client'` module | CRITICAL |
| `drizzle-orm-patterns` | a migration that does not match the schema in code; a lost or duplicated write; a query missing its tenant/workspace scope | CRITICAL |
| `postgresql-table-design` | same as above, plus a destructive migration with no backfill | CRITICAL |
| `frontend-ui-architecture` | — | WARNING |
| `fastify-best-practices` | — | WARNING |
| `zod` | — | WARNING |
| `typescript-expert` | — | WARNING |
| `react-testing-library` | — | WARNING |
| `project-rules` | — | WARNING |

`onion-architecture`'s CRITICAL cases — `reviewer-core` purity, `drizzle-orm`
outside ring 3, `process.env` instead of `SecretsProvider`, a hand-edited
migration, an unmirrored vendored contract — are all detected in step 0 by
`dependency-cruiser` and grep. The LLM auditor may *confirm* one, never
originate it: the deterministic check is the source of truth and does not
hallucinate. Everything the auditor finds on its own is at most WARNING.

## Normalising other scales

`react-best-practices` tags its own rules CRITICAL/HIGH/MEDIUM. Map on the way
in: `CRITICAL → CRITICAL` (only for the two cases above), `HIGH → WARNING`,
`MEDIUM → SUGGESTION`.

`security` grades confidence, not severity: report only its HIGH-confidence
findings, note MEDIUM as WARNING for manual verification, and drop LOW entirely
— that is the skill's own rule.

## Anti-inflation, carried over verbatim

- Assign the severity you would defend to the author's face.
- A speculative issue — "might be", "could potentially", "if X isn't already
  handled elsewhere" — is **at most WARNING, never CRITICAL**.
- If you would dismiss your own finding as a likely false positive, do not
  report it at all.
- Report only DISTINCT issues. There is no minimum, target, or maximum count.
  **Zero findings is a valid and good answer.**
- Every finding cites an exact `file` and line range that exists in the diff.
- Flag only what THIS diff introduces or worsens. Pre-existing code is out of
  scope unless the change directly amplifies it. For `onion-architecture` this
  is binding: read `.claude/skills/onion-architecture/references/migration.md`
  first — nine violations are known, documented, and must not be re-reported.
