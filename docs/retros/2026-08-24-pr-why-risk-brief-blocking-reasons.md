# Retrospective: PR Brief — blocking reasons and design fidelity — 2026-08-24
Session `63796694-04ef-41ef-95df-e003897c1c8b` · `/sdd-build → /sdd-review → /pr-self-review → /sdd-close` · Plan: `docs/plans/2026-08-24-pr-why-risk-brief-blocking-reasons.md`

## Cost — measured

| | Output | Cache creation | Cache read | Thinking | API calls |
|---|---|---|---|---|---|
| Orchestrator | 154 772 | 750 511 | 28 250 747 | 32 577 | 133 |
| Subagents (46) | 755 518 | 5 639 794 | 123 976 356 | 377 883 | 1 235 |

**`subagent_share_of_output` = 83 %.** Well above the ~60 % mark: the orchestrator
was a dispatcher, and the cost lives in the agent definitions. Wall clock 330 min
across 54 user prompts — a human-in-the-loop session, not an unattended chain.

| Agent type | Count | Output | Tool calls | Median duration |
|---|---|---|---|---|
| `general-purpose` | 17 | 258 601 | 448 | 251 s |
| `implementer` | 14 | 217 167 | 421 | 131 s |
| `plan-verifier` | 9 | 154 150 | 279 | 304 s |
| `doc-writer` | 2 | 37 579 | 85 | 1 002 s |
| `architecture-reviewer` | 1 | 26 417 | 57 | 350 s |
| `test-writer` | 1 | 24 533 | 60 | 434 s |
| `spec-creator` | 1 | 20 445 | 32 | 4 779 s |
| `security-auditor` | 1 | 16 626 | 26 | 248 s |

The 17 `general-purpose` agents are `/pr-self-review`'s auditor fan-out — the
single largest line in the run, larger than every `implementer` combined.

## The run — measured

22 waves. The five plan waves matched the plan's `## Execution mode` exactly:
wave 1 launched T1–T5 within 17 s of each other, then a gate, then T6+T7, gate,
T8, gate, T9, gate, T10, gate. **All five wave gates returned `COMPLETE` on the
first attempt.**

`agent_time_ratio` = 1.03 (20 501 agent-seconds over 19 853 session-seconds).
Per this skill's own rule that figure is **meaningless here** — a human was in the
loop for 54 prompts, so session-seconds include thinking time that no agent was
consuming. Reported for completeness, not as a parallelism verdict.

`spawn_depth` is 1 for all 46 agents; no agent spawned an agent.

Model split: every `implementer`, `doc-writer` and wave-gate `plan-verifier` ran
on `claude-sonnet-5`; every auditor, the `security-auditor`, `spec-creator` and
all four final-mode `plan-verifier` runs ran on `claude-opus-5[1m]` — the last
by explicit request, since tracing `AC-n` through a coverage table is not
mechanical work.

## Where it was hard — inferred

**Three watchdog stalls and one infrastructure failure, all in agents doing long
work.** Evidence: task notifications for `aaccddb6b67ca680d` (T8), `a43ccce8122c242f4`
(`doc-writer`, first attempt) and `a6f7e9e06a8eb3c75` (final `plan-verifier`) each
report *"no progress for 600s (stream watchdog did not recover)"*; `a7ff293f61d64f397`
died on *"Your computer went to sleep mid-response"*.

The recoveries cost very differently, and the difference is the lesson:

- **T8** had already written all eleven files and reached a clean typecheck before
  it died. Verifying from disk cost one `Bash` call; nothing was re-run.
- **`doc-writer`'s first attempt wrote nothing** — `git status` showed only
  `spec-creator`'s change. Its ~4 900 output tokens were pure loss, and the second
  attempt cost 32 680.
- **The final `plan-verifier` stalled twice**, both times while running test
  suites. The third attempt succeeded only after the suites were run outside the
  agent and the results handed to it in the prompt.

**`plan-verifier` ran nine times for 154 150 output tokens** — the second most
expensive agent type in the run. Five were wave gates that all passed first time;
three were retries of a single final run; one was the targeted re-check.

**`spec-creator` took 4 779 s** — 80 minutes, the longest single agent in the
session, for 20 445 output tokens across 32 tool calls. Low output per second
suggests waiting rather than working, but the transcript does not say on what.

## What went easily — inferred

