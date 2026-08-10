# Agents

Claude Code subagents for this repo. This file is the map of the set — each
agent's rules live in its own file, and are not repeated here.

Each subagent runs in its own context window. It does not see the main
conversation, the files already read, or the skills already invoked, and its
intermediate work is discarded — only the final report reaches the caller. That
single fact shapes every design decision below: each agent's body is its complete
instruction set, and each agent ends with an explicit output contract.

**Not to be confused with product agents.** In this codebase "agent" usually
means a *reviewer agent* — a row in the `agents` table with a `provider`, `model`
and `system_prompt`, whose prompts live in `docs/agent-prompts/`. Those run
inside DevDigest against a pull request. The agents here run inside Claude Code
against the repo.

## Catalog

| Agent | Model | Responsibility | Input | Output |
|---|---|---|---|---|
| [researcher](researcher.md) | `sonnet` | Answers a question — about this repo or about the outside world — with evidence | A concrete question | A report in the thread: conclusions with confidence, evidence table with `path:line` or URLs, and a mandatory `Not established` section |
| [planner](planner.md) | `opus` | Turns a request into a Development Plan: tasks per module, the skill each task is implemented under, the test that proves it | A feature request, spec or bug report | `docs/plans/YYYY-MM-DD-<feature>.md` + a 5–10 line pointer in the thread |
| [implementer](implementer.md) | `sonnet` | Executes an approved plan and proves it runs | A path to a plan (or one pasted inline in the same shape) | Code changes on disk + a report: Changes, Commands run, Deviations, Blocked, Handoff |
| [test-writer](test-writer.md) | `sonnet` | Writes tests in the module's own convention, runs them, reports the real output | A module + a subject, or a spec's `## Server tests` section | Test files on disk + a report: Scope, Tests added, Conventions followed, Commands run, Deliberately not tested, Blocked, Handoff |
| [plan-verifier](plan-verifier.md) | `opus` | Checks finished work against every enumerated item of a plan, with a verdict and evidence per item | A plan path, a module spec, or pasted requirements | A report in the thread: per-task summary, per-item ledger, failing commands, scope drift, one completion verdict |
| [architecture-reviewer](architecture-reviewer.md) | `opus` | Runs dependency-cruiser, then reviews the boundaries no tool checks | The diff vs `origin/main`, or an explicit path list | A report in the thread: verdict, mechanical results, findings with `file:line` and a mechanism, plus the same findings as JSON |
| [doc-writer](doc-writer.md) | `sonnet` | Documents implemented work into the right destination, with a house-style diagram | A plan, a diff, or a named feature | Docs on disk in `specs/`, `docs/` or a README + a report: Documents written, Diagrams, Source material, Not documented, Handoff |
| [insight-curator](insight-curator.md) | `opus` | Reads the four `INSIGHTS.md` files as one corpus and proposes what to promote where — clusters, misfiling, and what is already promoted | Nothing, or a module to scope the scan to | A report in the thread: corpus counts, a disposition ledger with one row per dated bullet, clusters with restated claims, promotion proposals with the coverage grep, and ready-to-paste artifact bodies |

## Permissions

