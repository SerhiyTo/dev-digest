# Retrospective: PR Why + Risk Brief — 2026-08-24
Session `e81d1e32-7e5a-4a66-910b-6d7a65dc25ee` · `/sdd-build → /sdd-review → /sdd-close` · Plan: `docs/plans/2026-08-24-pr-why-risk-brief.md`

23 tasks in 6 waves, SPEC-03's 82 acceptance criteria, across `server/`, `client/` and `e2e/`.

## Cost — measured

|                 | API calls | Output    | Cache create | Cache read  | Thinking |
|-----------------|-----------|-----------|--------------|-------------|----------|
| Orchestrator    | 125       | 121 433   | 588 105      | 27 700 065  | 28 960   |
| Subagents (43)  | 1 438     | 1 014 689 | 7 189 861    | 200 110 402 | 552 041  |
| Total           | 1 563     | 1 136 122 | 7 777 966    | 227 810 467 | 581 001  |

Subagents generated **89 %** of all output tokens. Wall clock **31 322 s (8 h 42 m)**, 47 user prompts. The orchestrator made 109 tool calls — 64 `Bash`, 43 `Agent`, 1 `AskUserQuestion`, 1 `Read` — and invoked no skill directly.

| Type                   | N  | Output  | Tool calls | Median duration |
|------------------------|----|---------|------------|-----------------|
| implementer            | 31 | 697 559 | 1 176      | 322 s           |
| plan-verifier          | 7  | 191 403 | 304        | 330 s           |
| test-writer            | 1  | 34 010  | 51         | 440 s           |
| doc-writer             | 1  | 32 426  | 55         | 371 s           |
| architecture-reviewer  | 1  | 31 148  | 46         | 402 s           |
| security-auditor       | 1  | 21 615  | 30         | 319 s           |
| spec-creator           | 1  | 6 528   | 12         | 96 s            |

`session-metrics.sh` returned `notes: []` — every subagent transcript was present, so no number here is a partial.

## The run — measured

43 launches, all `spawn_depth: 1` (no agent spawned an agent). `sum_agent_seconds` 19 668 against 31 336 session seconds — **`agent_time_ratio` 0.63**. Per the skill's own guidance that ratio is not meaningful here: this session had a human in the loop across three separate commands, so most session-seconds were spent waiting on a person, not on a barrier.

Widest wave: **7 agents** (plan wave 2, T6–T12). The plan's 6 waves became 15+ measured waves because every gate, every remediation and every review fix is its own launch group.

Where the plan and the data disagree: the plan declared **6 parallel waves**; the run executed **3 genuinely wide ones** (5, 7 and 4 agents) and eleven groups of 1–2. That is not a planning defect — the gates and remediations between waves are serial by design.

## Where it was hard — inferred

| Agent | What happened | Evidence |
|---|---|---|
| `implementer` T21 (e2e flow) | **The most expensive agent in the run, and it never delivered a report.** It returned twice with only "Waiting for the background e2e run to finish". Its flow was authored against a UI it could not see and was never executed by it | 292 451 output, **104 tool calls**, 1 021 945 ms — highest on all three counts |
| Four agents died mid-task | T1-fix and T8 stalled (600 s watchdog); T10 and T11 were killed by the machine sleeping. I recovered all four by inspecting the tree instead of re-dispatching — T8 and T10 were already complete, T11 needed a completion pass, T1-fix needed only its mirror step, which I finished with one `cp` | 4 of 43 launches; 3 needed no re-run at all |
| `plan-verifier` final mode | Ran **795 s on opus** across 266 items, and honestly refused 5 mutating verification steps rather than fake them | Refused `db:migrate`, `db:seed`, a depcruise config write into `server/`, `pnpm build` (would have killed the live dev server on :3000), and `e2e npm test` — each reported `UNKNOWN` with a static mitigation |
| Wave 5 (T6–T12) | 21.8× duration spread inside one barrier | `fastest_s` 74, `slowest_s` 1 611 |

Orchestrator state, from the conversation rather than any transcript: **two gate failures during build** (wave 1 item 1.9, wave 2 item 6.12), each fixed and re-verified; **waves 3, 4 and 5 passed COMPLETE on the first attempt** (32/32, 16/16, 11/11 items); and **final mode returned INCOMPLETE**, carried by three plan-item gaps rather than by any broken acceptance criterion.

