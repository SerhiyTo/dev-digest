#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
if [ -z "$REPO_ROOT" ]; then
  echo "pr-self-review: not inside a git repository" >&2
  exit 1
fi
cd "$REPO_ROOT" || exit 1

ONION_CONFIG="$REPO_ROOT/.claude/skills/onion-architecture/assets/dependency-cruiser.onion.cjs"
DEPCRUISE_BASELINE_WARNINGS=35

RUN_TYPECHECK=1
for arg in "$@"; do
  case "$arg" in
    --no-typecheck) RUN_TYPECHECK=0 ;;
  esac
done

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FINDINGS="$WORK/findings.ndjson"
CHECKS="$WORK/checks.ndjson"
FILES="$WORK/files.txt"
UNTRACKED="$WORK/untracked.txt"
ADDED="$WORK/added.tsv"
: > "$FINDINGS"
: > "$CHECKS"
FINDING_SEQ=0

emit_finding() {
  FINDING_SEQ=$((FINDING_SEQ + 1))
  jq -nc \
    --arg id "preflight-$(printf '%03d' "$FINDING_SEQ")" \
    --arg severity "$1" \
    --arg category "$2" \
    --arg title "$3" \
    --arg file "$4" \
    --argjson start_line "$5" \
    --arg rationale "$6" \
    --arg suggestion "$7" \
    --arg source "$8" \
    --arg kind "${9:-finding}" \
    '{id: $id, severity: $severity, category: $category, title: $title,
      file: $file, start_line: $start_line, end_line: $start_line,
      rationale: $rationale, suggestion: $suggestion, confidence: 1,
      kind: $kind, source: $source}' >> "$FINDINGS"
}

emit_check() {
  jq -nc --arg name "$1" --arg status "$2" --arg detail "$3" \
    '{name: $name, status: $status, detail: $detail}' >> "$CHECKS"
}

fail_hard() {
  jq -nc --arg reason "$1" --slurpfile checks <(cat "$CHECKS") \
    '{halt: $reason, checks: $checks, findings: []}'
  exit 0
}

