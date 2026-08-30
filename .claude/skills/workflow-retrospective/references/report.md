# The retrospective artifact

## Where it goes

`docs/retros/YYYY-MM-DD-<feature-slug>.md`, where the slug matches the plan and
spec for the same feature — `docs/plans/2026-08-16-blast-radius.md` pairs with
`docs/retros/2026-08-16-blast-radius.md`. Convention and scope live in
`docs/retros/README.md`.

The same report goes in chat. Where it runs long, the chat version may collapse the
per-agent table to its top rows and point at the file; it may not drop a whole
section, and `## Not established` always appears in both.

## Template

```markdown
# Retrospective: <feature> — <YYYY-MM-DD>

Session `<uuid>` · <chain: /sdd-run | split commands | ad-hoc fan-out>
Plan: `docs/plans/<…>.md` · Spec: `specs/<…>.md` (SPEC-NN)
Measured by `.claude/skills/workflow-retrospective/assets/session-metrics.sh`

## Cost                                                            measured

|                | API calls | Output | Cache create | Cache read | Thinking |
|----------------|-----------|--------|--------------|------------|----------|
| Orchestrator   |           |        |              |            |          |
| Subagents (N)  |           |        |              |            |          |
| Total          |           |        |              |            |          |

Subagents generated **NN %** of all output tokens.

## The run                                                         measured

Wall clock … · N agents in M waves · widest wave … · agent-time ratio …

| # | Agent | Type | Model | Wave | Output | Tool calls | Duration |
|---|-------|------|-------|------|--------|------------|----------|

## Where it was hard                                               inferred

| Agent | What happened | Evidence |
|-------|---------------|----------|

## What went easily                                                inferred

- <agent or step, and the numbers that say it was cheap>

## Duplicated work                                    measured + inferred

| What | How many agents / times | Where it should live instead |
|------|-------------------------|------------------------------|

## What was missed                                                 inferred

| Gap | Who hit it | Which step should have supplied it |
|-----|------------|------------------------------------|

## Recommendations

| # | Target (file to edit) | Change | Evidence | Cost of ignoring |
|---|-----------------------|--------|----------|------------------|

## Compared with the last retro

| Metric | `<previous retro>` | This run | Δ |
|--------|--------------------|----------|---|

Previous recommendations: <applied / not applied / partly, one line each>

## Not established

- <a number or a claim the transcripts do not support, and what would settle it>
```

## Rules the template encodes

- **`## What went easily` and `## Not established` are mandatory, even empty.** This
  is the house pattern — `## AC without test evidence`, `## Not documented`,
  `## Checked and clean`. An empty section is a good report; a missing one is a
  dishonest one.
- **Section headers carry `measured` / `inferred`**, and rows inside a mixed section
  carry it per row.
- **The recommendations table has no severity column.** Target, evidence, cost.
- **Nothing in the file is applied by the skill.** The retro is a draft under human
  review, like an INSIGHTS entry.

## Comparing against previous retros

Read the two most recent `docs/retros/*.md` other than the one being written.

- Compare the headline numbers only: total output, subagent share, agent count,
  wall clock, widest wave. Deeper comparison across different features is noise.
- **Say when the comparison is not meaningful.** Two features of different sizes do
  not have comparable token totals; what compares is shape — share, ratio, waves,
  and whether the same friction recurred.
- For each recommendation in the previous retro, check whether its Target file
  actually changed: `git log --oneline -- <target>` since that retro's date. Report
  applied / not applied / partly, with the evidence.
- **A recommendation that recurs across three retros is no longer a recommendation.**
  It is a defect in the chain, and it should be stated that way — with a proposal to
  encode it in the agent or command file so nobody has to keep noticing it.
- No prior retro is a normal answer for the first run. Write it and move on.
