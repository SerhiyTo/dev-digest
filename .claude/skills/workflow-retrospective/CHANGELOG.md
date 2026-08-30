# Changelog

## 1.0.0 — 2026-08-22

Initial release.

- `SKILL.md` — the four questions, the default-answers table, the measured /
  inferred labelling rule, the no-severity-scale decision, the report skeleton,
  the red-flags table and the dev-digest project profile.
- `assets/session-metrics.sh` — the deterministic layer. Reads the session's main
  transcript plus every `subagents/agent-*.jsonl` and emits one JSON object:
  session, orchestrator and subagent token totals, launch order with resolved
  models, parallel waves, per-agent duration and tool counts, by-agent-type
  rollup, duplicated file reads and repeated bash, tool histograms, skill
  invocations, turn timings and a `notes` array for anything it could not measure.
- `assets/agent-stats.jq`, `assets/assemble.jq` — the jq programs it runs.
- `references/metrics.md` — transcript layout and record shapes, the six ways to
  get a number wrong, the verified jq recipes with their real output, and what
  each field means.
- `references/rubric.md` — the six probes (friction, what went easily,
  duplication, preload waste, what was missed, retries), the evidence each
  requires, and what makes a recommendation shippable.
- `references/report.md` — the artifact template, the mandatory sections, and the
  rules for comparing against previous retros.
- Wiring: `docs/retros/` and its README, a catalog row in
  `.claude/skills/README.md`, a step in `/sdd-close` and `/sdd-run`, a line in
  the root `CLAUDE.md` docs map.

Verified against this machine during authoring: the script reproduces exactly the
independently-derived totals for session `0f209fd9-430f-432e-ae85-363edd849b61`
(orchestrator 565 calls / 279 763 output / 214 173 231 cache read; subagents 768
calls / 614 025 output; 19 launches; full by-type rollup), degrades to valid JSON
with a `notes` entry on a session with no subagents, and exits 1 on an unknown
session uuid.