is_reviewable() {
  case "$1" in
    */migrations/meta/*) return 1 ;;
    pnpm-lock.yaml|package-lock.json|*/pnpm-lock.yaml|*/package-lock.json) return 1 ;;
    .claude/skills/*-workspace/*) return 1 ;;
    dist/*|*/dist/*|.next/*|*/.next/*|build/*|*/build/*) return 1 ;;
    coverage/*|*/coverage/*) return 1 ;;
  esac
  return 0
}

collect_files() {
  git ls-files --others --exclude-standard > "$UNTRACKED.raw"
  : > "$UNTRACKED"
  while IFS= read -r f; do
    is_reviewable "$f" && printf '%s\n' "$f" >> "$UNTRACKED"
  done < "$UNTRACKED.raw"

  : > "$FILES"
  while IFS= read -r f; do
    is_reviewable "$f" && printf '%s\n' "$f" >> "$FILES"
  done < <(git diff --name-only "$BASE")
  cat "$UNTRACKED" >> "$FILES"
  sort -u -o "$FILES" "$FILES"
}

collect_added_lines() {
  git diff -U0 "$BASE" -- . | awk '
    /^\+\+\+ / {
      path = substr($0, 5)
      sub(/^b\//, "", path)
      file = path
      next
    }
    /^@@/ {
      match($0, /\+[0-9]+/)
      line = substr($0, RSTART + 1, RLENGTH - 1) + 0
      next
    }
    /^\+/ {
      if (file != "/dev/null") print file "\t" line "\t" substr($0, 2)
      line++
      next
    }
  ' > "$ADDED.raw"

  while IFS= read -r f; do
    [ -f "$f" ] || continue
    awk -v file="$f" '{ print file "\t" NR "\t" $0 }' "$f" >> "$ADDED.raw"
  done < "$UNTRACKED"

  : > "$ADDED"
  while IFS=$'\t' read -r f rest; do
    is_reviewable "$f" && printf '%s\t%s\n' "$f" "$rest" >> "$ADDED"
  done < "$ADDED.raw"
}

scan_added() {
  awk -F'\t' -v fp="$1" -v cr="$2" '$1 ~ fp && $3 ~ cr { print $1 "\t" $2 "\t" $3 }' "$ADDED"
}

touches() {
  grep -qE "$1" "$FILES"
}

check_typecheck() {
  if [ "$RUN_TYPECHECK" -eq 0 ]; then
    emit_check typecheck skipped "disabled via --no-typecheck"
    return
  fi
  local pkg failed=""
  for pkg in server client reviewer-core; do
    touches "^$pkg/" || continue
    local runner="pnpm"
    [ "$pkg" = "reviewer-core" ] && runner="npm"
    if ! (cd "$pkg" && "$runner" run typecheck >"$WORK/tc-$pkg.log" 2>&1); then
      failed="$failed $pkg"
    fi
  done
  if [ -n "$failed" ]; then
    emit_check typecheck failed "$failed"
    fail_hard "typecheck fails in:$failed — fix compilation before reviewing. Logs: $WORK/tc-*.log"
  fi
  emit_check typecheck ok ""
}

check_onion_depcruise() {
  touches '^(server|reviewer-core)/src/' || { emit_check depcruise skipped "no backend files in diff"; return; }
  if [ ! -f "$ONION_CONFIG" ]; then
    emit_check depcruise skipped "config missing at $ONION_CONFIG"
    return
  fi
  local out status
  out=$(cd server && npx --no-install depcruise --config "$ONION_CONFIG" src 2>&1)
  status=$?
  if printf '%s' "$out" | grep -q "command not found\|could not determine executable"; then
    emit_check depcruise skipped "dependency-cruiser unavailable"
    return
  fi

  local warn_count
  warn_count=$(printf '%s' "$out" | sed -n 's/.*(\([0-9]*\) errors, \([0-9]*\) warnings).*/\2/p' | tail -1)

  if [ "$status" -ne 0 ]; then
    while IFS= read -r line; do
      local rule pair from
      rule=$(printf '%s' "$line" | sed -n 's/^[[:space:]]*error \([^:]*\):.*/\1/p')
      pair=$(printf '%s' "$line" | sed -n 's/^[[:space:]]*error [^:]*: \(.*\)$/\1/p')
      from=$(printf '%s' "$pair" | sed 's/ .*//')
      emit_finding CRITICAL bug "Onion violation: $rule" "server/$from" 1 \
        "dependency-cruiser reports a NEW error against the onion ruleset: $pair. The clean tree is 0 errors / $DEPCRUISE_BASELINE_WARNINGS warnings, so this dependency was introduced by these changes." \
        "Invert the dependency so it points inward, or move the code to the ring that may hold it. See .claude/skills/onion-architecture/references/rings.md" \
        depcruise
    done < <(printf '%s\n' "$out" | grep '^[[:space:]]*error ')
    emit_check depcruise failed "$status error(s)"
    return
  fi

  if [ -n "$warn_count" ] && [ "$warn_count" -gt "$DEPCRUISE_BASELINE_WARNINGS" ]; then
    emit_finding WARNING style "Onion warnings above baseline" server/src 1 \
      "dependency-cruiser reports $warn_count warnings; the documented baseline is $DEPCRUISE_BASELINE_WARNINGS. These changes added $((warn_count - DEPCRUISE_BASELINE_WARNINGS))." \
      "Check which legacy-* rule grew and whether the new code can avoid it." \
      depcruise
  fi
  emit_check depcruise ok "0 errors, ${warn_count:-?} warnings"
}

drifted_at_base() {
  local a b
  a="$WORK/base-a" b="$WORK/base-b"
  git show "$BASE:$1" > "$a" 2>/dev/null || return 1
  git show "$BASE:$2" > "$b" 2>/dev/null || return 1
  diff -q "$a" "$b" >/dev/null 2>&1 && return 1
  return 0
}