- **Every wave gate passed first time.** Ten tasks, five gates, zero `INCOMPLETE`
  verdicts during the build. The plan's `Files:` lists were genuinely disjoint —
  no wave-1 agent reported touching another's file, and the only cross-task
  collision (T4 seeing `BriefPanel`'s AC-97 test fail) was correctly identified by
  T4 as another task's in-flight work and left alone.
- **`security-auditor` returned zero findings** on 16 626 output tokens and 26 tool
  calls — the cheapest agent that produced a real verdict. Its trace of LLM-authored
  titles to their sinks was the substantive check the feature needed.
- **The contract pair landed correctly.** T2 and T7 were separate tasks with the
  constraint that they share a commit; both implementers named the constraint
  unprompted in their handoffs, and `diff` between canonical and mirror is empty.

## Duplicated work — measured + inferred

| File | Read by |
|---|---|
| `docs/plans/2026-08-24-pr-why-risk-brief-blocking-reasons.md` | **23 agents** |
| `BriefVerdictStrip/helpers.ts` | 10 |
| `client/src/lib/severity.ts` | 10 |
| `BriefVerdictStrip/BriefVerdictStrip.tsx` | 9 |

The plan is a 44 KB file read in full by 23 of 46 agents. Most needed one `### T`
section. That is the single clearest waste in the run — every `implementer`,
every gate and every final verifier paid to parse the whole document to find its
own paragraph.

## What was missed — inferred

**Four `Verify:` commands in the plan were false greens, and five gate runs
believed them.** Each did `cd client` and then handed `vitest related` a path
still carrying the `client/` prefix, resolving zero test files and exiting 0 with
*"No test files found"*. Gates at waves 1, 3, 4 and the final run all recorded the
command as run. The tests did pass — inside a different command — so no defect
shipped, but the gate learned nothing on four occasions and reported that it had.

**A gate confirmed a constraint by measuring from the wrong root.** The wave-3
gate reported that `_components` nesting did not exceed
`_components/<Parent>/_components/<Child>/`, counting from `BriefVerdictStrip`.
Counting from `OverviewTab` the real path has three `_components` segments. Two
independent `/pr-self-review` auditors caught it later. The plan itself asserted
the compliant reading, and the orchestrator passed that assertion to implementers
as fact — so a wrong statement in a plan propagated through a gate that was
looking straight at it.

**The final verification found what five wave gates could not.** `AC-86` shipped
with the information control nested inside the review branch, so a pull request
with a `high` risk and no review had a blocking reason and nothing to open it
with. Every wave gate passed because the plan's `Done when:` for T9 only asked for
the reviewed branch; only the final mode's per-`AC-n` trace against the spec's own
edge-case table surfaced it. **This is the strongest evidence in the run that the
final pass is worth its cost.**

## Recommendations

Each names the file someone would edit. None applied.

**1. A `Verify:` that collects zero tests is `NOT MET`, not `MET`.**
Target: `.claude/agents/plan-verifier.md`.
Evidence: four commands, five gate runs, zero detection. Cost of ignoring: a gate
that reports green on a command that ran nothing. Add an explicit rule — exit 0
with no test files collected is a failed verification, not a passed one.

**2. Hand each agent its task section, not the whole plan.**
Target: `.claude/commands/sdd-build.md`.
Evidence: 23 readers of one 44 KB file. Cost of ignoring: every dispatch pays to
parse the full plan. The dispatch prompt already names the task id; it could carry
the task body.

**3. `plan-verifier` in final mode should not run full suites itself.**
Target: `.claude/agents/plan-verifier.md`, and `.claude/commands/sdd-close.md`
step 1. Evidence: two of three stalls happened inside suite runs; the successful
attempt was the one handed pre-computed results. Cost of ignoring: a 600 s
watchdog death per attempt on the most expensive verification in the chain.

**4. A plan's own assertion about a constraint is not evidence the constraint holds.**
Target: `.claude/agents/plan-verifier.md`.
Evidence: the `_components` depth claim passed a gate that had the directory tree
in front of it. Cost of ignoring: the gate confirms what the plan says instead of
what the tree says.

**5. Consider whether every wave needs its own gate.**
Target: `.claude/commands/sdd-build.md`.
Evidence: five wave gates, 5 × `COMPLETE` first time, and the one real defect was
found by the final pass instead. This is one run's evidence and should not be
acted on alone — recorded so a trend can form.

## Compared with the last retro

`docs/retros/2026-08-24-pr-why-risk-brief.md` covers the `AC-1`–`AC-82` run on the
same feature. No numeric comparison is drawn here: that retro was not re-read
during this session, and comparing against a summary rather than its actual
figures is exactly the estimate this skill forbids. A future retro should diff the
two directly.

## Not established

- **Why `spec-creator` took 4 779 s.** The duration is measured; the cause is not.
  Its transcript was not read.
- **Which preloaded skills went uninvoked.** `agents[].skill_calls` is populated
  (the wave-1 gate invoked seven), but this run was not cross-referenced against
  each agent's `skills:` frontmatter, and this skill's own rule forbids proposing
  a deletion on one run's evidence regardless.
- **The true cost of the three stalls.** Output tokens generated before each death
  are in the per-agent figures, but how much of that work was reusable was judged
  by hand per case, not measured.
- **Whether the 17-auditor `/pr-self-review` fan-out earned itself.** It produced
  34 warnings and 100 suggestions across the whole branch, most in earlier lab
  work rather than this feature. Whether that ratio justifies 258 601 output
  tokens is a judgement nobody has made against a baseline.
