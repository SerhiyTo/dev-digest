# Metrics — where the numbers come from, and the six ways to get them wrong

Everything here was verified against real transcripts on this machine. Where a
recipe shows output, that output is real.

## Layout on disk

```
~/.claude/projects/-Users-<user>-Documents-projects-dev-digest/
  <session-uuid>.jsonl                       main thread
  <session-uuid>/
    subagents/agent-<agentId>.jsonl          one full transcript per subagent
    subagents/agent-<agentId>.meta.json      {agentType, description, toolUseId, spawnDepth}
    tool-results/<id>.txt                    spilled oversized tool output
    workflows/wf_<id>.json                   only when the Workflow tool ran
```

`/private/tmp/claude-501/<slug>/<session>/tasks/<agentId>.output` is a **symlink**
into `subagents/agent-<agentId>.jsonl`. No independent data lives there.

## Record shapes

Every record carries `timestamp` as ISO-8601 with milliseconds and a `Z`.

`type: "assistant"` — keys `cwd, effort, entrypoint, gitBranch, isSidechain,
message, parentUuid, requestId, sessionId, timestamp, type, uuid, version`, plus an
optional `attributionSkill`. `message.model` is the model; `message.usage` carries
`input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
output_tokens_details.thinking_tokens, service_tier, server_tool_use`.

`type: "system"` with `subtype: "turn_duration"` — `durationMs`, `messageCount`,
`pendingBackgroundAgentCount`. Also `subtype: "stop_hook_summary"`.

`type: "user"` — 94 % of these are tool results, not prompts. A typed prompt has
`message.content` of type **string**; a tool result has an array.

Subagent records all carry `isSidechain: true`, an `agentId`, and the **parent**
`sessionId`. The main thread has no sidechain records at all.

## The six ways to get it wrong

**1. Summing `output_tokens` per record.** One API message is written as N records,
one per content block, all sharing `message.id` and `requestId`. A raw sum
double-counts.

**And the obvious fix is also wrong.** Taking `.[0]` looks right because main-thread
transcripts repeat the final usage on every block — but subagent transcripts carry
*partial streaming* usage on the early blocks:

```
$ jq -s '[.[]|select(.type=="assistant")]|group_by(.message.id)
         |map({n:length,outs:map(.message.usage.output_tokens)})|.[0:3]' agent-a02ce8ec….jsonl
[{"n":3,"outs":[1,1,392]}, {"n":4,"outs":[17,17,17,369]}, {"n":5,"outs":[3,3,3,3,512]}]
```

First-block totals give 655 where the true total is 14 531 — an **undercount of
22×**. The only correct rule, and the one that also works on the main thread:

```
group_by(.message.id) | map(max_by(.message.usage.output_tokens))
```

`cache_*` fields are identical across blocks either way.

**2. Parsing the timestamp.** Apple `jq-1.7.1` rejects fractional seconds. Strip
them first, every time:

```
def ts2e: (.[0:19]+"Z")|fromdateiso8601;
```

**3. Indexing `toolUseResult` blind.** It is sometimes a plain string, and jq aborts
the whole program with `Cannot index string with string "agentId"`. Guard first:

```
select((.toolUseResult|type)=="object" and (.toolUseResult.agentId? != null))
```

**4. Looking for `Task`.** The tool is named **`Agent`** in current versions, with
input keys `["description","prompt","subagent_type"]`. Match both names for older
transcripts.

**5. Reading only the main transcript.** Subagent usage is not in it, at all. Miss
`subagents/*.jsonl` and you undercount total generation by roughly 2×.

**6. Folding `cache_read_input_tokens` into "input".** One session read 214 173 231
cache tokens against 1 128 true input tokens. It is the dominant quantity and it
belongs in its own column.

## Verified recipes

`P=~/.claude/projects/-Users-…-dev-digest` and `S=<session-uuid>`.

**Main-thread totals**

```bash
jq -s '[.[]|select(.type=="assistant" and .message.usage!=null)]
  | group_by(.message.id) | map(max_by(.message.usage.output_tokens))
  | {api_calls:length,
     output:(map(.message.usage.output_tokens)|add),
     input:(map(.message.usage.input_tokens)|add),
     cache_creation:(map(.message.usage.cache_creation_input_tokens)|add),
     cache_read:(map(.message.usage.cache_read_input_tokens)|add),
     thinking:(map(.message.usage.output_tokens_details.thinking_tokens//0)|add)}' $P/$S.jsonl
```

