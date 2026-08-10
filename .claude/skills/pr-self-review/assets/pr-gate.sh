#!/usr/bin/env bash
set -uo pipefail

payload=$(cat)

case "$payload" in
  *"gh pr"*) ;;
  *) exit 0 ;;
esac

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$REPO_ROOT" ] || exit 0
REPORT="$REPO_ROOT/.claude/pr-self-review/last-report.json"

command=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$command" ] || exit 0

executable_text() {
  local raw="$1"
  if printf '%s' "$raw" | grep -qE '(^|[[:space:]])(bash|sh|zsh)[[:space:]]+-c([[:space:]]|$)|(^|[[:space:]])eval([[:space:]]|$)'; then
    printf '%s' "$raw"
    return
  fi
  printf '%s' "$raw" | sed -e "s/'[^']*'/''/g" -e 's/"[^"]*"/""/g'
}

opens_pr_for_merge() {
  local cmd
  cmd=$(executable_text "$1")
  if printf '%s' "$cmd" | grep -qE '(^|[^[:alnum:]_.-])gh[[:space:]]+pr[[:space:]]+ready([[:space:]]|$)'; then
    return 0
  fi
  if printf '%s' "$cmd" | grep -qE '(^|[^[:alnum:]_.-])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'; then
    printf '%s' "$cmd" | grep -qE '(^|[[:space:]])(--draft|-d)([[:space:]=]|$)' && return 1
    return 0
  fi
  return 1
}

opens_pr_for_merge "$command" || exit 0

if [ "${PR_SELF_REVIEW_OVERRIDE:-}" = "1" ]; then
  echo "pr-self-review: gate bypassed via PR_SELF_REVIEW_OVERRIDE=1" >&2
  exit 0
fi

block() {
  printf 'pr-self-review gate: BLOCKED\n\n%s\n' "$1" >&2
  exit 2
}

if [ ! -f "$REPORT" ]; then
  block "No self-review report found.

Run /pr-self-review before opening this pull request. It audits the open changes
against the project's skills and writes the report this gate reads."
fi

head_sha=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)
worktree_hash=$( { git -C "$REPO_ROOT" status --porcelain; git -C "$REPO_ROOT" diff HEAD; } | shasum -a 256 | cut -d' ' -f1 )

report_head=$(jq -r '.head_sha // empty' "$REPORT" 2>/dev/null)
report_worktree=$(jq -r '.worktree_hash // empty' "$REPORT" 2>/dev/null)

if [ -z "$report_head" ]; then
  block "The self-review report is unreadable or malformed: $REPORT

Re-run /pr-self-review."
fi

if [ "$report_head" != "$head_sha" ] || [ "$report_worktree" != "$worktree_hash" ]; then
  block "The self-review report is stale — the code changed after it was written.

  reviewed HEAD : ${report_head:0:12}
  current  HEAD : ${head_sha:0:12}

Re-run /pr-self-review so the gate judges what you are actually about to open."
fi

file_hash() {
  [ -f "$1" ] || { printf 'missing\n'; return; }
  shasum -a 256 "$1" | cut -d' ' -f1
}

active_acks="$(mktemp)"
trap 'rm -f "$active_acks"' EXIT
while IFS=$'\t' read -r ack_id ack_file ack_hash; do
  [ -n "$ack_id" ] || continue
  if [ "$(file_hash "$REPO_ROOT/$ack_file")" = "$ack_hash" ]; then
    printf '%s\n' "$ack_id" >> "$active_acks"
  fi
done < <(jq -r '.acknowledged[]? | [.id, .file, .file_hash] | @tsv' "$REPORT" 2>/dev/null)

blocking=$(jq -r --rawfile acks "$active_acks" '
  ($acks | split("\n") | map(select(length > 0))) as $active
  | [ .findings[]? | select(.severity == "CRITICAL") | select(.id as $id | $active | index($id) | not) ]
  | .[] | "  \(.file):\(.start_line) — \(.title)  [\(.source // .skill // "review")]  id=\(.id)"
' "$REPORT" 2>/dev/null)

if [ -n "$blocking" ]; then
  count=$(printf '%s\n' "$blocking" | grep -c .)
  block "$count CRITICAL finding(s) must be resolved before this PR can be merged:

$blocking

Fix them and re-run /pr-self-review, or record a justification:
  /pr-self-review ack <id> \"why this is acceptable\"

An acknowledgement expires as soon as its file changes.
Emergency bypass (logged): PR_SELF_REVIEW_OVERRIDE=1"
fi

exit 0
