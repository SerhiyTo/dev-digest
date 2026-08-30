# Retrospective: Project Context build — 2026-08-23

Session `acb9249c-6c79-4ab5-ace0-e0892a0c3806` · split commands (`/sdd-build → /sdd-review → /sdd-close`)
Plan: `docs/plans/2026-08-22-project-context.md` · Spec: `specs/2026-08-20-project-context.md` (SPEC-01)
Measured by `.claude/skills/workflow-retrospective/assets/session-metrics.sh`

This run built, reviewed and closed the feature the previous retro planned. It pairs
directly with `docs/retros/2026-08-22-project-context.md`, which measured the
`/sdd-plan` turn for the same spec — same feature, same plan, three commands later.

## Cost                                                            measured

|                 | API calls | Output    | Cache create | Cache read  | Thinking |
|-----------------|-----------|-----------|--------------|-------------|----------|
| Orchestrator    | 118       | 155 313   | 1 279 756    | 27 865 822  | 36 138   |
| Subagents (38)  | 1 530     | 1 118 878 | 8 348 175    | 196 315 818 | 453 385  |
| Total           | 1 648     | 1 274 191 | 9 627 931    | 224 181 640 | 489 523  |

Subagents generated **88 %** of all output tokens.

Two numbers are worth sitting with. The subagent share rose from **57 %** in the
planning retro to **88 %** here — planning is an orchestrator deciding after agents
gather; building is an orchestrator dispatching while agents decide. And cache reads
are **176× total output** (224 M against 1.27 M), against 51× in the planning run:
38 agents each re-reading a 683-line plan and the same dozen source files is what
that multiple is made of.

The subagents also *thought* 12.5× more than the orchestrator (453 385 vs 36 138),
the inverse of the planning run's 3.4×-toward-the-orchestrator ratio.

## The run                                                         measured

Wall clock 20 h 26 m · 38 agents in 24 launch-waves · widest wave 4 ·
48 user prompts · `spawn_depth` 1 throughout · `notes: []` (no degraded measurement)

Sum of agent time: 9 h 51 m. Reported agent-time ratio **0.48**.

**That ratio is not a parallelism measure for this session and should not be read as
one.** Two turns account for 14 h 3 m of the 20 h 26 m: `duration_ms` 12 157 385 at
`00:36` and 38 485 624 at `12:37`. The machine was asleep — corroborated by two
`architecture-reviewer` dispatches dying mid-response with "your computer went to
sleep". Excluding those two gaps, active wall clock is ≈ 6 h 22 m and the real ratio
is ≈ **1.55** *(inferred: 35 477 agent-seconds ÷ 22 908 active session-seconds)* —
i.e. agents genuinely overlapped, which the raw 0.48 hides.

| Type                   | N  | Output  | Tool calls | Median duration |
|------------------------|----|---------|------------|-----------------|
| implementer            | 24 | 687 390 | 1 010      | 509 s           |
| plan-verifier          | 7  | 207 383 | 347        | 672 s           |
| architecture-reviewer  | 3  | 69 806  | 127        | 487 s           |
| doc-writer             | 1  | 57 250  | 76         | 827 s           |
| test-writer            | 1  | 48 701  | 54         | 1 990 s         |
| security-auditor       | 1  | 33 778  | 59         | 711 s           |
| spec-creator           | 1  | 14 570  | 38         | 236 s           |

Orchestrator state, from the conversation rather than the transcript: **7
`plan-verifier` runs, 4 returning INCOMPLETE**. Waves 1–3 each needed a round; wave 4
passed 38/38 first time; the final AC trace needed two runs.

## Where it was hard                                               inferred

| Agent | What happened | Evidence |
|-------|---------------|----------|
| `implementer` T12 (seed fixture clone) | Longest and most tool-heavy build task. It had to reverse-engineer where the walk actually looks, then prove idempotency by diffing 24 table counts and file hashes across two seeds on two databases | 3 771 s, **123 tool calls**, 64 090 output — the highest tool count of any agent |
| `implementer` T13 (e2e flow) | Wrote 46 steps against a UI it could not see, then found the drawer unreachable and stopped rather than widening scope into T12's file | 3 505 s, 107 tool calls; blocked item reported, not worked around |
| `implementer` "Fix AC-9 assertion" | **Duration ≫ work.** A one-line test edit took 3 296 s against only 26 tool calls and 11 555 output — it burned three `verify-l04.sh` runs on flakes (integration-red, then client-red, then green) on an unchanged tree | 3 296 s / 26 calls is the widest duration-to-tool-call gap in the run; direct evidence for finding F9 |
| `architecture-reviewer` | Launched **three times** for one review. Two died mid-response to a sleeping machine | 13 598 + 22 879 output wasted before the 33 329-output run that produced findings |
| `test-writer` | Slowest single agent by duration but not tool-heavy — it spent its time reading existing coverage before writing, which is what let it find AC-4 untested | 1 990 s, only 54 tool calls |