## What went easily — inferred

- **`security-auditor` was the best value in the run**: 30 tool calls, 319 s, 21 615 output, and it produced 0 CRITICAL / 0 WARNING / 1 SUGGESTION after tracing every untrusted path. It also *corrected the orchestrator* — I had framed the `NODE_ENV=test` rate-limit gap as a production hole; it established that `app.ts:95` gates only on `nodeEnv !== 'test'`, so the limiter **is** registered in production and the gap is test-coverage only.
- **`spec-creator` cost 6 528 output and 96 s** to transition SPEC-03, and still corrected the ledger it was handed (AC-80 is asserted in e2e, not code-path-only).
- **Three of six build waves gated clean first time.** The plan's disjoint-`Files:` guarantee held: across 23 tasks in 6 waves, **no two concurrent agents ever reported touching the same file**.
- **Both `INSIGHTS.md` files stayed strictly append-only** across six different writers — 205 insertions, **0 deletions**, verified by `git diff --numstat`.

## Duplicated work — measured + inferred

| What | Readers | Where it should live instead |
|---|---|---|
| `docs/plans/2026-08-24-pr-why-risk-brief.md` | **39 of 43 agents** | Correct and unavoidable — it is the contract. But at 906 lines × 39 reads it is the single largest contributor to the 228 M cache reads. A per-task context pack would cut it |
| `server/INSIGHTS.md` | **13 agents** | Read by 13, *written* by 6. See "What was missed" — most of those writes were out of scope |
| `specs/2026-08-24-pr-why-risk-brief.md` | 13 agents | Expected; the ACs are the acceptance surface |
| `client/messages/en/brief.json` | 12 agents | T4 owned it and 11 others read it. The dispatch prompts carried its key list verbatim, which is why none of them *edited* it — the duplication bought correctness |

## What was missed — inferred

- **The plan had no port for file-role classification**, though `capChangedFiles` (T14), `selectFileSummaries` (T6) and `runGeneration` (T17) all required one and `classifyPath` is cross-slice-unreachable. Discovered by T14 at wave 3, blocking wave 4. Cost: one mid-build authorised `ports.ts` edit and a `FileRoleSource` design decision made outside the planning step.
- **Two plan-text defects survived to close-out**: T2's `Files:` omits `server/src/db/schema.ts` though its own `Do:` requires editing it, and T1's `Done when:` says "nine new fields" where its `Do:` enumerates twelve. Neither blocked work; both made gate adjudication harder.
- **`## Verification (end to end)` asserts "depcruise reports 0 errors"**, which is false against this repo's standing baseline of 7. No implementer can fix a wrong sentence in a plan, so it stayed wrong through the whole run and forced the final verifier to mark the section PARTIAL.
- **Two false claims survived a passing gate and were caught only by execution.** T16 reported its seeded review-focus rows were "inside real hunks" (no seeded `pr_files` row carried a `patch` at all) and that both summarised files "classify as core" (`src/api/public/webhooks.ts` is `boilerplate` — `public` is a path segment in `BOILERPLATE_SEGMENTS`, `constants.ts:53`). Both passed wave 3's gate. The first was caught by `architecture-reviewer` at review, the second only by me querying the running API at close-out.
- **The e2e flow was never executed until close-out**, and by then the AC-65 review fix had moved the summary inside `FileCard`'s `{open && …}` body — so the flow's expand click was *closing* an auto-opened card. Typecheck passed throughout; only `./scripts/e2e.sh` found it.

## Recommendations

Each carries a **Target** — the file someone would edit. This skill proposes; it applies nothing.

1. **Add an explicit `INSIGHTS.md` boundary to the build dispatch template.**
   *Target:* `.claude/commands/sdd-build.md`.
   *Evidence:* 5 of 31 implementers (T6, T11, T13, T16, T17) appended to `server/INSIGHTS.md` outside their `Files:` list. T17 did so **after being told not to** in its prompt; T19, told the same thing, complied and routed its learnings back instead. The `engineering-insights` wrap-up trigger reliably outcompetes a task's file boundary unless the boundary is in the dispatch template itself.
   *Cost of ignoring:* T22 arrives at a file already carrying its own assigned content — it correctly rejected 2 of 4 candidates as duplicates this run, but only because it was told the file was pre-written.

