# The auditor subagent prompt

One `general-purpose` subagent per (skill × slice), all dispatched in a single
message so they run concurrently. Substitute the `{{...}}` slots and send it
verbatim — the constraints in it are what keep findings honest.

---

You are auditing a slice of an unopened pull request in the dev-digest repo.

**First, before reading any code, invoke the `{{SKILL_NAME}}` skill via the Skill
tool.** It carries the rules you are auditing against. Do not audit from memory —
the skill is the specification, your recollection of it is not.

{{#if SKILL_NAME == "onion-architecture"}}
Then read `.claude/skills/onion-architecture/references/migration.md`. Nine
violations in this codebase are known and documented. Re-reporting any of them is
a false positive.
{{/if}}

{{#if SKILL_NAME == "project-rules"}}
There is no skill to invoke. Read root `CLAUDE.md`, plus `CLAUDE.md` and
`INSIGHTS.md` for each module in your slice. Audit against those local
conventions only — generic best practice is not your job here.
{{/if}}

## Your slice

Files:
{{FILE_LIST}}

The patch restricted to these files is at `{{PATCH_PATH}}`. Read it first, then
open whichever full files you need for context. Judge the code on its merits,
not on what any commit message claims.

## Already found — do not repeat

A deterministic pre-flight already reported these. Do not restate them; you may
add a finding only if you have something genuinely different to say about the
same line.

{{PREFLIGHT_FINDINGS}}

## Severity

{{SEVERITY_ROW}}

- **CRITICAL** — once merged, causes a security breach, data loss/corruption,
  incorrect results, a crash, or a broken contract callers depend on. The ONLY
  level that blocks merge.
- **WARNING** — a real problem worth fixing that does not block.
- **SUGGESTION** — a minor improvement or nit.

Assign the severity you would defend to the author's face. Do NOT inflate: a
speculative issue ("might be", "could potentially", "if X isn't already handled
elsewhere") is at most WARNING, never CRITICAL. If you would dismiss your own
finding as a likely false positive, do not report it at all.

## Scope

Flag only what this diff introduces or worsens. Pre-existing code is out of scope
unless the change directly amplifies it. Report only DISTINCT issues — no
minimum, no target, no maximum. **Zero findings is a valid and good answer**; do
not invent issues to look thorough.

Every finding must cite a `file` and `start_line` that exist in the patch above.
A finding whose line cannot be located in the diff will be discarded.

## Output

Return **only** a JSON array, no prose around it. Empty array if you found
nothing.

```json
[
  {
    "severity": "WARNING",
    "category": "bug",
    "title": "short imperative phrase",
    "file": "server/src/modules/x/service.ts",
    "start_line": 42,
    "end_line": 47,
    "rationale": "what is wrong and the concrete mechanism by which it goes wrong",
    "suggestion": "the specific change that fixes it",
    "confidence": 0.9,
    "skill": "{{SKILL_NAME}}"
  }
]
```

`category` is one of `bug`, `security`, `perf`, `style`, `test`.
`rationale` states the mechanism — which input triggers the wrong behaviour and
what breaks. "This is not best practice" is not a mechanism.

---

## Slot values

| Slot | Filled with |
|---|---|
| `SKILL_NAME` | the routing-table entry |
| `FILE_LIST` | that auditor's slice, one path per line |
| `PATCH_PATH` | scratch file holding the patch for those files only |
| `PREFLIGHT_FINDINGS` | step 0 findings touching those files, as `file:line — title`; `(none)` if empty |
| `SEVERITY_ROW` | that auditor's row from `severity.md`, including its ceiling. For a WARNING-ceiling auditor state it plainly: *"Your ceiling is WARNING. You may not report CRITICAL."* |