check_contract_mirror() {
  local rel counterpart found=0
  while IFS= read -r f; do
    case "$f" in
      server/src/vendor/shared/*) ;;
      *) continue ;;
    esac
    found=1
    rel="${f#server/src/vendor/shared/}"
    counterpart="client/src/vendor/shared/$rel"
    if [ ! -f "$counterpart" ]; then
      emit_finding CRITICAL bug "Vendored contract has no client mirror" "$f" 1 \
        "Contracts in server/src/vendor/shared/ are canonical and must be mirrored to client/src/vendor/shared/ in the same commit (root CLAUDE.md). $counterpart does not exist." \
        "Create $counterpart as a byte-identical copy." \
        contract-mirror
    elif ! diff -q "$f" "$counterpart" >/dev/null 2>&1; then
      if drifted_at_base "$f" "$counterpart"; then
        emit_finding WARNING bug "Vendored contract mirror was already drifted" "$f" 1 \
          "$f and $counterpart differ, but they already differed at the merge-base — these changes did not introduce it. Reported so it does not stay invisible forever, not as a merge blocker." \
          "Worth reconciling in a separate commit: copy $f over $counterpart." \
          contract-mirror
      else
        emit_finding CRITICAL bug "Vendored contract drifted from client mirror" "$f" 1 \
          "$f and $counterpart were identical at the merge-base and differ now. The mirror must be updated in the same commit as the canonical copy (root CLAUDE.md), otherwise the two packages validate against different schemas." \
          "Copy $f over $counterpart." \
          contract-mirror
      fi
    fi
  done < "$FILES"
  [ "$found" -eq 1 ] && emit_check contract-mirror ok "" || emit_check contract-mirror skipped "no vendored contracts in diff"
}

check_secrets_provider() {
  while IFS=$'\t' read -r f line content; do
    emit_finding CRITICAL security "process.env in feature code" "$f" "$line" \
      "Secrets and config reach feature code only through SecretsProvider; platform/config.ts deliberately excludes secret keys (server/CLAUDE.md, onion-architecture). Direct process.env access here bypasses that boundary: ${content# }" \
      "Inject the value through SecretsProvider or the container instead." \
      secrets-provider
  done < <(scan_added '^server/src/modules/' 'process[.]env')
  emit_check secrets-provider ok ""
}

check_core_purity() {
  local forbidden='drizzle-orm|postgres|@octokit|simple-git|node:fs|from .fs.|node:child_process|[.][.]/[.][.]/server|@devdigest/api'
  while IFS=$'\t' read -r f line content; do
    case "$content" in
      *import*|*require*) ;;
      *) continue ;;
    esac
    emit_finding CRITICAL bug "reviewer-core purity violation" "$f" "$line" \
      "reviewer-core/ is a hard-contract pure package: never import DB, fs, GitHub or server code there — everything external arrives injected (root CLAUDE.md, onion-architecture ring 0). This line breaks that: ${content# }" \
      "Define a port and inject the implementation from the server instead." \
      core-purity
  done < <(scan_added '^reviewer-core/src/' "$forbidden")
  emit_check core-purity ok ""
}

check_migration_edits() {
  while IFS= read -r f; do
    emit_finding CRITICAL bug "Generated migration SQL was hand-edited" "$f" 1 \
      "Generated migration SQL is never hand-edited (root CLAUDE.md, server/CLAUDE.md). This file is modified rather than newly generated, so the schema in code and the applied migration can diverge." \
      "Revert the file and regenerate: change src/db/schema/*.ts, then pnpm db:generate." \
      migration-edit
  done < <(git diff --name-status "$BASE" | awk -F'\t' '$1 ~ /^M/ && $2 ~ /^server\/src\/db\/migrations\/[0-9]+_.*\.sql$/ { print $2 }')
  emit_check migration-edit ok ""
}

check_secret_leak() {
  local patterns='sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(api[_-]?key|secret|password|token)[[:space:]]*[:=][[:space:]]*.[A-Za-z0-9/+_-]{20,}'
  while IFS=$'\t' read -r f line content; do
    case "$f" in
      *.example|*.md|*/mocks.ts|*.test.ts|*.test.tsx) continue ;;
    esac
    emit_finding CRITICAL security "Possible secret in added line" "$f" "$line" \
      "An added line matches a credential pattern. Committed secrets are unrecoverable once pushed — they must be rotated, not just deleted." \
      "Move the value into the environment and read it through SecretsProvider; rotate it if it ever reached a commit." \
      secret-scan secret_leak
  done < <(scan_added '.' "$patterns")
  emit_check secret-scan ok ""
}

check_tests_dimension() {
  local touched_tests_server touched_tests_client
  touched_tests_server=$(grep -cE '^(server|reviewer-core)/.*\.(it\.)?test\.ts$' "$FILES")
  touched_tests_client=$(grep -cE '^client/.*\.test\.(ts|tsx)$' "$FILES")

  if touches '^server/src/modules/|^reviewer-core/src/' && [ "$touched_tests_server" -eq 0 ]; then
    emit_finding WARNING test "Backend behaviour changed with no test touched" server/src/modules 1 \
      "TESTING.md keeps one suite per package and covers behaviour at the seams. These changes touch server/src/modules or reviewer-core/src without adding or updating a single *.test.ts / *.it.test.ts." \
      "Add one test for the seam this change moves, or say in the PR why the existing suite already covers it." \
      tests-dimension
  fi
  if touches '^client/src/components/|^client/src/app/' && [ "$touched_tests_client" -eq 0 ]; then
    emit_finding WARNING test "UI changed with no component test touched" client/src 1 \
      "TESTING.md covers the PR-review surface with React Testing Library. These changes touch client components or routes without adding or updating a *.test.tsx." \
      "Add or extend a component test for the changed behaviour, or note why it is not worth one." \
      tests-dimension
  fi
  emit_check tests-dimension ok ""
}