| Agent | Tools | Preloaded skills | Cannot |
|---|---|---|---|
| `researcher` | `Read, Grep, Glob, Bash, WebSearch, WebFetch, TodoWrite` | — | Write or edit anything; `Bash` is a read-only allowlist |
| `planner` | `Read, Grep, Glob, Bash, Write, Skill, TodoWrite` | 6 — placement on both sides of the stack, plus `semver-discipline`, `breaking-change`, `deprecation-policy`, `engineering-insights` (~16k tokens) | Edit source (no `Edit`); write outside `docs/plans/`; run tests, builds or migrations; grade work |
| `implementer` | `Read, Edit, Write, Grep, Glob, Bash, Skill, TodoWrite` | 13 — every implementation surface in the repo (~26k tokens) | Touch files outside the task's `Files:` list; `git add\|commit\|push\|checkout\|switch\|stash`; `gh`; review its own design or security |
| `test-writer` | `Read, Edit, Write, Grep, Glob, Bash, Skill, TodoWrite` | 3 — `react-testing-library`, `onion-architecture`, `engineering-insights` (~11k tokens) | Write outside the test-file globs; edit source to make a test pass; weaken or skip an assertion; install a package; run a lint command; touch `e2e/` |
| `plan-verifier` | `Read, Grep, Glob, Bash, Skill, TodoWrite` — plus `disallowedTools: Write, Edit, NotebookEdit` | — (`Skill` is fenced to one question: was the task's declared skill applied) | Write or edit anything; invoke a skill the plan did not name; raise a finding no plan item covers; run a mutating command; give advice instead of a verdict |
| `architecture-reviewer` | `Read, Grep, Glob, Bash, Skill, TodoWrite` — plus `disallowedTools: Write, Edit, NotebookEdit` | 5 — `onion-architecture`, `frontend-ui-architecture`, `breaking-change`, `semver-discipline`, `deprecation-policy` (~18k tokens) | Write or edit anything; `Bash` is a read-only allowlist; fix what it finds; block a merge; issue a security, performance or test-quality verdict |
| `doc-writer` | `Read, Grep, Glob, Bash, Write, Edit, Skill, TodoWrite` | 2 — `mermaid-diagram`, `engineering-insights` (~7k tokens) | Write in `docs/plans/`, `.claude/` or `docs/agent-prompts/`; edit any `INSIGHTS.md` or `CLAUDE.md`; modify source; duplicate the root README's architecture |
| `insight-curator` | `Read, Grep, Glob, Bash, Skill, TodoWrite` — plus `disallowedTools: Write, Edit, NotebookEdit` | 1 — `engineering-insights` (~2k tokens); `Skill` is fenced to one question: does this destination skill already carry this rule | Write or edit anything, including every `INSIGHTS.md`; `Bash` is a read-only allowlist; scan `server/clones/`; propose deleting an entry after promotion; propose a `.md` under `e2e/specs/`; assign a severity; execute the promotions it proposes |

Tool lists are allowlists enforced by the harness. The narrower limits — which
directory `planner` may write to, which git verbs `implementer` may not run,
which globs `test-writer` may create — are enforced by prose in each agent's
`## Hard constraints`, because the harness has no finer granularity than the
tool itself.

Two agents also carry `disallowedTools`. Against an allowlist that already omits
`Write` and `Edit` it changes nothing today — it is declared intent, so that
widening `tools` later does not silently hand a reviewer a pen. The `Bash`
allowlists in `architecture-reviewer` and `plan-verifier` are prose only: the
official docs are explicit that `Bash` can still write through `echo >`,
`sed -i` or a subprocess that opens files itself, and that enforcement at the OS
level needs the sandbox or a `PreToolUse` hook. Neither is used here yet.

Preloading is declared in the `skills:` frontmatter, which injects each skill's
**full** `SKILL.md` at startup. It controls what is *preloaded*, not what is
*reachable*: both agents keep `Skill` in `tools` and carry the full catalog in
their `## Project skills` section, so anything not preloaded is one call away.
`pr-self-review` is preloaded by neither — it is a merge gate the user runs, and
user-only skills cannot be preloaded at all.

## The chain

```
researcher  →  planner  →  docs/plans/<date>-<feature>.md  →  implementer
  (facts)      (the plan)         (the artifact)              (the change)
                    │                                              ↓
                    │                                        test-writer
                    │                                         (the proof)
                    │                                              ↓
                    ├──────────────→  plan-verifier  ──────────────┤
                    │                (every item done?)            │
                    │                                              ↓
                    │                                architecture-reviewer
                    │                                 (boundaries intact?)
                    │                                              ↓
                    └──────────────→   doc-writer   ←──────────────┘
                                       (the record)

                                    security review
                                   (agent not yet written)

  ── off-chain, its own cadence ──────────────────────────────────────────

   INSIGHTS.md ×4  ──→  insight-curator  ──→  proposal  ──→  doc-writer
  (what every agent      (cluster, route,      (a report,      (or the user,
   appended at wrap-up)   already promoted?)    not a file)     for .claude/)
```

`insight-curator` is not in the PR chain — it never sits between `implementer`
and a merge. `implementer` and `test-writer` append to a module's `INSIGHTS.md`
at wrap-up through `engineering-insights`, and `insight-curator` is the only
thing that ever reads all four files together. But it appends nothing and writes
nothing, so **the loop closes through a human**: its report proposes, and
`doc-writer` or the user executes.

Nothing is shared through context — there is none to share. The coupling is
three concrete things: the plan is a **file**; every task names the **skills** it
must be implemented under; the implementer ends with a **Handoff** section that
review agents read first.

`plan-verifier` and `doc-writer` add a fourth: **both read the plan file back**.
That is the reason the plan is a file rather than a message — a message dies with
the context that produced it, and three of the six downstream agents need it
after `implementer` has finished.

## Sources

Where a rule comes from, and which agent carries it.

### Official Claude Code documentation

| Rule | Source | Carried by |
|---|---|---|
| Only `name` and `description` are required; `tools`, `disallowedTools`, `model`, `skills`, `hooks`, `permissionMode` are official optional fields | [sub-agents](https://code.claude.com/docs/en/sub-agents) | Frontmatter of all seven |
| `tools` is an **allowlist**; omitted, the agent inherits every tool available to subagents | [sub-agents](https://code.claude.com/docs/en/sub-agents) | Why every agent here lists `tools` explicitly rather than relying on a default |
| `model` accepts an alias (`sonnet`/`opus`/`haiku`/`fable`), a full model id, or `inherit`; the default is `inherit` | [sub-agents](https://code.claude.com/docs/en/sub-agents) | Every agent pins a tier, so cost is predictable rather than inherited from whatever the caller happens to be running |
| A subagent gets the full `CLAUDE.md` hierarchy and a git-status snapshot at startup, on top of its own system prompt | [sub-agents](https://code.claude.com/docs/en/sub-agents) | Why no agent body repeats what `CLAUDE.md` already says, and why `architecture-reviewer` can assume a git snapshot exists |
| Delegation matches on `description` alone; "include phrases like *use proactively*" | [sub-agents](https://code.claude.com/docs/en/sub-agents) | `description` of both — trigger **and** boundary in the same text |
| "Limit tool access: grant only necessary permissions"; built-in `Explore`/`Plan` deny `Write`/`Edit` | [sub-agents](https://code.claude.com/docs/en/sub-agents) | `planner` has no `Edit`; both `## Hard constraints` |
| A subagent "doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read" | [sub-agents](https://code.claude.com/docs/en/sub-agents) | `planner` opening paragraphs; `implementer` opening + `## Project skills` ("a skill you did not load in this run is a rule you do not have") |
| `skills:` injects full skill content at startup; unlisted skills stay reachable via the `Skill` tool | [sub-agents](https://code.claude.com/docs/en/sub-agents) | `skills:` frontmatter + `## Project skills` in both |
| User-only skills (`disable-model-invocation`) cannot be preloaded | [sub-agents](https://code.claude.com/docs/en/sub-agents) | `pr-self-review` excluded from both |
| "Control costs by routing tasks to faster, cheaper models" | [sub-agents](https://code.claude.com/docs/en/sub-agents) | `opus` for planning, `sonnet` for execution |
| "Check into version control: share project subagents with your team" | [sub-agents](https://code.claude.com/docs/en/sub-agents) | This directory, plus the `docs/plans/` and `.claude/agents/` entries in root `CLAUDE.md` |
| "Separate research and planning from implementation to avoid solving the wrong problem" | [best-practices](https://code.claude.com/docs/en/best-practices) | The split itself; `implementer` `## Input contract` refuses to start without a plan |
| "Give Claude a way to verify its work" | [best-practices](https://code.claude.com/docs/en/best-practices) | `implementer` `## Verification`; every plan task carries its own `Verify:` |
| "A second opinion… so the agent doing the work isn't the one grading it" | [best-practices](https://code.claude.com/docs/en/best-practices) | `implementer` `## Hard constraints` (no self-review) + `Handoff`; `planner` `## Hard constraints` ("do not verdict") |
| "A reviewer prompted to find gaps will usually report some… leads to over-engineering" | [best-practices](https://code.claude.com/docs/en/best-practices) | `implementer` reports out-of-scope needs as `Blocked` instead of improvising fixes |
| "LLM performance degrades as context fills" | [best-practices](https://code.claude.com/docs/en/best-practices) | Why the preload sets are curated per role rather than "all 17" |
| `disallowedTools` is a denylist applied **first**; `tools` then resolves against the remainder, so a tool in both is removed | [sub-agents](https://code.claude.com/docs/en/sub-agents) | `architecture-reviewer` and `plan-verifier` frontmatter |
| Built-in `Explore`/`Plan` are read-only; the official read-only pattern is `Read, Grep, Glob, Bash` plus a prompt saying not to write | [sub-agents](https://code.claude.com/docs/en/sub-agents) | The tool sets of both read-only agents |
| **`Bash` can still write** — `echo >`, `sed -i`, or a script that opens files itself; deny-rules do not extend to subprocesses; OS-level enforcement needs the sandbox, finer blocking needs a `PreToolUse` hook exiting 2 | [sub-agents](https://code.claude.com/docs/en/sub-agents) | The prose `Bash` allowlists — and the honest note above that they are prose |
| "Design focused subagents: each subagent should excel at one specific task" | [sub-agents](https://code.claude.com/docs/en/sub-agents) | Four agents rather than one "reviewer"; `architecture-reviewer` refusing security and test-quality verdicts |
| Non-mutating tools are `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `TodoWrite`; mutating are `Write`, `Edit`, `NotebookEdit`, `Bash`, `PowerShell` | [tools reference](https://code.claude.com/docs/en/tools-reference) | Which tools the two read-only agents may hold at all |

### Anthropic engineering posts

| Rule | Source | Carried by |
|---|---|---|
| The lead agent saves its plan to persistent memory before delegating — plan as artifact, not as message | [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | `planner` writes to `docs/plans/`; `## What you return to the caller` ("the plan is the artifact; the message is a pointer") |
| Every delegated task needs an objective, an output format, tool guidance and clear boundaries | [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | The task shape in `planner` `## Plan format`: `Files` / `Skills` / `Do` / `Done when` / `Verify` / `Depends on` |
| Vague delegation caused subagents to duplicate work and misread the task | [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | `planner` `## Clarify first when the task is vague`; "one task, one module"; `Files:` as a closed list |
| Orchestrator-workers: a central agent decomposes, workers execute, results are synthesised | [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | The chain above |
| "Add complexity only when it demonstrably improves outcomes" | [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | Two agents, not five; review is not duplicated inside `implementer` |
| "LLMs generally perform better when each consideration is handled by a separate LLM call" | [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | Splitting testing, plan verification, boundary review and documentation into four agents instead of one |
| "Think of this as writing a great docstring for a junior developer on your team" | [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | The `description` shape of all four: trigger plus boundary |
| Subagents pass back lightweight references, not large payloads | [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | Reports cite `path:line` rather than pasting files; `doc-writer` returns paths, not documents |
| State implicit context explicitly, "like you would for a new hire" | [writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | The traps written out in full — `.click()`, the depcruise baseline, the nine grandfathered violations |
| **"Vague rubrics produce inconsistent judgments"**; grade each dimension with an isolated judge rather than one judge for all dimensions | [demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | `plan-verifier`'s per-item ledger instead of one overall assessment; `architecture-reviewer` not also grading security |
| **"Give the LLM a way out, like providing an instruction to return 'Unknown' when it doesn't have enough information"** | [demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | `plan-verifier`'s `UNKNOWN` verdict, with its mandatory "what would settle it" field |

### External practice

| Rule | Source | Carried by |
|---|---|---|
| Four documentation forms on two axes — tutorial, how-to, reference, explanation | [Diátaxis](https://diataxis.fr) | `doc-writer` `## Which form to write`, mapped onto `specs/`, `docs/` and the READMEs; "one document, one form" |
| ADR shape: Title / Context / Decision / Status / Consequences, 1–2 pages, numbered, superseded records retained | [Nygard, *Documenting Architecture Decisions*, 2011-11-15](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) | `doc-writer`'s `**Why X and not Y**` section already carries the same content — the reason no separate ADR tree is added |
| MADR is a superset of Nygard; no canonical directory is mandated, so `docs/adr/` is community convention rather than a standard | [adr.github.io](https://adr.github.io/) | The decision to keep decisions inside dated specs |
| "The more your tests resemble the way your software is used, the more confidence they can give you"; test DOM nodes, not component instances | [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles) | `test-writer` `## What is worth testing` |
| The Testing Trophy: layers weighted by investment-versus-confidence, not by count | [Kent C. Dodds, *The Testing Trophy*](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) | Same section, alongside `TESTING.md`'s "typological, not exhaustive" |
| "Things that really have no logic in them at all"; "you should very rarely have to change tests when you refactor code"; a test that mocks a child's real prop requirements can pass while the integrated app is broken | [Kent C. Dodds, *Write tests. Not too many. Mostly integration.*](https://kentcdodds.com/blog/write-tests) | `test-writer` `## Deliberately not tested` as a required report section, and the warning against over-mocking |

### This repo's own conventions

Every one of these is a rule the agents would otherwise break, taken from the
docs that own it.

| Rule | Source | Carried by |
|---|---|---|
| Check the module's `specs/` before implementing; read `INSIGHTS.md` before working, append at wrap-up | root `CLAUDE.md` | `planner` `## Context you must load before planning`; `implementer` `## Wrap-up` |
| No comments in code; `@deprecated` markers only in the shape `deprecation-policy` defines | root `CLAUDE.md` | `implementer` `## Hard constraints` + `deprecation-policy` preloaded |
| pnpm in `server/` and `client/`, npm in `reviewer-core/` and `e2e/` | root `CLAUDE.md` | `implementer` `## Hard constraints` and `## Verification` |
| `@devdigest/shared` is canonical in `server/`, mirrored in `client/`, never divergent | root `CLAUDE.md` | `implementer` `## Hard constraints` |
| Never hand-edit `migrations/*.sql`; never delete an empty table | `server/CLAUDE.md` | `## Hard constraints` of both |
| `reviewer-core/` imports no DB, fs, GitHub or server code | `reviewer-core/CLAUDE.md` | `implementer` `## Hard constraints` |
| e2e flows need the app running and a seeded database | `e2e/CLAUDE.md` | `implementer` `## Verification` — e2e only on the plan's explicit request |
| There is no lint or format gate anywhere in this repo | `docs/improvement-plan-2026-08-03.md` | `planner` may not emit a lint step; `implementer` may not run or add one; `test-writer` and `plan-verifier` both refuse to run one, and `doc-writer` says so plainly |
| Severity is `CRITICAL / WARNING / SUGGESTION`; a parallel scale makes models inflate | `server/src/vendor/shared/contracts/findings.ts:11`; `.claude/skills/pr-self-review/references/severity.md` | `architecture-reviewer` `## Severity`, including the HIGH → WARNING normalisation |
| `onion-architecture` may only *confirm* a mechanical CRITICAL, never originate one; `frontend-ui-architecture` has no CRITICAL cases at all | `.claude/skills/pr-self-review/references/severity.md` | `architecture-reviewer` `## Severity` ceilings |
| The 10-field finding shape; `category ∈ {bug, security, perf, style, test}`; `rationale` must state a mechanism | `.claude/skills/pr-self-review/references/auditor-prompt.md` | `architecture-reviewer`'s JSON appendix |
| A file-glob → skill routing table already exists; reuse it rather than inventing a second one | `.claude/skills/pr-self-review/references/routing.md` | `architecture-reviewer` `## Project skills`; `test-writer` `## Project skills` |
| `server/package.json` is `skip-worktree` — never add scripts; do not copy `dependency-cruiser.onion.cjs` into `server/`; pass an absolute `--config`; clean-tree baseline is 0 errors, 35 warnings | `.claude/skills/pr-self-review/SKILL.md` | `architecture-reviewer` `## Hard constraints` and `## The mechanical pass` |
| Nine documented pre-existing onion violations; re-reporting one is a false positive | `.claude/skills/onion-architecture/references/migration.md` | `architecture-reviewer` `## Hard constraints` and its `## Not a finding` section |
| ALWAYS `fireEvent.click` — `element.click()` does not flush React state, and copying the nearest test teaches the wrong pattern | `client/INSIGHTS.md` | `test-writer` `## The traps` |
| Green typecheck plus green tests does not mean it builds; never `pnpm build` under a running `pnpm dev` | `client/INSIGHTS.md` | Same section |
| Server tests live flat in `server/test/`; DB-backed tests take `*.it.test.ts`; mock the container, not the modules | `TESTING.md`; `server/CLAUDE.md` | `test-writer` `## Module conventions` |
| Spec house shape: `**Component:** / **Behavior:**` pairs, `**Why X and not Y**`, `## Out of scope`, `## Server tests`; paired filenames across `server/specs/` and `client/specs/` | `server/specs/2026-08-05-conventions.md` | `doc-writer` `## House shape`; `plan-verifier` `## When there is no plan` |
| All four `<module>/docs/` folders are `.gitkeep`-only | `server/docs/`, `client/docs/`, `reviewer-core/docs/`, `e2e/docs/` | `doc-writer`'s routing table — this is what those folders are for |
| Mermaid house style: `flowchart LR`, uppercase ids, `<br/>` and `·` labels, dotted versus solid edges, and a prose paragraph after every diagram | root `README.md`; `client/README.md`; `server/README.md`; `reviewer-core/README.md` | `doc-writer` `## Diagrams` |
| `docs/agent-prompts/` holds prompts for the **product's** reviewer agents, not Claude Code subagents | This file, above | `doc-writer` `## Hard constraints` |
| `INSIGHTS.md` is append-only: never edit, reorder or delete an entry or a section heading; the only sanctioned mutation is a dated correction bullet | `.claude/skills/engineering-insights/SKILL.md:13-21` | `insight-curator` `## Hard constraints` and `## What never moves` |
| The quality gate's clause "is it invisible from the code and existing docs" is a promotion criterion inverted — a promoted entry retroactively fails it | `.claude/skills/engineering-insights/SKILL.md:50-53` | `insight-curator` — the gate-2 note in its report |
| "The user spot-checks entries — they are a draft under review, not ground truth" | `.claude/skills/engineering-insights/SKILL.md:64` | The line that authorises `insight-curator` to exist at all |
| The prune clause triggers at ~30 entries per section and is dormant — the largest section today is 9, and it is blind to duplication | `.claude/skills/engineering-insights/SKILL.md:87-90` | `insight-curator` `## Clustering` — clusters, not volume, are the trigger |
| `e2e/specs/` holds executable JSON flow specs, not prose; prose for `e2e/` goes to `e2e/docs/` | `e2e/CLAUDE.md` `## Docs` | `insight-curator` `## Where a promotion goes`, as a hard rule |
| All four `<module>/docs/` folders are `.gitkeep`-only, and every module `CLAUDE.md` already points readers at them | `server/docs/`, `client/docs/`, `reviewer-core/docs/`, `e2e/docs/` | `insight-curator`'s routing table — the lowest-friction destination |
| A module `CLAUDE.md` auto-loads every session and runs 40–55 lines; promotion there is compression, not a move | `server/CLAUDE.md`, `client/CLAUDE.md`, `e2e/CLAUDE.md`, `reviewer-core/CLAUDE.md` | Same table, the cost column |
| `server/clones/` holds cloned third-party repos, including a foreign `CLAUDE.md` — runtime data, not this project | `server/clones/` | `insight-curator` `## Hard constraints` and `## The corpus` |
| The promoted copy back-links to `INSIGHTS.md` by **filename**, and the original stays as the audit trail | `.claude/skills/frontend-ui-architecture/references/examples.md:98`; `.claude/skills/onion-architecture/references/persistence.md:147` | `insight-curator` `## What never moves` — the distributed promotion ledger |

### Verified against this machine, not taken on faith

- Both agents register: a headless run lists `planner` and `implementer` among
  the available subagent types. `README.md` in this directory is correctly
  ignored rather than parsed as an agent.
- Preloading works on the subagent path: asked to answer with no tool calls,
  `planner` reproduced the `onion-architecture` rings and `implementer` quoted
  `react-best-practices` and `engineering-insights` verbatim.
- Preloading behaves differently when an agent is launched as the **main session
  agent** via `--agent` — there the content was not injected. Verify preload the
  way it is actually used: as a subagent.
- All 19 preload entries resolve to real directories under `.claude/skills/`.

- All seven register, including the four added later: a headless run lists
  `researcher`, `planner`, `implementer`, `test-writer`, `plan-verifier`,
  `architecture-reviewer` and `doc-writer`. The `disallowedTools` frontmatter on
  two of them does not stop the file being parsed.

Established by running the commands, for `insight-curator`:

- **The corpus is exactly four files.** `find . -name 'INSIGHTS.md' -not -path
  '*/node_modules/*' -not -path './server/clones/*'` returns `server/`,
  `client/`, `reviewer-core/` and `e2e/`, and nothing else.
- **Counts at 2026-08-09:** server 18 dated bullets, client 20, `reviewer-core`
  **0** — a pristine template with all seven sections empty — and e2e 3. ΣN = 41,
  of which 10 are Session Notes. Three sections (`What Works`,
  `Recurring Errors & Fixes`, `Open Questions`) are empty in every file.
- **Zero literal cross-file duplicates.** The `engineering-insights`
  no-copy-paste rule is being honoured, which is exactly why this agent is not a
  cross-file deduper.
- **Citation decay is real and has already happened.**
  `docs/improvement-plan-2026-08-03.md:365` cites `client/INSIGHTS.md:23` for the
  `SEV_COLOR` entry, which now sits at line **28** — five bullets were prepended
  above it. `test-writer.md:185,190,193` still resolve, by luck.
- **The `react-best-practices` contradiction is live.**
  `.claude/skills/react-best-practices/SKILL.md:117` says "Use utility classes
  for all styling — no inline `style={}` objects", which `client/` rejects;
  `frontend-ui-architecture/SKILL.md:159` restates the resolution, and the skill
  still ships the rejected rule.
- **An instruction pointing at INSIGHTS has never been executed.**
  `.claude/skills/onion-architecture/references/migration.md:122` tells a future
  session to record a finding in `server/INSIGHTS.md`. Nobody has.

Not yet verified, and stated as such rather than assumed:

- **That `disallowedTools` has any effect.** The files carrying it register, but
  against allowlists that already omit `Write` and `Edit` a silent no-op would
  look identical to enforcement. It is declared intent, not a proven barrier.
- **That agent-scoped `hooks:` frontmatter works.** Documented, deliberately
  unused — see the note under Permissions about why the `Bash` allowlists are
  prose.
- **That `plan-verifier`'s plan parser handles a real plan.** `docs/plans/` holds
  only `.gitkeep`, so the `### T<n>` enumeration path has never run against a
  real input.
- **That `insight-curator`'s enumeration holds on a corpus it has not seen.** It
  registers (the headless run lists all eight), and the 2026-08-09 counts above
  are the baseline its `rg -c` row-count invariant reconciles against — but the
  agent has not yet been run end to end.

### Chosen, not sourced

Honest about the seams: the model tiers, the exact size of each preload set, the
report section names (`Handoff`, `Deviations`, `Blocked`), and the plan's section
list are design decisions for this repo. So are the four newer seams: fencing
`plan-verifier`'s `Skill` tool to a single question, the five verdict values
(`MET` / `NOT MET` / `PARTIAL` / `UNKNOWN` / `N/A`), `test-writer`'s write-glob
allowlist, `doc-writer`'s destination routing table, and the decision to record
architecture decisions inside dated specs rather than adding a `docs/adr/` tree.
The sources above require *that* an agent have an output contract, a
least-privilege tool list and a non-vague rubric — they do not prescribe these
particular ones.

## Conventions for adding an agent

- Frontmatter: `name`, `description`, `model`, `tools`, and `skills` when the
  role has rules that apply to nearly every task it will run.
- The `description` states the trigger **and** the boundary — what the agent does
  not do is what stops the wrong task being delegated to it.
- Give the narrowest tool set the job allows, then narrow further in prose under
  `## Hard constraints`.
- End the body with an output contract. The report is the only thing that
  survives the agent's context.
- No agent commits, pushes or opens pull requests. `gh pr create|ready` is
  separately guarded by the `pr-self-review` hook in `.claude/settings.json`.
- A read-only agent gets the read tool set plus `Bash`, `disallowedTools: Write,
  Edit, NotebookEdit`, and an explicit `Bash` allowlist in prose. The allowlist
  is the load-bearing part — the harness cannot see inside a `Bash` call.
- Add a row to the Catalog and Permissions tables above — this file is the only
  index of the set.
