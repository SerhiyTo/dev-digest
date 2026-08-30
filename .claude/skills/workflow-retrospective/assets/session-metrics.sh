#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
if [ -z "$REPO_ROOT" ]; then
  echo "session-metrics: not inside a git repository" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "session-metrics: jq is required" >&2
  exit 1
fi

ASSETS="$REPO_ROOT/.claude/skills/workflow-retrospective/assets"
AGENT_JQ="$ASSETS/agent-stats.jq"
ASSEMBLE_JQ="$ASSETS/assemble.jq"
for f in "$AGENT_JQ" "$ASSEMBLE_JQ"; do
  if [ ! -f "$f" ]; then
    echo "session-metrics: missing $f" >&2
    exit 1
  fi
done

SLUG=$(printf '%s' "$REPO_ROOT" | sed 's|/|-|g')
PROJECT_DIR="$HOME/.claude/projects/$SLUG"
if [ ! -d "$PROJECT_DIR" ]; then
  echo "session-metrics: no transcript directory at $PROJECT_DIR" >&2
  exit 1
fi

SESSION_ID="${1:-}"
if [ -z "$SESSION_ID" ]; then
  NEWEST=$(ls -t "$PROJECT_DIR"/*.jsonl 2>/dev/null | head -1)
  if [ -z "$NEWEST" ]; then
    echo "session-metrics: no session transcripts in $PROJECT_DIR" >&2
    exit 1
  fi
  SESSION_ID=$(basename "$NEWEST" .jsonl)
fi

MAIN="$PROJECT_DIR/$SESSION_ID.jsonl"
if [ ! -f "$MAIN" ]; then
  echo "session-metrics: no transcript for session $SESSION_ID at $MAIN" >&2
  exit 1
fi
SUBAGENT_DIR="$PROJECT_DIR/$SESSION_ID/subagents"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
NOTES="$WORK/notes.json"
echo '[]' > "$NOTES"

note() {
  jq --arg n "$1" '. + [$n]' "$NOTES" > "$NOTES.tmp" && mv "$NOTES.tmp" "$NOTES"
}

jq -s -f "$AGENT_JQ" "$MAIN" > "$WORK/orchestrator.json" || {
  echo "session-metrics: could not parse $MAIN" >&2
  exit 1
}

jq -s '
  def ts2e: (.[0:19]+"Z")|fromdateiso8601;
  ([.[]|select(.timestamp|type=="string")|.timestamp]|sort) as $ts
  | {
      id: ([.[]|.sessionId//empty]|first//"unknown"),
      start: ($ts|first),
      end: ($ts|last),
      wall_clock_s: (if ($ts|length) > 1 then (($ts|last|ts2e)-($ts|first|ts2e)) else 0 end),
      wall_clock_min: (if ($ts|length) > 1 then ((($ts|last|ts2e)-($ts|first|ts2e))/60|floor) else 0 end),
      cwd: ([.[]|.cwd//empty]|last//"unknown"),
      git_branch: ([.[]|.gitBranch//empty]|last//"unknown"),
      user_prompts: ([.[]|select(.type=="user" and (.message.content|type)=="string" and (.isMeta|not))]|length),
      transcript: "'"$MAIN"'"
    }' "$MAIN" > "$WORK/session.json"

jq -s '[.[]|select(.type=="system" and .subtype=="turn_duration")
        | {ts: .timestamp, duration_ms: .durationMs, message_count: .messageCount}]' \
  "$MAIN" > "$WORK/turns.json"

jq -s '[.[]|select(.type=="assistant")|.attributionSkill//empty]
       | group_by(.) | map({key: .[0], value: length}) | from_entries' \
  "$MAIN" > "$WORK/attributed.json"

jq -c 'select((.toolUseResult|type)=="object" and (.toolUseResult.agentId? != null))
       | {agent_id: .toolUseResult.agentId, ts: .timestamp,
          resolved_model: (.toolUseResult.resolvedModel//null),
          description: (.toolUseResult.description//"")}' \
  "$MAIN" > "$WORK/launches.ndjson" 2>/dev/null || : > "$WORK/launches.ndjson"

: > "$WORK/agents.ndjson"
AGENT_COUNT=0
if [ -d "$SUBAGENT_DIR" ]; then
  for tr in "$SUBAGENT_DIR"/agent-*.jsonl; do
    [ -f "$tr" ] || continue
    id=$(basename "$tr" .jsonl)
    id=${id#agent-}
    meta="$SUBAGENT_DIR/agent-$id.meta.json"
    if [ ! -f "$meta" ]; then
      meta="$WORK/empty-meta.json"
      echo '{}' > "$meta"
      note "no meta.json for subagent $id — agent type unknown"
    fi
    jq -s -f "$AGENT_JQ" "$tr" 2>/dev/null \
      | jq -c --arg id "$id" --slurpfile m "$meta" '
          . + {agent_id: $id,
               agent_type: ($m[0].agentType // "unknown"),
               description: ($m[0].description // ""),
               spawn_depth: ($m[0].spawnDepth // 1)}' \
      >> "$WORK/agents.ndjson" 2>/dev/null \
      || note "could not parse subagent transcript $id"
    AGENT_COUNT=$((AGENT_COUNT + 1))
  done
fi

if [ "$AGENT_COUNT" -eq 0 ]; then
  note "no subagent transcripts for this session — every number below is the orchestrator alone"
fi

LAUNCHED=$(wc -l < "$WORK/launches.ndjson" | tr -d ' ')
if [ "$LAUNCHED" -gt "$AGENT_COUNT" ]; then
  note "main thread records $LAUNCHED agent launches but only $AGENT_COUNT transcripts exist — some agents are still running or their transcript was pruned"
fi

jq -n \
  --slurpfile agents "$WORK/agents.ndjson" \
  --slurpfile launches "$WORK/launches.ndjson" \
  --argjson orchestrator "$(cat "$WORK/orchestrator.json")" \
  --argjson session "$(cat "$WORK/session.json")" \
  --argjson turns "$(cat "$WORK/turns.json")" \
  --argjson attributed "$(cat "$WORK/attributed.json")" \
  --argjson notes "$(cat "$NOTES")" \
  -f "$ASSEMBLE_JQ"