```json
{"api_calls":565,"output":279763,"input":1128,"cache_creation":1534633,
 "cache_read":214173231,"thinking":82534}
```

**All subagents in one pass** — the glob feeds jq directly:

```bash
jq -s 'map(select(.type=="assistant" and .message.usage!=null))
  | group_by(.message.id) | map(max_by(.message.usage.output_tokens))
  | {api_calls:length, output:(map(.message.usage.output_tokens)|add)}' $P/$S/subagents/*.jsonl
```

```json
{"api_calls":768,"output":614025}
```

**Launch order, with the real model**

```bash
jq -rc 'select((.toolUseResult|type)=="object" and (.toolUseResult.agentId? != null))
  | [.timestamp, .toolUseResult.agentId, .toolUseResult.resolvedModel,
     .toolUseResult.description] | @tsv' $P/$S.jsonl
```

```
2026-08-16T01:30:17.994Z  acd5b0b04e4574157  claude-opus-5[1m]  Explore blast radius stub
2026-08-16T01:30:24.325Z  a7d7dce7306054ea0  claude-opus-5[1m]  Explore server architecture
2026-08-16T01:30:31.095Z  a409c11a45d0ef80c  claude-opus-5[1m]  Explore client UI patterns
2026-08-16T01:36:42.523Z  a6b54325341b7f2ce  claude-opus-5[1m]  Design blast radius implementation
```

`resolvedModel` here is richer than `message.model` inside the transcript — it keeps
the context-window suffix. Timestamp deltas are what reveal fan-out: three launches
7 s apart is one parallel wave.

**Agent type without touching the 6 MB main file** — `agent-<id>.meta.json`:

```json
{"agentType":"Explore","description":"Explore indexing pipeline",
 "toolUseId":"toolu_01R1MQu5…","spawnDepth":1}
```

**Tool histogram** — dedupe by `tool_use` id, same block-repetition problem:

```bash
jq -r 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")
  |"\(.id)\t\(.name)"' $P/$S.jsonl | sort -u | cut -f2 | sort | uniq -c | sort -rn
```

**Turn timings**

```bash
jq -c 'select(.type=="system" and .subtype=="turn_duration")
  | {ts:.timestamp, durationMs, messageCount}' $P/$S.jsonl
```

## What each number means

| Field | Reading |
|---|---|
| `subagent_share_of_output` | >60 % — cost lives in the agent definitions, tune those. <20 % — the fan-out did not pay for itself |
| `cache_read` | Context re-sent per API call. Grows with conversation length, not with work done. A huge value on a short run means the context is bloated |
| `cache_creation` | New context written to cache — roughly, how much fresh material this run pulled in |
| `thinking` | Part of `output`, not additional to it |
| `agents[].tool_calls` low + `duration_s` low | The task was easy. Say so — this is the baseline the hard ones are measured against |
| `agents[].tool_calls` high + `output` low | Searching, not producing. Usually a context problem: it was not told where to look |
| `parallelism.agent_time_ratio` | Agent-seconds per session-second. Meaningless when a human is in the loop between turns — report it only for an unattended run |
| `waves[].slowest_s` ≫ `fastest_s` | Barrier cost. The fast agents in that wave sat idle |
| `notes` non-empty | Every note goes in the report. A missing transcript changes what every other number means |

**`files_read` is part exact, part heuristic.** `Read` tool calls give the exact
`file_path`. Files opened through Bash (`cat`, `head`, `tail`, `sed -n`, `wc`,
`less`) are extracted from the command string by pattern, so they arrive
un-normalised — a `~`-relative or globbed path can land as a fragment like
`/INSIGHTS.md`. Treat a bash-derived row as a pointer worth checking, not a
citation. Extracting them is still necessary: in a session where the agents read
through Bash, leaving them out makes the duplication probe report zero overlap on
a run that duplicated plenty.

## Sources that are not worth using

- `~/.claude/usage-data/session-meta/*.json` — pre-aggregated per session, but
  **stale**: generated once alongside an old `report.html`, no recent sessions.
- `~/.claude/stats-cache.json` — last computed 2026-06-06, no token data.
- `~/.claude/telemetry/` — empty.
- `ccusage` / `claude-monitor` — not installed, and not needed. The transcripts have
  more than either exposes.

No hooks are involved and none are needed: the data is already durable on disk. A
`SessionEnd` or `SubagentStop` hook would add a failure mode and buy nothing —
revisit only if transcripts start being pruned.
