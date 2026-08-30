# workflow-retrospective — rationale and contested calls

Not part of the skill payload. This records where the boundaries came from, what
was rejected, and which claims were checked against this machine.

---

## 1. Why it exists

The repo runs a ten-agent chain and measures none of it. Every cost statement in
`.claude/commands/` is an argument, not a number — *"it costs an opus pass to learn
something `ls` already knew"*, *"`test-writer` is skipped to save tokens"* — and
`.claude/agents/README.md:261` carries an explicit `Not yet verified` block
admitting the chain has never been observed end to end.

The agents' output contracts already cover *what changed* (`Deviations`, `Blocked`,
`Handoff`). Nothing covers *how the run went*. Those are different questions with
different evidence, and stapling the second onto an existing agent's report would
have made every agent's report longer and none of them more honest — an agent
grading its own run is the one witness you cannot use.

## 2. Why `docs/retros/` and not `INSIGHTS.md`

`engineering-insights` has a three-part quality gate: would the next session get
this wrong without it, is it invisible from the code and docs, will it still be
true next month. **Process telemetry fails the third clause by design** — "the
implementer spent 985 s on T4" is true of one run and never again. Filing retros
there would bury the durable entries under a stream of run logs, which is exactly
what the gate exists to prevent.

`docs/retros/` also gets something INSIGHTS cannot have: a per-run file, so two
runs can be diffed. That is the whole point — one retro is a number, a series is a
control loop.

Checked: `grep -riE "retrospectiv|postmortem|lessons learned"` across the repo
matched exactly one unrelated file, and grepping all five `INSIGHTS.md` for
`subagent|implementer|plan-verifier|sdd|orchestrat` returned zero hits. No entry
has ever been about an agent run. The gap was real, not a duplicate.

## 3. Contested calls

**No severity scale.** The first draft gave findings `CRITICAL / WARNING /
SUGGESTION` to match the reviewers. Cut: that vocabulary is pinned to code findings
in `server/src/vendor/shared/contracts/findings.ts:11`, `pr-self-review` blocks a
merge on it, and a second scale over process findings would collide with the first
in exactly the place a model is most tempted to inflate. A recommendation names the
**file to edit** instead. If it cannot name one, it is an observation, and the
report says so.

**No hooks.** A `SessionEnd` or `SubagentStop` hook was the obvious design and is
wrong here: the transcripts are already durable on disk, so a hook adds a failure
mode and a settings entry for data it would only re-copy. Verified that no hook is
needed — the only hook in `.claude/settings.json` today is the `pr-self-review`
gate. Revisit only if transcripts start being pruned.

**No dollar figures.** Rejected for v1: a pinned price table goes stale silently
and its output gets quoted as fact. If it is added later it needs a `verified_on`
date and a hard rule that a stale table prints `not established` rather than a
number.

**The skill proposes, the human applies.** It would be easy to let the retro edit
`.claude/agents/*.md` directly — it has the evidence. Rejected for the same reason
`insight-curator` gives: the loop closes through a human, and an agent that both
diagnoses the system and rewrites it has no check on it.

**Tokens-per-outcome ratios** (tokens per accepted finding, per AC covered) were
cut as too noisy at n=1. They become meaningful once `docs/retros/` holds enough
runs for the trend section to carry them.

**One run cannot condemn a preload.** The preload-waste probe is the most
actionable output in the skill and also the easiest to misuse: a skill unused while
building a server feature is not dead weight, it is the wrong task to judge it on.
`references/rubric.md` forbids proposing a `skills:` deletion on single-run
evidence and pushes the case into the cross-retro trend instead.

## 4. Verified on this machine, not taken on faith

- Transcript layout, `subagents/agent-*.jsonl` + `.meta.json`, and the
  `/private/tmp/.../tasks/*.output` symlink — inspected directly.
- The `max_by` per `message.id` rule: taking the first content block undercounts a
  subagent's output by 22× because early blocks carry partial streaming usage.
  Measured on `agent-a02ce8ecd9481a20d.jsonl`: 655 vs 14 531.
- `assets/session-metrics.sh` reproduces, exactly, the independently-derived totals
  for session `0f209fd9-430f-432e-ae85-363edd849b61`: orchestrator 565 calls /
  279 763 output / 214 173 231 cache read; subagents 768 calls / 614 025 output;
  19 launches; and the full by-type rollup.
- Degradation: a session with no `subagents/` dir returns valid JSON with a `notes`
  entry; a nonexistent uuid exits 1.
- `~/.claude/usage-data/`, `~/.claude/stats-cache.json` and `~/.claude/telemetry/`
  were evaluated as data sources and rejected as stale or empty. `ccusage` and
  `claude-monitor` are not installed and are not needed.

Not verified, and stated as such: the skill has not yet been run against a full
`/sdd-*` chain, because no feature has been taken through that chain end to end.
Probe 6 (retries and loops) reads orchestrator state out of the conversation rather
than the transcript, and that path is untested against a real gate failure.