check_pr_readiness() {
  while IFS=$'\t' read -r f line content; do
    emit_finding WARNING style "Debug statement left in" "$f" "$line" \
      "Added line contains a debug statement: ${content# }" \
      "Remove it, or route it through the module's logger if it is meant to stay." \
      pr-readiness
  done < <(scan_added '[.](ts|tsx)$' 'console[.](log|debug|dir)[(]|debugger[[:space:]]*;?$')

  while IFS=$'\t' read -r f line content; do
    emit_finding CRITICAL test "Focused test would silently skip the suite" "$f" "$line" \
      "An added line uses .only(, which makes the runner execute this test alone. Merged, it disables the rest of the file in CI while still reporting green." \
      "Remove .only before opening the PR." \
      pr-readiness
  done < <(scan_added '[.](test|spec)[.](ts|tsx)$' '[.]only[(]')

  while IFS=$'\t' read -r f line content; do
    emit_finding SUGGESTION style "New TODO/FIXME added" "$f" "$line" \
      "Added line introduces a TODO/FIXME: ${content# }" \
      "Either resolve it or move it to the module's specs/ or INSIGHTS.md, which is where this repo keeps deferred work." \
      pr-readiness
  done < <(scan_added '[.](ts|tsx)$' '(TODO|FIXME|XXX|HACK)')

  while IFS=$'\t' read -r f line content; do
    emit_finding SUGGESTION style "Comment added to new code" "$f" "$line" \
      "Root CLAUDE.md forbids comments in new code: intent goes in naming and types, non-obvious why goes to the module's specs/ or INSIGHTS.md. Added line: ${content# }" \
      "Delete the comment, or move the reasoning into specs/ or INSIGHTS.md." \
      pr-readiness
  done < <(scan_added '^(server|client|reviewer-core|e2e)/src/.*[.](ts|tsx)$' '^[[:space:]]*(//|/[*])' | grep -v '/vendor/')
  emit_check pr-readiness ok ""
}

check_large_files() {
  local size
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    is_reviewable "$f" || continue
    size=$(wc -c < "$f" | tr -d ' ')
    if [ "$size" -gt 1048576 ]; then
      emit_finding WARNING style "Large file added to the repository" "$f" 1 \
        "This file is $((size / 1024)) KB. Large binaries live in git history forever and slow every clone." \
        "Keep it out of the repo, or confirm it genuinely belongs in version control." \
        pr-readiness
    fi
  done < <( { git diff --name-status "$BASE" | awk -F'\t' '$1 ~ /^A/ { print $2 }'; cat "$UNTRACKED"; } | sort -u )
  emit_check large-files ok ""
}

BASE=$(git merge-base main HEAD 2>/dev/null)
if [ -z "$BASE" ]; then
  emit_check scope failed "no merge-base with main"
  fail_hard "cannot determine a merge-base with main — is this a detached or unrelated history?"
fi

if [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ]; then
  emit_check scope failed "on main"
  fail_hard "you are on main — create a feature branch before running a PR self-review."
fi

collect_files
if [ ! -s "$FILES" ]; then
  emit_check scope ok "no reviewable changes"
  jq -nc --slurpfile checks <(cat "$CHECKS") \
    '{halt: null, base: "'"$BASE"'", files: [], findings: [], checks: $checks}'
  exit 0
fi
collect_added_lines
emit_check scope ok "$(wc -l < "$FILES" | tr -d ' ') file(s), $(wc -l < "$ADDED" | tr -d ' ') added line(s)"

check_typecheck
check_onion_depcruise
check_contract_mirror
check_secrets_provider
check_core_purity
check_migration_edits
check_secret_leak
check_tests_dimension
check_pr_readiness
check_large_files

jq -nc \
  --arg base "$BASE" \
  --slurpfile findings <(cat "$FINDINGS") \
  --slurpfile checks <(cat "$CHECKS") \
  --rawfile files "$FILES" \
  '{halt: null, base: $base,
    files: ($files | rtrimstr("\n") | split("\n") | map(select(length > 0))),
    findings: $findings, checks: $checks}'
