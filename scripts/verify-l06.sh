#!/usr/bin/env bash
#
# Lesson 06 verification — the eval pipeline, every AC-named lane in one command.
#
#   ./scripts/verify-l06.sh                      # everything, integration lane included
#   VERIFY_SKIP_IT=1 ./scripts/verify-l06.sh     # skip the Docker/Testcontainers lane
#   VERIFY_SKIP_BUILD=1 ./scripts/verify-l06.sh  # skip `next build`
#
# This is the command SPEC-04's AC-51 through AC-54 and AC-68 describe. It
# carries only the lanes those criteria name — the mcp lanes and the depcruise
# onion lane that verify-l04.sh runs are deliberately not repeated here.
#
# The integration lane needs Docker; when it is unavailable the vitest files
# skip themselves, so this script reports that rather than pretending it ran.
# `next build` is skipped automatically while a dev server holds :3000, because
# building under `pnpm dev` poisons the shared .next directory.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=()
SKIPPED=()

step() {
  local label="$1"
  shift
  printf '\n\033[1m▶ %s\033[0m\n' "$label"
  if "$@"; then
    printf '\033[32m✓ %s\033[0m\n' "$label"
  else
    printf '\033[31m✗ %s\033[0m\n' "$label"
    FAILED+=("$label")
  fi
}

skip() {
  printf '\n\033[33m⊘ %s — %s\033[0m\n' "$1" "$2"
  SKIPPED+=("$1 ($2)")
}

step "server typecheck" bash -c "cd '$ROOT/server' && pnpm typecheck"
step "server unit tests" bash -c "cd '$ROOT/server' && pnpm exec vitest run --exclude '**/*.it.test.ts'"

if [[ "${VERIFY_SKIP_IT:-0}" == "1" ]]; then
  skip "server integration tests" "VERIFY_SKIP_IT=1"
elif ! docker info >/dev/null 2>&1; then
  skip "server integration tests" "Docker unavailable"
else
  step "server integration tests" bash -c "cd '$ROOT/server' && pnpm exec vitest run .it.test --no-file-parallelism"
fi

step "reviewer-core typecheck and tests" bash -c \
  "cd '$ROOT/reviewer-core' && npm run typecheck && npm test"

step "client typecheck" bash -c "cd '$ROOT/client' && pnpm typecheck"
step "client tests" bash -c "cd '$ROOT/client' && pnpm exec vitest run"

if [[ "${VERIFY_SKIP_BUILD:-0}" == "1" ]]; then
  skip "client build" "VERIFY_SKIP_BUILD=1"
elif lsof -ti:3000 >/dev/null 2>&1; then
  skip "client build" "a dev server holds :3000"
else
  step "client build" bash -c "cd '$ROOT/client' && pnpm build"
fi

step "e2e typecheck" bash -c "cd '$ROOT/e2e' && npm run typecheck"

# AC-53 — a route-registration lane and a scorer-purity lane, each independent
# of the full-suite lanes above so removing either fails this command on its
# own, not only as a side effect of the broader suite going red.
step "eval routes are registered" bash -c \
  "cd '$ROOT/server' && pnpm exec vitest run test/routes-smoke.test.ts"

step "eval scorer purity" bash -c \
  "cd '$ROOT/reviewer-core' && npm test -- eval-score-purity"

# AC-68 — contracts/eval-ci.ts moves into the gated list rather than staying
# excluded, and knowledge.ts is gated alongside it since this feature edits
# both mirrored copies. A single changed character in either fails this lane.
step "vendor/shared eval contracts mirror is byte-identical" bash -c "
  status=0
  for f in contracts/eval-ci.ts contracts/knowledge.ts; do
    if ! diff -q '$ROOT/server/src/vendor/shared/'\$f '$ROOT/client/src/vendor/shared/'\$f; then
      status=1
    fi
  done
  exit \$status
"

printf '\n\033[1m── L06 verification ──\033[0m\n'
for s in "${SKIPPED[@]:-}"; do
  [[ -n "$s" ]] && printf '\033[33m⊘ skipped: %s\033[0m\n' "$s"
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  for f in "${FAILED[@]}"; do printf '\033[31m✗ failed: %s\033[0m\n' "$f"; done
  printf '\033[31mL06 NOT verified — %d lane(s) failed.\033[0m\n' "${#FAILED[@]}"
  exit 1
fi

if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  printf '\033[33mL06 not fully verified — %d lane(s) skipped.\033[0m\n' "${#SKIPPED[@]}"
  exit 0
fi

printf '\033[32mL06 verified.\033[0m\n'