2. **Require every task consuming a cross-slice value to name the port that supplies it.**
   *Target:* `.claude/agents/implementation-planner.md`.
   *Evidence:* the `FileRoleSource` gap. T6 enumerated eight ports; three later tasks needed a ninth. Found at wave 3, blocking wave 4.
   *Cost of ignoring:* a mid-build architectural decision made under time pressure by an implementer, outside the step that owns architecture.

3. **An e2e flow task's `Verify:` must run the hermetic lane, not `npm run typecheck`.**
   *Target:* `.claude/commands/sdd-build.md`, and T21-shaped task templates in `implementation-planner`.
   *Evidence:* flow 10 typechecked green throughout the build and failed on first execution. Two real defects — a stale DOM assumption and an AC-61 seed violation — were invisible to every check the plan specified.
   *Cost of ignoring:* the run's most expensive agent (292 k output) produced an artifact that did not work, and nobody knew for six hours.

4. **A claim about derived or classified data must be proven by running the classifier.**
   *Target:* `.claude/agents/implementer.md`.
   *Evidence:* T16 asserted `src/api/public/webhooks.ts` classifies `core`; it classifies `boilerplate`. The claim passed a gate. The eventual fix agent settled it in one call to `classifyPath`.
   *Cost of ignoring:* seeded demo data that the pipeline it demonstrates could not have produced — which is what AC-61 forbids.

5. **On agent death, inspect the tree before re-dispatching.**
   *Target:* `.claude/commands/sdd-build.md`.
   *Evidence:* 4 agents died this run; 3 had already completed or nearly completed their work. Re-dispatching all four would have cost roughly a wave of implementer time (median 322 s each) for nothing.
   *Cost of ignoring:* duplicated work, and a second agent overwriting a first agent's correct output.

## Compared with the last retro

`docs/retros/2026-08-23-project-context.md`, same chain, same repo.

| | 2026-08-23 project-context | 2026-08-24 pr-why-risk-brief |
|---|---|---|
| Subagent share of output | 88 % | **89 %** |
| Subagents launched | 38 | **43** |
| Total output | 1 274 191 | **1 136 122** |
| Cache read | 224 181 640 | **227 810 467** |
| `implementer` median duration | 509 s | **322 s** |
| `plan-verifier` median duration | 672 s | **330 s** |
| Plan re-read by | 28 agents | **39 agents** |

The share of work happening inside subagents is now stable at ~88–89 % across two runs — the orchestrator is a dispatcher, and **agent definitions are where cost lives**. Median durations roughly halved for both dominant agent types while total output fell 11 % on 5 more agents, i.e. this run was made of more, smaller, faster dispatches.

Two findings **recur across both retros** and are now trend, not incident:
- The plan file is re-read by nearly every agent (28 → 39). Two runs of evidence for a per-task context pack.
- `architecture-reviewer` died to a sleeping machine last run (3 launches for 1 review); this run 4 agents died the same way. The chain has no death-recovery guidance, which is recommendation 5.

## Not established

- **Preloaded-but-never-invoked skills.** `skills.invoked` totals 13 calls across 43 agents (`onion-architecture` 3, `semver-discipline` 3, `breaking-change` 2, five others once). The script's `preloaded_never_invoked` field is a pointer to the rubric, not a number, and I did not cross-reference each agent's `skill_calls` against its `skills:` frontmatter. The 34 k-per-dispatch `implementer` preload cost quoted in `.claude/agents/README.md` is therefore neither confirmed nor refuted here — and per the skill's own rule, one run is not enough evidence to propose deleting a `skills:` entry anyway.
- **Tokens wasted by the 4 dead agents.** Their partial output is inside their totals and is not separable from work that survived.
- **Whether wave 5's 21.8× duration spread cost real wall-clock.** With a human in the loop between commands, barrier cost is not measurable from `agent_time_ratio`.
- **The e2e flow's own runtime before close-out.** T21 never reported; whether its background run ever completed is not recoverable from its transcript.