## What went easily                                                inferred

- **Wave 4 (T9, T10, T11) passed its gate 38/38 on the first pass** — the only build
  wave that did. It was also the wave whose brief carried the most inherited context:
  four named traps from earlier gates.
- **T4 was the cheapest agent in the run** — 88 s, 8 tool calls, 6 554 output — and it
  produced the property the whole feature ships on (AC-31's byte-identity pin). Cheap
  and load-bearing are not opposites.
- **T6 (144 s), T11 (255 s), `spec-creator` (236 s)** all came in under five minutes.
  T11 needed no component change at all: it verified three "already works" claims and
  wrote tests, which is what a well-scoped task looks like.
- **`notes: []`** — every transcript was present and parsable; no number in this report
  is standing on a missing file.

## Duplicated work                                    measured + inferred

| What | How many agents / times | Where it should live instead |
|------|-------------------------|------------------------------|
| `docs/plans/2026-08-22-project-context.md` re-read | **28 agents** (absolute path) + 12 more under a relative path — the same file counted twice by path form | Unavoidable and correct; it is the contract. But 683 lines × 38 agents is most of the 224 M cache reads. A per-task context pack would cut it |
| `dependency-cruiser.onion.cjs` | **15 readers** | Preloaded with `onion-architecture`, which 24 implementers already carry |
| `server/src/modules/context/service.ts` | 10 + 9 + 8 readers across three path forms | The feature's centre of gravity; expected |
| `pnpm typecheck` (server) | **8 runs by 7 agents** | Each agent must verify its own work — but 4 of the 8 were within one wave of each other |
| `pnpm build` (client) | **6 runs by 6 agents** | Same. Two of them collided over `client/.next` and produced a false failure |
| `architecture-reviewer` re-launches | 3 launches, 2 wasted (36 477 output) | Environmental, not a process defect. The recovery *was* good: the third launch was seeded with the already-established mechanical results and the concurrent security findings, so it went straight to judgement |
| `pnpm typecheck` does not cover `server/test/` | Rediscovered independently by 2 implementers | `server/INSIGHTS.md` — now recorded, after the second discovery |
| Three Testcontainers failure modes | Each diagnosed from scratch by a different agent | `server/INSIGHTS.md` / `TESTING.md` — now recorded as F1, F8, F9 |

## What was missed                                                 inferred

| Gap | Who hit it | Which step should have supplied it |
|-----|------------|------------------------------------|
| `CloneDocsSource.read()` typed `Promise<string \| null>`, collapsing *missing* / *unreadable* / *out-of-root* | T5, T7, then the architecture review | `/sdd-plan`. One under-specified return type forced amendments **A1** and **A2** and an entire redundant tree walk in `document()`. Largest single source of rework in the run |
| Coverage table's `Proven by` for AC-4 cited a test that asserts the **opposite** (the walk is deliberately uncapped after A1 moved the cap) | `test-writer`, at review time | `/sdd-plan`, and every gate after A1 landed. The criterion went untested through **5 gate rounds** because the table looked like coverage |
| Two tasks' `Do:` text was unsatisfiable as written | Wave-1 gate | `/sdd-plan`. Caught before dispatch only because the gate was asked to verify the implementer's claims rather than accept them |
| Four `Files:` lists wrong — `nav.ts`, `doc-attach/constants.ts`, `package.json`, and a promised `trace-builder.ts` edit pointing at **dead code with zero callers** | T8, T10, T5, T9 | `/sdd-plan`. A12 withdraws the last one rather than meeting it |
| A review fix reworded a message string an e2e flow asserted | Orchestrator, by grepping the flow | Nothing caught it automatically. T13's own handoff had named that exact key as a silent-breakage risk — the warning existed and no gate read it |
| AC-34 unobservable in the persisted log | Final `plan-verifier`, independently | `/sdd-review`. The orchestrator had flagged only AC-32; the same root cause covered two criteria |

## Recommendations

Each names the file someone would edit. None is applied here.

**1. Decide the `implementer` model pin, and stop overriding it silently.**
Target: `.claude/agents/implementer.md:12`.
The frontmatter reads `model: sonnet`. **All 24 implementer dispatches resolved to
`claude-opus-5[1m]`**, because the orchestrator passed `model: opus` on every single
call without the command asking it to. That is 687 390 output tokens — 54 % of the
run's total — generated on a tier the agent definition does not ask for. Either the
pin is stale or the override was undisciplined; both cannot be right. Note `/sdd-close`
*does* instruct an explicit opus override for `plan-verifier` and explains why, which
is the pattern to copy.
Cost of ignoring: the roster's model pins stop describing what actually runs.

**2. Add `breaking-change` and `semver-discipline` to `implementer`'s preloads.**
Target: `.claude/agents/implementer.md` `skills:`.
Neither is in the 13 preloaded skills, and both were invoked *ad hoc* via the Skill
tool by three separate implementer dispatches — T1, "Fix attachment limit", and
"AC-33 bounded prefix read" — every one of them a contract-touching task. This feature
changed a shared contract in five separate rounds and produced three amendments about
versioning (A4, A13, A13a).
Cost of ignoring: contract tasks keep paying a Skill round-trip for guidance the agent
should already hold.

**3. Forbid a mutating command in a `Done when:` clause.**
Target: `.claude/agents/implementation-planner.md`.
`plan-verifier` is read-only and refused `pnpm db:migrate` / `pnpm db:seed` in **all
three** runs that reached them — producing the run's only UNKNOWN (wave-1 item 2.4),
which the orchestrator then settled by hand with a read-only `psql` query. A plan
clause that its own verifier cannot execute is unverifiable by construction.
Cost of ignoring: one UNKNOWN per plan, resolved manually or not at all.

**4. Re-check the coverage table when an amendment moves ownership between layers.**
Target: `.claude/commands/sdd-build.md`, the gate section.
A1 moved AC-4's cap from the adapter to the service and nothing revisited the `Proven
by` column, which kept pointing at a test asserting the opposite. Five gates read that
table and none questioned it.
Cost of ignoring: a criterion can read as covered for an entire build while nothing
tests it.

**5. Say that concurrent implementers must not append to one `INSIGHTS.md`.**
Target: `.claude/commands/sdd-build.md`, `## multi-agent`.
Four agents appended to `server/INSIGHTS.md` in overlapping windows. One correctly
*declined*, citing clobber risk with three siblings running — good judgement that the
command does not currently ask for.
Cost of ignoring: silent loss of the append-only record the repo depends on.

**6. Serialize the integration lane inside the gate.**
Target: `scripts/verify-l04.sh:56`.
It runs `pnpm exec vitest run .it.test` **without** `--no-file-parallelism`, so the
repo's own merge gate inherits F1: `dockerAvailable()` races a ~5 s `docker info`
against a 5 000 ms timeout, and a lost race skips a whole file while the lane exits 0.
Measured this run: three consecutive gate runs on an unchanged tree gave red, red,
green. Owner is `test-writer` (with F1, F8, F9).
Cost of ignoring: the gate can go green while skipping 35 % of the tests, and going
red on a clean tree trains people to re-run until it passes.

## Compared with the last retro

`docs/retros/2026-08-22-project-context.md` measured `/sdd-plan` for this same spec.

| | Planning (2026-08-22) | Build + review + close (2026-08-23) |
|---|---|---|
| Agents | 3, one wave | 38, 24 waves |
| Output | 101 937 | 1 274 191 (12.5×) |
| Subagent share | 57 % | **88 %** |
| Cache read ÷ output | 51× | **176×** |
| Thinking balance | 3.4× toward orchestrator | **12.5× toward subagents** |
| Retries / blocked | 0 / 0 | 4 INCOMPLETE gates · 3 build re-dispatches · 2 environment deaths |

The inversion of the thinking ratio is the honest summary of what changed: planning
concentrates judgement in one place, building distributes it. The corollary is that
**the plan's defects were the run's dominant cost** — A1, A2, the AC-4 citation and
four wrong `Files:` lists all originated in the 27-minute planning turn and were paid
for across 20 hours of building.

That is not an argument for planning longer. It is an argument that the cheapest
possible review is of the plan's *types and citations*, before any agent is dispatched.

## Not established

- **Whether `implementer`'s 13 preloaded skills were used.** The script's `skill_calls`
  records explicit Skill-tool invocations only; a preloaded skill is already in context
  and needs no call, so its use is invisible here. The three `skill_calls` observed from
  implementers were all for skills *not* in the frontmatter, which is what recommendation 2
  rests on — but the converse (which of the 13 went unread) cannot be measured from a
  transcript, and one run would not justify a deletion regardless.
- **Token cost of the two sleep-killed `architecture-reviewer` runs to the user.** The
  36 477 wasted output tokens are measured; whether a killed dispatch is billed is not
  something the transcript records.
- **Whether the opus override on `implementer` improved outcomes.** 24 dispatches, no
  sonnet control arm. The cost is measured; the benefit is not.
- **Duplication counts are lower bounds.** The script keys on the literal path string,
  and `service.ts` alone appears under three forms (absolute, `server/`-relative,
  `src/`-relative) totalling 27 reader-slots. Real per-file reader counts are higher
  than any single row shows.
