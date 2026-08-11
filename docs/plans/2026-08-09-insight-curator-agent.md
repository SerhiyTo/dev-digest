# Plan: `insight-curator` subagent — 2026-08-09

## Context

INSIGHTS content in this repo is **written by one mechanism and read by nine**.
`engineering-insights` appends it; `pr-self-review` (SKILL + `references/routing.md`
+ `references/auditor-prompt.md`), `planner`, `researcher`, `test-writer`,
`implementer`, `frontend-ui-architecture` and `onion-architecture` all read it.
Nothing curates it. `scripts/` holds only `dev.sh` and `e2e.sh`; the three
skill-asset scripts never open an `INSIGHTS.md`; git history shows five commits
that ever touched one, each bundling it with feature work.

Every existing agent is barred from the file — `doc-writer.md:58` ("Never edit
any `INSIGHTS.md`"), `architecture-reviewer.md:232`, `planner.md:37`. That is
correct and this agent does not change it. `doc-writer.md:266` already emits a
*Candidate INSIGHTS entry … (I did not append it)*, so **propose-don't-write is
an established pattern in this set** and `insight-curator` matches it.

### Why the obvious framing is wrong

The request says "deduplicates". Taken literally that means cross-module dedup,
and **cross-module dedup finds nothing**: no entry's text appears in two of the
four files. The rule at `engineering-insights/SKILL.md:32-33` — *"each module
gets only its own entries — no copy-paste duplication; cross-cutting insight
goes where the evidence lives"* — is being honoured perfectly. An agent built to
scan for cross-file duplicates would return an empty report forever and be
deleted as useless.

The corpus (2026-08-09 baseline: 41 dated bullets across four files = 31
substantive insights + 10 Session Notes) has three real problems instead, and
the agent must be designed for these:

1. **Within-file near-duplicate clusters.** Six of them. The worst, `server/INSIGHTS.md`
   `## Codebase Patterns`, is five JobRunner entries from the same week naming
   the same subsystem, ~1,900 chars, in which "the 120s timeout is GLOBAL, no
   per-kind override" is stated three separate times. That is a design document
   serialised into an append-only log. `engineering-insights`' only maintenance
   clause (`SKILL.md:87-90`) triggers at ~30 entries per section; the largest
   section today is 9, so it is dormant by design and structurally blind to
   duplication.
2. **Misfiling.** `client/INSIGHTS.md:15` is an **e2e** insight living in
   `client/` — anyone working in `e2e/` runs `./scripts/e2e.sh` and will never
   open `client/INSIGHTS.md`. The skill's "evidence lives here" rule cannot
   express a cross-post. Section-mapping is inconsistent too: a drizzle-kit tool
   quirk sits under `What Doesn't Work` in `server/`, while two RTL quirks in
   `client/` are split across `What Doesn't Work` and `Tool & Library Notes`.
3. **Citation decay.** Entries are appended at the **top** of a section, so
   every inbound `INSIGHTS.md:NN` citation rots as bullets are prepended. One
   already has: `docs/improvement-plan-2026-08-03.md:365` cites
   `client/INSIGHTS.md:23` for the `SEV_COLOR` entry, which now sits at line 28.
   `test-writer.md:185,190,193` cite `:14`, `:18`, `:17` and still resolve by
   luck.

And one thing that is **not** a problem: staleness. All 31 evidence paths
resolve today; spot-checks confirm the entries are live and being followed. The
staleness check must therefore be cheap, verify-then-report, and expect zero
findings as the normal answer.

Two facts shape the agent more than anything else:

- **29% of the corpus has already been promoted, by hand, undocumented.** Nine
  of 31 insights live at a destination today — `frontend-ui-architecture/references/examples.md:98`
  ("This is a real defect in this repo, recorded in `client/INSIGHTS.md`"),
  `:180`, `frontend-ui-architecture/SKILL.md:159`,
  `onion-architecture/references/persistence.md:147` ("Two things
  `server/INSIGHTS.md` records…"), and `test-writer.md:180-193`. Re-proposing
  those is this agent's single largest false-positive risk, so a coverage grep
  before every proposal is a hard gate, not a nicety.
- **The promoted copies back-link to `INSIGHTS.md` by filename.** That back-link
  convention *is* a distributed promotion ledger, and it is greppable. The
  section "The promotion ledger" below resolves the design tension on that basis
  instead of inventing a second ledger file.

This is also the first real file in `docs/plans/` — `.claude/agents/README.md:207-209`
records that `plan-verifier`'s `### T<n>` enumeration path "has never run
against a real input". It will now.

## Source of truth

- spec: none — this plan is the spec. `.claude/` carries no `specs/` directory
  and `doc-writer` is explicitly barred from writing there (`doc-writer.md:72`).
- roadmap lesson: **not on the roadmap.** L01–L08 build the DevDigest product;
  `.claude/agents/` is repo tooling and sits outside that table.
- INSIGHTS consulted: `server/INSIGHTS.md`, `client/INSIGHTS.md`,
  `e2e/INSIGHTS.md`, `reviewer-core/INSIGHTS.md` — all four read in full as the
  subject matter of this plan, via `engineering-insights` (preloaded).
- House conventions: `.claude/agents/README.md` `## Conventions for adding an
  agent` (`:224-241`), and the six-H3 `## Sources` shape (`:95-222`).

## Constraints that must not break

- **INSIGHTS.md is append-only; never edit, reorder or delete an entry or a
  section heading** — source: `.claude/skills/engineering-insights/SKILL.md:13-21`.
  The agent may not write to these files at all, so it also may not add a
  "Promoted" 8th section or annotate an entry.
- **The seven fixed sections and their order** — `What Works`, `What Doesn't
  Work`, `Codebase Patterns`, `Tool & Library Notes`, `Recurring Errors &
  Fixes`, `Session Notes`, `Open Questions` — source: `server/INSIGHTS.md:9-46`,
  identical in all four files. Three of the seven are empty in **all four**
  files. That is a fact to report, not a defect to fix.
- **The only sanctioned mutation is a dated correction bullet**, and it is used
  exactly once in the whole corpus — source: `client/INSIGHTS.md:16`
  (`- 2026-08-05: correction to the entry below —`). The word "promote" does not
  appear anywhere in `engineering-insights/SKILL.md`.
- **`client/INSIGHTS.md:16` does not refute `client/INSIGHTS.md:17`.** It adds a
  negative result about `pgrep`; the entry below it is intact and correct — source:
  `client/INSIGHTS.md:16-17`. A correction narrows a claim; it does not void the
  entry beneath it.
- **`e2e/specs/` holds executable JSON flow specs, not prose** — source:
  `e2e/CLAUDE.md` (`specs/` here = **e2e flow specs** (JSON), not feature specs;
  `docs/` — topic docs **and feature specs for the e2e harness itself**), and
  `e2e/specs/` contains `01-app-boot.flow.json` … `08-conventions.flow.json`.
  Proposing a `.md` there is a hard error.
- **`server/clones/` is runtime data, not this project** — it holds cloned
  third-party repos (`server/clones/Maze-Logic/`, `server/clones/mate-academy/`)
  including a foreign 67-line `CLAUDE.md`. Excluded from every scan.
- **Severity is `CRITICAL / WARNING / SUGGESTION` and a parallel scale makes
  models inflate** — source: `.claude/agents/README.md:167`;
  `.claude/skills/pr-self-review/references/severity.md`. The curator therefore
  uses **no severity axis at all** — see `## Decide and justify`.
- **There is no lint or format gate anywhere in this repo** — source:
  `.claude/agents/README.md:166`. The agent may not run or propose one.
- **A read-only agent gets the read tool set plus `Bash`, `disallowedTools:
  Write, Edit, NotebookEdit`, and an explicit `Bash` allowlist in prose** —
  source: `.claude/agents/README.md:236-238`. The allowlist is load-bearing:
  "the harness cannot see inside a `Bash` call" (`README.md:51-54`).
- **`pr-self-review` may never appear in a `skills:` list** — source:
  `.claude/agents/README.md:60-61` (user-only skills cannot be preloaded).
- **A new agent needs a row in both the Catalog and the Permissions tables** —
  source: `.claude/agents/README.md:239-240` ("this file is the only index of
  the set").
- **No comments in new code** — root `CLAUDE.md`. Not directly at risk here
  (two markdown files), but the agent body must not instruct anyone to add one.
- **Root `CLAUDE.md` needs no edit.** It already delegates: `CLAUDE.md:49` —
  "`.claude/agents/` — Claude Code subagents (catalog in its README)". Do not
  open it.

## Decide and justify

These are the design calls the plan makes. The implementer executes them; it
does not re-open them.

### Model: `opus`

The three opus agents in this set — `planner`, `plan-verifier`,
`architecture-reviewer` — are the ones that hold a whole corpus in view and emit
a judgement per item. `insight-curator` does exactly that: 41 entries, six
clusters, six destination classes, and a coverage grep per proposal, with the
output being a proposal a human acts on rather than a diff a test checks. It
also runs rarely (a maintenance pass, not per-PR), so the cost of `opus` is
amortised across weeks. Sonnet's failure mode here is the expensive one:
proposing a promotion for something already promoted, which costs a human an
afternoon of reading.

### Tools: read-only, and how exactly

```
tools: Read, Grep, Glob, Bash, Skill, TodoWrite
disallowedTools: Write, Edit, NotebookEdit
```

This is the `plan-verifier` / `architecture-reviewer` shape verbatim
(`README.md:38-39`). `disallowedTools` is a denylist applied first, so a later
widening of `tools` cannot silently hand the curator a pen — the README is
honest that against an allowlist already omitting `Write` and `Edit` this
changes nothing today and is declared intent (`README.md:48-54`, `:201-203`).

`Bash` is the hole: the official docs say it can still write through `echo >`,
`sed -i`, or a subprocess that opens files itself, and that OS-level enforcement
needs the sandbox or a `PreToolUse` hook, neither of which this repo uses. So
the enforcement is prose, and the **prose allowlist is exactly this**:

> Allowed: `rg`, `ls`, `find`, `wc`, `cat`, `head`, `tail`, `git log`,
> `git show`, `git blame`, `git diff`, `git status`. Nothing else executes.
> Forbidden: `>`, `>>`, `tee`, `sed -i`, any inline `node -e` / `python -c` that
> opens a file, `git add|commit|checkout|switch|stash|push`, `gh`, package
> installs, `pnpm`, `npm`, builds, migrations, and anything that changes remote
> state. Never read under `server/clones/`. If asked to save the report to a
> file, decline and return it in the response.

`pnpm` and `npm` are named as forbidden rather than merely absent: this agent
reads markdown and never needs a typecheck, and naming them closes the "just run
the tests to check" improvisation.

### Preloaded skills: exactly one — `engineering-insights`

```
skills:
  - engineering-insights
```

The tempting alternative is to preload the skills the curator might promote
*into* — `zod`, `react-testing-library`, `frontend-ui-architecture`,
`onion-architecture` — on the theory that it needs their rules to judge "is this
already covered?". **It does not, and preloading them would answer the wrong
question.** Two of the three verified prior promotions landed in
`references/*.md` (`frontend-ui-architecture/references/examples.md:98,180`;
`onion-architecture/references/persistence.md:147`), and `skills:` injects only
`SKILL.md` — never `references/`. A preload would therefore give the curator a
confident but incomplete picture of what a skill already says, which is worse
than no picture. The coverage question is a **grep over the skill's whole
directory**, and that grep is exact.

`engineering-insights` is preloaded because it is the one skill whose *rules
bind the curator itself*: the append-only invariant, the three-part quality
gate, the section mapping, and the ~30-entry maintenance clause are the subject
matter, not a reference. At ~90 lines it is also the cheapest skill in the
project to carry.

**Cost of this choice:** the curator's sense of whether a rule *fits* a skill's
register is formed by reading that skill's files during the run, not by having
internalised them up front. It will occasionally propose a destination whose
house style it has only skimmed. That is the correct trade — a wrong-but-recoverable
destination suggestion costs a line of feedback; a false "not yet covered" costs
a duplicate rule in two places, which is the failure this agent exists to
prevent.

### `Skill` is present but fenced

`Skill` stays in `tools` for one narrow purpose, stated in the body: *when the
grep is ambiguous about whether a destination skill already carries a rule,
invoke that skill to read its `SKILL.md` in full.* It may not invoke a skill to
learn a domain, may not invoke `pr-self-review` ever, and may not turn a skill's
advice into a finding. This mirrors `plan-verifier`'s fenced `Skill`
(`plan-verifier.md:107-127`) rather than inventing a fourth pattern.

### No severity axis — a **disposition** axis instead

`README.md:167` records that a parallel severity scale makes models inflate, and
severity in this repo is owned by `pr-self-review` and `architecture-reviewer`.
Nothing a curator finds is a defect: a five-entry cluster is not a bug, and a
misfiled entry is not a `WARNING`. Grading them on that scale would either
inflate (everything becomes a WARNING) or collapse (everything becomes a
SUGGESTION and is ignored).

The axis is **disposition**, one value per entry, five values mirroring
`plan-verifier`'s five verdicts:

| Disposition | Meaning | Required with it |
|---|---|---|
| `LEAVE` | Stays only in INSIGHTS | The reason: `session-note` / `audit-trail` / `too-local` / `not-general` |
| `PROMOTE` | Proposed for a destination | Destination, form, and the coverage grep that came back empty |
| `ALREADY-PROMOTED` | Content found at a destination | The destination `path:line` |
| `MISFILED` | Wrong module, or wrong section within its file | Where it should sit, and who can move it (nobody — it is append-only) |
| `UNKNOWN` | Coverage could not be established | **Mandatory: what would settle it** |

`UNKNOWN` is a first-class answer — the "give the LLM a way out" rule at
`README.md:139`.

### The promotion ledger — resolving the append-only tension

`engineering-insights/SKILL.md:50-53` states a three-part quality gate whose
second clause is *"Is it invisible from just reading the code and existing docs
(CLAUDE.md, README, specs)?"*. That clause is a promotion criterion inverted:
the moment content is promoted into a skill or a `CLAUDE.md`, the corresponding
INSIGHTS entry retroactively fails it. But the hard invariant
(`SKILL.md:13-21`) forbids editing, reordering or deleting anything, so the
curator cannot mark an entry promoted, cannot add a section, and cannot
annotate. The one line authorising a curator to exist at all is `SKILL.md:64` —
*"The user spot-checks entries — they are a draft under review, not ground
truth."*

Three options were weighed:

1. **A ready-to-paste dated correction bullet** the user appends via
   `engineering-insights`. **Rejected.** A correction bullet asserts the entry
   below is *wrong*. A promoted entry is not wrong — it is now also elsewhere.
   Overloading the single correction mechanism to mean "promoted" would make the
   one genuine correction in the corpus (`client/INSIGHTS.md:16`) ambiguous, and
   it would require the curator to instruct a write into the file it is barred
   from.
2. **A new `docs/insights-promotions.md` ledger** the curator proposes and
   `doc-writer` creates. **Rejected.** It is a second source of truth about
   which entries are promoted, and it can drift from the actual destinations —
   which is precisely the duplication this agent exists to detect. Building the
   duplication problem into the fix is not a fix.
3. **The report is the only artifact, and the ledger is the back-link
   convention that already exists.** **Chosen.**

The convention is already in the tree and already works: the promoted copy is
*rewritten* for its destination (shorter, imperative, often with a code block),
the INSIGHTS original **stays** as the audit trail, and the promoted copy
back-links to `INSIGHTS.md` **by filename, never by line number** —
`frontend-ui-architecture/references/examples.md:98`,
`onion-architecture/references/persistence.md:147`. `README.md:157-179` keeps a
rule → source traceability table naming `client/INSIGHTS.md` for two rows; that
table is the closest thing in the repo to a promotion ledger and is the model
for the curator's output shape.

So the rule the agent carries is:

- Every promotion proposal's artifact body **includes the back-link line**, in
  the established shape (filename only, never `:NN`).
- The coverage check begins with `rg -n 'INSIGHTS' <destinations>` — reading the
  distributed ledger the previous promoter left behind.
- **Deleting the INSIGHTS original after promotion is never an option.** The
  back-link would dangle.
- Gate #2 stays violated on purpose for promoted entries, and the report says so
  under a fixed heading rather than resolving it silently.

**What this costs, stated plainly:**

1. **The analysis dies with the thread.** The report is not a file, so if nobody
   acts on it the work is lost and the next run redoes it from scratch. Accepted
   — the alternative is a file the agent may not write and a ledger that can lie.
2. **A promotion executed without a back-link is invisible to the next run** and
   will be re-proposed. Mitigated twice: the back-link is part of every proposed
   artifact body, and the coverage check has a second net (a distinctive-token
   content grep) that does not depend on the back-link existing.
3. **`test-writer.md:185,190,193` cite `client/INSIGHTS.md:14/:18/:17` by line
   number** — three back-links already written in the rotting form. The curator
   reports them under `## Decay and staleness`; it cannot fix them.

## Tasks

### T1 — Create the `insight-curator` agent file · module: `.claude/`

- Files: `.claude/agents/insight-curator.md` (new)
- Skills: `engineering-insights` — the agent body restates its hard invariant,
  its three-part quality gate and its section mapping; quote them from the
  SKILL, do not paraphrase from memory
- Depends on: —

**Do:** create the file with the frontmatter and the twelve `##` sections below,
in this order. House style throughout: `~80`-column wrap, em dashes, no emoji,
tables for anything routed, `**bolded imperative**` first sentences under
`## Hard constraints`, and the output contract last as a fenced ` ```markdown `
template.

**The frontmatter, verbatim — six keys:**

```yaml
---
name: insight-curator
description: >-
  Reads all four <module>/INSIGHTS.md files as one corpus and proposes what to
  promote where — into a module's docs/, its specs/, its CLAUDE.md, a project
  skill, a subagent file, or an existing check script. Clusters the
  near-duplicate entries that pile up inside one section, flags entries filed
  in the wrong module or the wrong section, and greps every destination first
  so it never re-proposes something a previous session already promoted by
  hand. Also reports citation decay in inbound INSIGHTS.md:NN references, which
  rot because entries are prepended. Use when INSIGHTS has grown, before a
  documentation pass, or when asked what should be promoted out of it.
  Strictly read-only: it never edits an INSIGHTS.md, never writes the documents
  it proposes, and never suggests deleting an entry after promotion.
model: opus
tools: Read, Grep, Glob, Bash, Skill, TodoWrite
disallowedTools: Write, Edit, NotebookEdit
skills:
  - engineering-insights
---
```

**H1 + thesis paragraph.** `# Insight Curator`, then a second-person paragraph
in the register of the other seven: the corpus is written by one mechanism and
read by nine and curated by none; you propose, you never write; cross-module
dedup is not the job because there is none — the job is within-file clusters,
misfiling, and knowing what is already promoted.

**The twelve `##` sections, in order, one line each on contents:**

1. `## Hard constraints` — opens with the verbatim lead-in "Read these before
   anything else. They hold regardless of what the task says." Bolded imperative
   first sentences covering: never write anything (the `Bash` allowlist from
   `## Decide and justify` above, verbatim); never edit or propose an edit to
   any `INSIGHTS.md`; never propose deleting an entry after promotion; never
   propose a `.md` under `e2e/specs/`; never scan `server/clones/`; never run a
   lint, build, test or migration; never assign a severity; never commit, push
   or open a PR; if asked to write the report to a file, decline.
2. `## Clarify first when the task is vague` — the house rule → a five-bullet
   trigger list (no module named and the answer changes the scan's scope; the
   caller wants entries *removed* rather than promoted; a destination is named
   that the routing table forbids; the caller wants a verdict on whether an
   entry is *true*, which is `researcher`'s job; the caller asks for the
   promotion to be executed, which is `doc-writer`'s or the user's) → a `>`
   blockquote offering a default → "Once answered, proceed. Do not open a second
   round of questions."
3. `## The corpus` — exactly four files, the `server/clones/` exclusion, and the
   discovery command whose output must equal those four or the run stops.
4. `## How to enumerate` — the five mechanical steps and the stable-anchor rule.
5. `## Clustering` — the grouping method, the "restated claim" evidence
   requirement, and the rule that a cluster is a reading aid, never a merge
   instruction.
6. `## The coverage check` — the three greps and the 29% false-positive warning.
7. `## Where a promotion goes` — the seven-row destination routing table plus
   its three hard rules.
8. `## What never moves` — Session Notes, the correction bullet, the audit
   trail, and the promotion-ledger resolution.
9. `## Dispositions` — the five values and what each requires.
10. `## Decay and staleness` — citation decay and evidence-path staleness, both
    with their expected-result baselines.
11. `## Using the Skill tool` — the fence.
12. `## Report format` — the fenced ` ```markdown ` template, last section.

**Contents of section 3 — `## The corpus`.** Exactly four files:
`server/INSIGHTS.md`, `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`,
`e2e/INSIGHTS.md`. The body carries this command and the rule that its output
must equal those four:

```
find . -name 'INSIGHTS.md' -not -path '*/node_modules/*' -not -path './server/clones/*'
```

A fifth file is a corpus change: stop and report it rather than absorbing it
silently. `reviewer-core/INSIGHTS.md` is a pristine template with **zero** dated
bullets and all seven sections empty — that is not a defect, generates no
finding, and gets exactly one line in the report.

**Contents of section 4 — `## How to enumerate`.** Five steps, in order,
designed so no entry can be silently skipped:

**(a) Count before reading.**

```
rg -c '^- 20[0-9]{2}-[0-9]{2}-[0-9]{2}: ' server/INSIGHTS.md client/INSIGHTS.md reviewer-core/INSIGHTS.md e2e/INSIGHTS.md
```

Record the per-file count and the sum. The 2026-08-09 baseline is server 18,
client 20, reviewer-core 0, e2e 3 → **ΣN = 41**. `rg -c` prints no line for a
file with zero matches; that is expected for `reviewer-core/` and is not an
error. **The ledger must contain exactly ΣN rows.** Fewer rows means the report
is invalid — go back and finish it. Paste the command output at the top of the
report so the reader can check the arithmetic.

**(b) Assign each bullet to its section** without a parser, by interleaving
headings and bullets in line order:

```
rg -n '^## |^- 20[0-9]{2}-' <file>
```

A bullet's section is the nearest preceding `## ` line.

**(c) Build the stable anchor.** `<module>:<YYYY-MM-DD>:<first six words after
the date>` — for example `client:2026-08-01:SEV in vendor/ui/primitives/tokens.ts
is the`. **Never identify an entry by `<module>/INSIGHTS.md:NN`.** Entries are
prepended, so line numbers rot; `docs/improvement-plan-2026-08-03.md:365`
already points at the wrong entry. A current line number may appear in the
ledger as a navigation aid only, in parentheses, marked "as of this run".

**(d) Build the Session-Notes join table first.**

```
rg -n -A 20 '^## Session Notes' server/INSIGHTS.md client/INSIGHTS.md e2e/INSIGHTS.md
```

Every Session Note ends by naming the spec file it produced, and the dates match
the filenames in `server/specs/` and `client/specs/` exactly
(`2026-07-29-run-cost`, `2026-08-01-findings-by-severity`, `2026-08-04-skills`,
`2026-08-05-conventions`). That map is the fastest available answer to "is this
already in `specs/`?" — a dated bullet sharing a date with a Session Note is
presumed described by that note's spec until the coverage grep says otherwise.

**(e) Extract every evidence path.**

```
rg -o '\(evidence:[^)]*\)' <file>
```

Two uses: the staleness check in section 10, and the clustering key in section 5.

**Contents of section 5 — `## Clustering`.** Two entries belong to one cluster
when **any two** of these hold: same file *and* same section; dated within seven
days of each other; their evidence tails name the same file or the same
directory; one restates a claim the other makes. The evidence-path index from
step (e) does most of the work — it is what groups the JobRunner entries
(`platform/jobs.ts`, `modules/conventions/`), the findings-aggregate entries
(`modules/pulls/`), the trace-race entries (`test/reviews.it.test.ts`), the
severity entries (`vendor/ui/primitives/tokens.ts`) and the CSS entries
(`styles.ts`).

Every cluster reported must carry a **restated claim** list: a claim appearing
in two or more members, **quoted from each**, with each member's anchor. That is
what makes "stated three times" checkable rather than asserted. The 2026-08-09
baseline is six clusters; the strongest is the five-entry JobRunner cluster in
`server/INSIGHTS.md` `## Codebase Patterns`, in which "the 120s timeout is
GLOBAL, no per-kind override" appears in three entries and "retry re-runs the
whole pipeline at full token cost" in two.

**A cluster is a reading aid, never a merge instruction.** The curator proposes
*one* promoted artifact that supersedes the cluster's overlap. The members stay
where they are, untouched, as the audit trail the artifact back-links to.

**Cross-file dedup gets one line.** The 2026-08-09 baseline is **zero** literal
cross-file duplicates — the `engineering-insights` no-copy-paste rule is being
honoured. A run that finds none says "0, as expected" and does not pad. A run
that finds one has found news.

**Contents of section 6 — `## The coverage check`.** Nine of 31 insights (29%)
are already promoted by hand. **No `PROMOTE` disposition may be assigned without
the greps below coming back empty, and their output pasted.**

Grep 1 — the back-link ledger a previous promoter left behind:

```
rg -n 'INSIGHTS' .claude/skills .claude/agents server/specs client/specs \
  server/docs client/docs reviewer-core/docs e2e/docs \
  CLAUDE.md README.md TESTING.md docs \
  server/CLAUDE.md client/CLAUDE.md reviewer-core/CLAUDE.md e2e/CLAUDE.md
```

Grep 2 — the entry's most distinctive literal token (a symbol, a filename, a
flag — `SEV_COLOR`, `extensionAlias`, `getByDisplayValue`, `withTimeout`), over
the same paths. Grep 2 is the net that catches a promotion whose author forgot
the back-link.

Grep 3, for `server/` and `client/` entries only — the paired-spec cross-check.
`server/specs/2026-08-05-conventions.md` is 442 lines and covers the same week
as the JobRunner cluster, so for those entries the most likely honest answer is
**"you already wrote this down twice"**, not "promote it". Diff against the
paired spec before proposing anything spec-shaped.

Any hit in any of the three makes the entry `ALREADY-PROMOTED` with the
destination `path:line`, not `PROMOTE`.

**Contents of section 7 — `## Where a promotion goes`.** The routing table the
agent carries:

| Destination | Take it when | Form | What it costs |
|---|---|---|---|
| `<module>/docs/<topic>.md` | A cluster of 3+ entries on one subsystem needs prose longer than a bullet; or the content is operational / how-to | how-to or reference, in `doc-writer`'s forms | Nothing. All four `docs/` folders are `.gitkeep`-only and every module CLAUDE.md already points readers at them. **Lowest-friction destination in the repo** |
| `<module>/specs/YYYY-MM-DD-<topic>.md` | Component-specific *behaviour*, with tests already named in the entry, on a topic that has or deserves a dated spec | `**Component:**` / `**Behavior:**` pairs, `**Why X and not Y**`, `## Out of scope` | Run grep 3 first. `server/` and `client/` specs are **paired by date+topic** and a new file must not break that pairing |
| `<module>/CLAUDE.md`, under `## Conventions (non-default)` or `## Gotchas / Do not touch` | A hard, mechanical, 1–3 line rule with no nuance, needed *before* work starts | A compressed imperative bullet in the existing register | **Auto-loads every session**, so every line is permanent token cost. Files run 40–55 lines and that ceiling is doing real work. INSIGHTS entries run 400–900 chars, so this is **compression, not a move** |
| A project skill — an existing skill's `references/*.md`, or its `SKILL.md` | The rule is general beyond this module: it would still be true in another project using that library | Rewritten imperative, often with a code block, plus the `INSIGHTS.md` back-link | Prefer an existing skill's `references/`. A **new** skill is a 4–9 file house shape (`SKILL.md` + `README.md` + `CHANGELOG.md` + `references/`) *and* a catalog row in `.claude/skills/README.md` |
| `.claude/agents/<agent>.md` | The rule changes how one subagent must behave — a test convention, a trap it would otherwise fall into | A bullet in that agent's traps section | The agent's body is its entire instruction set and is paid for on every run. This is where three `client/` entries actually went (`test-writer.md:180-193`) |
| A skill's `assets/*.sh` | The rule is a **check**, not prose — mechanically greppable | A function in a script that already exists | Only where a script exists. `pr-self-review/assets/preflight.sh` already greps for INSIGHTS-adjacent violations |
| Root `CLAUDE.md`, or a root `docs/<topic>.md` | The insight spans two or more modules **and** a script — too cross-cutting for one module's INSIGHTS, too operational for a skill | Root doc | Root `CLAUDE.md` is 54 lines and auto-loads for **every** session in **every** module. The bar is highest here |

Three hard rules under the table:

- **`e2e/specs/` is executable JSON, never prose.** `e2e/CLAUDE.md` says it
  outright: "`specs/` here = **e2e flow specs** (JSON), not feature specs", and
  "`docs/` — topic docs **and feature specs for the e2e harness itself**". Prose
  for `e2e/` goes to `e2e/docs/`. A `.md` proposed under `e2e/specs/` is a hard
  error, not a judgement call.
- **`reviewer-core/CLAUDE.md` has no `## Conventions (non-default)` section.** A
  CLAUDE.md promotion there means proposing a *new section*. Say so; do not
  assume the section exists.
- **`engineering-insights` is the least-developed skill in the project** — 90
  lines, one file, no `references/`, no `README.md`, no `CHANGELOG.md`, no
  `evals/`. Adding to it means creating that structure, which is a larger
  proposal than it looks. Flag the cost.

**Contents of section 8 — `## What never moves`.** Four rules:

- **All ten Session Notes stay.** They are not noise: every one names the spec
  it produced, and they are the join table from step (d). Disposition `LEAVE`,
  reason `session-note`. They still get a ledger row, because the row count must
  reconcile with `rg -c`.
- **The correction bullet at `client/INSIGHTS.md:16` stays and is never promoted
  independently.** Once its cluster is promoted, its remaining value is the
  audit trail. And it does **not** refute the entry below it — it adds a
  negative result about `pgrep`. Never mark an entry superseded because a
  correction sits above it. Read both.
- **The original never leaves after promotion.** The promoted copy back-links to
  `INSIGHTS.md` by filename; deleting the original dangles the link. Proposing a
  deletion is a hard error.
- **The promotion ledger is the back-link convention, not a file.** State the
  gate-#2 tension in the report rather than resolving it: a promoted entry
  retroactively fails `engineering-insights/SKILL.md:50-53`'s "is it invisible
  from the docs?" clause, on purpose, because it is the audit trail.

**Contents of section 9 — `## Dispositions`.** The five-value table from
`## Decide and justify` above, verbatim, plus: `UNKNOWN` is a first-class answer
and a report with none in it should be checked for guessing.

**Contents of section 10 — `## Decay and staleness`.** Two checks, both cheap,
both with a stated baseline so a correct empty result is recognisable:

*Citation decay.* Grep 1 from section 6 also finds every inbound
`INSIGHTS.md:NN` citation. For each, read the cited line and check it is still
the entry the citing text describes. Known state at 2026-08-09:
`docs/improvement-plan-2026-08-03.md:365` cites `client/INSIGHTS.md:23` for the
`SEV_COLOR` entry, which is now at line 28 — **already rotted**;
`test-writer.md:185,190,193` cite `:14`, `:18`, `:17` and still resolve, by
luck. The fix is always the same and the curator only proposes it: replace the
line number with the stable anchor.

*Evidence staleness.* Verify-then-report, and **expect zero**. `ls` each path
extracted in step (e); report only the failures. The 2026-08-09 baseline is
31 of 31 resolving. Do not deep-verify an entry's *claim* — that is
`researcher`'s job — with one exception: an entry that **contradicts** a
`CLAUDE.md`, a README or a skill is a separate finding class, and the
contradiction does not imply the entry is the wrong side. Two worked examples to
carry:

- `client/INSIGHTS.md:22` says `react-best-practices` contradicts this
  codebase. It is right: `react-best-practices/SKILL.md:117` says "Use utility
  classes for all styling — no inline `style={}` objects" while `client/`
  deliberately styles via inline objects in `styles.ts`.
  `frontend-ui-architecture/SKILL.md:159` restates the resolution — **and one
  project skill is still shipping a rule the project rejects.** An insight that
  contradicts a skill means either the skill or the insight must move; that is a
  finding in its own right.
- `server/CLAUDE.md` says "edit `src/db/schema.ts`" while `server/src/db/` holds
  both `schema.ts` and a `schema/` directory of 17 files, and
  `server/INSIGHTS.md:14` cites `server/src/db/schema/knowledge.ts`. Here **the
  INSIGHTS entry is right and the `CLAUDE.md` line is the stale one.**

Also report **unexecuted instructions pointing at INSIGHTS**:
`onion-architecture/references/migration.md:122` tells a future session to
"record the finding in `server/INSIGHTS.md`" about duplicated grounding-gate
copies in `reviewer-core`, and nobody has. Grep 1 surfaces these.

**Contents of section 11 — `## Using the Skill tool`.** `Skill` is fenced to one
question: *does this destination skill already carry this rule?* — and only when
grep is ambiguous. It may not be invoked to learn a domain, may not be invoked
for `pr-self-review` under any circumstance, and nothing a skill surfaces may
become a finding that no entry in the ledger covers. Note in the body that
`skills:` injects only `SKILL.md`, never `references/`, which is why grep is the
primary instrument and `Skill` the fallback.

**Contents of section 12 — `## Report format`.** Opens "Start at `## Corpus`. No
preamble." Then this template, verbatim, in a ` ```markdown ` fence. **The
eleven headings inside this fence are report headings, not body sections** —
they are why the section-count check in `Done when` reads the *order* of
headings rather than a bare total.

````markdown
## Corpus
| File | Dated bullets | Session Notes | Insights | Empty sections |
|---|---|---|---|---|
| `server/INSIGHTS.md` | 18 | 5 | 13 | What Works, Recurring Errors & Fixes, Open Questions |

`rg -c` output, verbatim:
<paste>

ΣN = <n>   Ledger rows = <n>   (these must be equal)

## Disposition ledger
| Anchor | Module | Section | Disposition | Destination | Already covered? |
|---|---|---|---|---|---|
| `client:2026-08-01:SEV in vendor/ui/primitives/tokens.ts` (line 28 as of this run) | client | Codebase Patterns | ALREADY-PROMOTED | — | `frontend-ui-architecture/references/examples.md:98` |

## Clusters
| # | Module · section | Members | Subsystem | Proposed single artifact |
|---|---|---|---|---|
| A | server · Codebase Patterns | 5 | `src/platform/jobs.ts` | `server/docs/jobrunner.md` |

### Cluster A — restated claims
- "the 120s timeout is GLOBAL, no per-kind override" — appears in:
  - `<anchor>`: "<quote>"
  - `<anchor>`: "<quote>"
  - `<anchor>`: "<quote>"

## Promotion proposals
| From (anchor) | To | Form | Why there | Already covered? |
|---|---|---|---|---|
| `<anchor>` | `server/docs/jobrunner.md` | how-to | 5-entry cluster, one subsystem, needs prose | greps 1-3 empty — output below |

Coverage grep output, verbatim, one block per proposal:
<paste>

## Misfiled
| Anchor | Filed in | Belongs in | Why | Who can move it |
|---|---|---|---|---|
| `<anchor>` | `client/INSIGHTS.md` · What Doesn't Work | `e2e/` — the script is run from there | anyone in `e2e/` never opens `client/INSIGHTS.md` | nobody — append-only; propose a cross-post at the destination instead |

## Contradictions
| Entry | Contradicts | Which side is stale | Evidence |
|---|---|---|---|

## Decay and staleness
| Citing file | Cites | Still resolves? | Stable anchor to use instead |
|---|---|---|---|

| Anchor | Evidence path | Exists? |
|---|---|---|

<expected result: zero missing paths. Say "0 of <n> paths missing" and move on.>

| Unexecuted INSIGHTS instruction | Source | Executed? |
|---|---|---|

## Leave alone
| Anchor | Reason |
|---|---|
| `<anchor>` | session-note — names the spec it produced; also a join-table row |

## Ready-to-paste artifacts
<full proposed body of each new or edited file, fenced. This agent cannot write,
so the report IS the deliverable. Every body ends with the back-link line in the
established shape — filename only, never `:NN`.>

## The gate-2 note
<one paragraph: which entries now fail `engineering-insights`' "is it invisible
from the docs?" clause because they were promoted, and why they stay anyway.>

## Handoff
- `doc-writer` executes: <the `<module>/docs/` and `<module>/specs/` proposals>
- The user executes: <the `CLAUDE.md` and `.claude/` proposals — no agent may
  write there>
- Nobody executes: <the INSIGHTS.md side — append-only, and nothing is deleted>
````

**Done when:**

- `.claude/agents/insight-curator.md` exists.
- Its YAML frontmatter parses and declares exactly the **six** keys in the
  fenced block above, in that order: `name`, `description`, `model`, `tools`,
  `disallowedTools`, `skills`.
- `model` is `opus`; `tools` is `Read, Grep, Glob, Bash, Skill, TodoWrite`;
  `disallowedTools` is `Write, Edit, NotebookEdit`; `skills` lists exactly one
  entry, `engineering-insights`.
- `rg -n '^## ' .claude/agents/insight-curator.md` lists the **twelve body
  sections first, in the order given above**, beginning with
  `## Hard constraints` and ending with `## Report format`. Every `^## ` line
  after `## Report format` belongs to the report template inside the fence, and
  there are **eleven** of them — `Corpus`, `Disposition ledger`, `Clusters`,
  `Promotion proposals`, `Misfiled`, `Contradictions`, `Decay and staleness`,
  `Leave alone`, `Ready-to-paste artifacts`, `The gate-2 note`, `Handoff`. Total
  `^## ` lines: **23**. (`rg` counts inside fences; `doc-writer.md` reports 17
  for the same reason.)
- `## Hard constraints` opens with the verbatim sentence "Read these before
  anything else. They hold regardless of what the task says."
- The prose `Bash` allowlist appears in `## Hard constraints` and names `rg`,
  `ls`, `find`, `wc`, `cat`, `head`, `tail` and the five read-only `git`
  subcommands as allowed, and `>`, `>>`, `tee`, `sed -i`, `gh`, `pnpm`, `npm`
  and `server/clones/` as forbidden.
- `## Where a promotion goes` contains a table with exactly **seven**
  destination rows and, below it, the three hard rules — the `e2e/specs/` JSON
  trap, the missing `reviewer-core/CLAUDE.md` conventions section, and the
  `engineering-insights` skill-structure cost.
- `## Dispositions` names exactly the five values `LEAVE`, `PROMOTE`,
  `ALREADY-PROMOTED`, `MISFILED`, `UNKNOWN`.
- **None of the strings `CRITICAL`, `WARNING` or `SUGGESTION` appears anywhere
  in the file** — the curator has no severity axis, and the sample tokens in
  section 6 were chosen to avoid them.
- `pr-self-review` appears only as a forbidden invocation, never in `skills:`.
- `## Report format` is the last **body** section and its template is inside a
  ` ```markdown ` fence.
- Every `path:line` cited in the file resolves.

**Verify:**

```
ls -l .claude/agents/insight-curator.md
head -24 .claude/agents/insight-curator.md
rg -n '^## ' .claude/agents/insight-curator.md
rg -c '^## ' .claude/agents/insight-curator.md
rg -n 'CRITICAL|WARNING|SUGGESTION' .claude/agents/insight-curator.md
```

`rg -n '^## '` must show the twelve body titles in the T1 order before any
template heading; `rg -c '^## '` must print `23`. The severity grep must print
nothing. Then `ls` or `rg -n` each `path:line` the file cites and confirm it
resolves. **Never run a lint command — there is none in this repo.**

---

### T2 — Index the agent in the README Catalog and Permissions tables · module: `.claude/`

- Files: `.claude/agents/README.md` (edit)
- Skills: none — plain edit. (`.claude/` is not one of the four modules that
  own an `INSIGHTS.md`, so the wrap-up append rule does not fire here.)
- Depends on: T1

**Do:** add one row to each of the two tables. `README.md:239-240` is explicit
that this file is the only index of the set, so an agent missing from either
table is invisible.

Catalog row, appended after the `doc-writer` row at `README.md:28`, matching the
five-column shape `| Agent | Model | Responsibility | Input | Output |`:

- **Agent:** `[insight-curator](insight-curator.md)`
- **Model:** `opus`
- **Responsibility:** Reads the four `INSIGHTS.md` files as one corpus and
  proposes what to promote where — clusters, misfiling, and what is already
  promoted
- **Input:** Nothing, or a module to scope the scan to
- **Output:** A report in the thread: corpus counts, a disposition ledger with
  one row per dated bullet, clusters with restated claims, promotion proposals
  with the coverage grep, and ready-to-paste artifact bodies

Permissions row, appended after the `doc-writer` row at `README.md:40`, matching
the four-column shape `| Agent | Tools | Preloaded skills | Cannot |`:

- **Tools:** `` `Read, Grep, Glob, Bash, Skill, TodoWrite` — plus
  `disallowedTools: Write, Edit, NotebookEdit` ``
- **Preloaded skills:** `1 — engineering-insights (~2k tokens); Skill is fenced
  to one question: does this destination skill already carry this rule`
- **Cannot:** `Write or edit anything, including every INSIGHTS.md; Bash is a
  read-only allowlist; scan server/clones/; propose deleting an entry after
  promotion; propose a .md under e2e/specs/; assign a severity; execute the
  promotions it proposes`

**Done when:**

- `rg -c '^\| \[' .claude/agents/README.md` returns `8` — the Catalog held 7
  linked rows before this task and gains exactly one.
- `rg -n 'insight-curator' .claude/agents/README.md` returns **at least two**
  lines, one inside the Catalog table and one inside the Permissions table.
- The Catalog row has five `|`-delimited cells and the Permissions row has four,
  matching their headers.
- The Catalog row links to `insight-curator.md` and that file exists.
- No existing row was reordered or reworded — `git diff` on this file shows only
  added lines in this task.

**Verify:**

```
rg -n 'insight-curator' .claude/agents/README.md
rg -c '^\| \[' .claude/agents/README.md
git diff -- .claude/agents/README.md
```

---

### T3 — Place the agent in the chain diagram and record its sources · module: `.claude/`

- Files: `.claude/agents/README.md` (edit)
- Skills: none — plain edit. The chain block at `README.md:65-83` is an ASCII
  fence, not Mermaid, so `mermaid-diagram` does not apply.
- Depends on: T2

**Do:** three edits to the same file.

**(a) The chain diagram.** `insight-curator` is **not** in the PR chain — it
does not sit between `implementer` and a merge. It runs on its own cadence, over
the artifact every other agent leaves behind. Add it as a separate band below the
existing block, inside the same fence, and add one prose sentence after the block
saying it runs off-chain. Shape:

```
   INSIGHTS.md ×4  ──→  insight-curator  ──→  proposal  ──→  doc-writer
  (what every agent      (cluster, route,      (a report,      (or the user,
   appended at wrap-up)   already promoted?)    not a file)     for .claude/)
```

The prose sentence states the closed loop: `implementer` and `test-writer`
append at wrap-up through `engineering-insights`, and `insight-curator` is the
only thing that ever reads all four files together — but it appends nothing, so
the loop closes through a human.

**(b) `### This repo's own conventions`** (`README.md:157-179`) — add these rows,
each `| Rule | Source | Carried by |`:

| Rule | Source | Carried by |
|---|---|---|
| INSIGHTS.md is append-only: never edit, reorder or delete an entry or a section heading; the only sanctioned mutation is a dated correction bullet | `.claude/skills/engineering-insights/SKILL.md:13-21` | `insight-curator` `## Hard constraints` and `## What never moves` |
| The quality gate's clause "is it invisible from the code and existing docs" is a promotion criterion inverted — a promoted entry retroactively fails it | `.claude/skills/engineering-insights/SKILL.md:50-53` | `insight-curator` — the gate-2 note in its report |
| "The user spot-checks entries — they are a draft under review, not ground truth" | `.claude/skills/engineering-insights/SKILL.md:64` | The line that authorises this agent to exist at all |
| The prune clause triggers at ~30 entries per section and is dormant — the largest section today is 9, and it is blind to duplication | `.claude/skills/engineering-insights/SKILL.md:87-90` | `insight-curator` `## Clustering` — clusters, not volume, are the trigger |
| `e2e/specs/` holds executable JSON flow specs, not prose; prose for `e2e/` goes to `e2e/docs/` | `e2e/CLAUDE.md` `## Docs` | `insight-curator` `## Where a promotion goes`, as a hard rule |
| All four `<module>/docs/` folders are `.gitkeep`-only, and every module CLAUDE.md already points readers at them | `server/docs/`, `client/docs/`, `reviewer-core/docs/`, `e2e/docs/` | `insight-curator`'s routing table — the lowest-friction destination |
| A module CLAUDE.md auto-loads every session and runs 40–55 lines; promotion there is compression, not a move | `server/CLAUDE.md`, `client/CLAUDE.md`, `e2e/CLAUDE.md`, `reviewer-core/CLAUDE.md` | Same table, the cost column |
| `server/clones/` holds cloned third-party repos, including a foreign `CLAUDE.md` — runtime data, not this project | `server/clones/Maze-Logic/`, `server/clones/mate-academy/` | `insight-curator` `## Hard constraints` and `## The corpus` |
| The promoted copy back-links to `INSIGHTS.md` by **filename**, and the original stays as the audit trail | `.claude/skills/frontend-ui-architecture/references/examples.md:98`; `.claude/skills/onion-architecture/references/persistence.md:147` | `insight-curator` `## What never moves` — the distributed promotion ledger |

**(c) `### Verified against this machine, not taken on faith`** (`README.md:181-209`)
— append the facts this plan established by running the commands, and only
those:

- The corpus is exactly four files. `find . -name 'INSIGHTS.md' -not -path
  '*/node_modules/*' -not -path './server/clones/*'` returns
  `server/`, `client/`, `reviewer-core/`, `e2e/` and nothing else.
- Counts at 2026-08-09: server 18 dated bullets, client 20, `reviewer-core` **0**
  (a pristine template, all seven sections empty), e2e 3 — ΣN = 41, of which 10
  are Session Notes.
- Zero literal cross-file duplicates. The `engineering-insights` no-copy-paste
  rule is being honoured, which is why this agent is not a cross-file deduper.
- Citation decay is real and already happened:
  `docs/improvement-plan-2026-08-03.md:365` cites `client/INSIGHTS.md:23` for the
  `SEV_COLOR` entry, which is now at line **28**.
- The `react-best-practices` contradiction is live:
  `react-best-practices/SKILL.md:117` says "Use utility classes for all styling
  — no inline `style={}` objects", which `client/` rejects;
  `frontend-ui-architecture/SKILL.md:159` restates the resolution and the skill
  still ships the rejected rule.
- `onion-architecture/references/migration.md:122` instructs a future session to
  record a finding in `server/INSIGHTS.md`. It has not been recorded.

Also append one honest line to the *"Not yet verified"* list in the same H3:
**that `insight-curator` registers as a subagent has not been checked at plan
time** — it is the end-to-end verification below.

**Done when:**

- The chain fence at `README.md:65-83` contains `insight-curator`, in a band
  visually separate from the `researcher → planner → … → doc-writer` chain, and
  is followed by a prose sentence stating the agent runs off-chain and appends
  nothing.
- `### This repo's own conventions` gained the **nine** rows listed above, each
  with a `path:line` or a path in its Source cell, each naming `insight-curator`
  in its Carried by cell.
- `### Verified against this machine, not taken on faith` gained the **six**
  bullets listed above plus **one** line in its "Not yet verified" list.
- Every `path:line` added in this task resolves.
- No existing row, bullet or diagram edge was removed or reworded — `git diff`
  shows only added lines plus the diagram band.

**Verify:**

```
rg -n 'insight-curator' .claude/agents/README.md
rg -n 'engineering-insights/SKILL.md' .claude/agents/README.md
git diff -- .claude/agents/README.md
```

Then `ls` or `rg -n` each `path:line` added in this task and confirm it
resolves. **Never run a lint command — there is none in this repo.**

## Contract & version impact

**None. PATCH.**

Nothing here touches `vendor/shared`, an HTTP route, a response field, a
`reviewer-core` export or a database column. Two markdown files under `.claude/`
change; no package's `package.json` is opened and every package stays at
`0.0.0`.

The one surface worth naming explicitly: `.claude/agents/README.md` is the index
of the agent set, and `semver-discipline`'s project profile treats a skill's
`description` and output format as a surface. **Adding** an agent and **adding**
rows to an index are additive on every axis — no existing agent's `description`,
`tools`, `skills:` or report format is touched, so no consumer of the set
changes behaviour. `deprecation-policy` and `breaking-change` have nothing to
act on: nothing is removed, renamed or narrowed, so no `@deprecated` marker is
required and no expand → migrate → contract sequence applies.

Two second-order notes, neither a version event:

- `engineering-insights/SKILL.md` is **not** edited by this plan, despite the
  vocabulary gap (`promote` appears nowhere in it). Editing a skill's rules is a
  MINOR for every agent that loads it and belongs in its own change — see
  `## Open questions`.
- No `INSIGHTS.md` is touched, by this plan or by the agent it creates. The
  append-only invariant is preserved by construction, not by discipline.

## Verification (end to end)

In order. The first four need no model; the fifth is the only one that does.

1. **The agent file exists and parses.**
   ```
   ls -l .claude/agents/insight-curator.md
   head -24 .claude/agents/insight-curator.md
   ```
   The frontmatter shows exactly six keys in the order `name`, `description`,
   `model`, `tools`, `disallowedTools`, `skills`.

2. **The body has the twelve sections in order, and no severity vocabulary.**
   ```
   rg -n '^## ' .claude/agents/insight-curator.md
   rg -c '^## ' .claude/agents/insight-curator.md
   rg -n 'CRITICAL|WARNING|SUGGESTION' .claude/agents/insight-curator.md
   ```
   The first lists the twelve body titles in T1's order before any template
   heading. The second prints `23` — twelve body sections plus the eleven report
   headings inside the fence, which `rg` counts because it does not parse
   fences. The third prints nothing.

3. **The index is complete.**
   ```
   rg -n 'insight-curator' .claude/agents/README.md
   rg -c '^\| \[' .claude/agents/README.md
   ```
   The first shows hits in the Catalog table, the Permissions table, the chain
   fence, the conventions H3 and the verified H3. The second prints `8`.

4. **Every new citation resolves.** For each `path:line` added by T1 and T3, run
   `rg -n` or `ls` against it. A citation that does not resolve is a defect in
   the file, not in the check.

5. **The agent registers.** This is the same check
   `.claude/agents/README.md:183-197` records for the other seven — a headless
   run must list the new agent among the available subagent types:
   ```
   claude -p 'List your available subagent types. Do not use any tools.'
   ```
   `insight-curator` must appear alongside the existing seven, and `README.md`
   must still be ignored rather than parsed as an agent. This is the one step
   that costs tokens; run it last, once.

**No lint, no format, no build, no test.** There is no lint script in any module
of this repo and nothing in this change is executable code.

## Out of scope

- **Editing `engineering-insights/SKILL.md`.** The skill has no vocabulary for
  promotion and no `references/`, `README.md`, `CHANGELOG.md` or `evals/`. Fixing
  that is a real change with real consumers (nine readers) and it is not this
  plan.
- **Executing any promotion.** No `<module>/docs/` file, no spec, no
  `CLAUDE.md` line and no skill edit is written here. The agent proposes; a
  human or `doc-writer` executes.
- **Fixing the six clusters, the misfiled `client/INSIGHTS.md:15` entry, or the
  rotted citation at `docs/improvement-plan-2026-08-03.md:365`.** They are the
  agent's first real input, not this plan's deliverables.
- **Resolving the `react-best-practices` contradiction.** One project skill is
  shipping a rule this codebase rejects. That is a skill change with its own
  blast radius.
- **A security agent, or any `security` skill routing.** The curator reads
  repo-authored markdown only; there is no untrusted content and no prompt
  surface. `.claude/agents/README.md:81-82` still shows security review as an
  agent not yet written, and this plan does not write it.
- **A `PreToolUse` hook to make `Bash` genuinely read-only.** The README is
  already honest that the allowlists are prose. Closing that gap is a
  `.claude/settings.json` change affecting three agents, not one.
- **Automating any of this as a script.** A `scripts/insights-audit.sh` that
  counts bullets and runs the coverage greps is a plausible follow-up; the
  judgement half — clustering and routing — is not scriptable, so the split
  would need its own design.

## Open questions

1. **Should `engineering-insights/SKILL.md` gain promotion vocabulary?** Today
   the word does not appear, and its only maintenance clause is volume-triggered
   at ~30 entries per section — dormant, since the largest section is 9. The
   curator works fine without it, but every appending session stays unaware that
   promotion is a thing that happens. **Default if unanswered: leave the skill
   alone**, and let the curator's report be the only place promotion is
   discussed.

2. **Who executes a `CLAUDE.md` or `.claude/` promotion?** `doc-writer` is
   barred from both (`doc-writer.md:72-73`), and no other agent may write there,
   so those proposals land on the user personally. Is that acceptable, or should
   the `## Handoff` section instead route them to `planner` as a follow-up plan?
   **Default if unanswered: the user**, as written in the T1 report template.

3. **Should the curator be scoped by module by default?** The design scans all
   four files every run — 41 bullets, cheap today, but the ledger grows linearly
   and the row-count invariant makes it un-skippable. **Default if unanswered:
   whole corpus**, with an optional module argument that narrows the scan and is
   stated at the top of the report.

4. **Is `client/INSIGHTS.md:15` (the `./scripts/e2e.sh` bundle-poisoning entry)
   a cross-post or a move?** It is the clearest misfiling in the corpus, but
   append-only means nothing can move — the only real option is a *new* entry in
   `e2e/INSIGHTS.md` that a human appends, or a promotion of the whole `.next`
   ownership cluster to a root doc. The agent will report it as `MISFILED`
   either way; **which remedy it proposes** is worth deciding once, up front.
   **Default if unanswered: propose the root-doc promotion**, since the cluster
   spans `client/`, `e2e/` and `scripts/e2e.sh` and no single module owns it.
