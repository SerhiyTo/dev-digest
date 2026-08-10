#!/usr/bin/env bash
#
# Lesson 03 verification — Intent Layer + Smart Diff, every lane in one command.
#
#   ./scripts/verify-l03.sh              # everything, integration lane included
#   VERIFY_SKIP_IT=1 ./scripts/verify-l03.sh    # skip the Docker/Testcontainers lane
#   VERIFY_SKIP_BUILD=1 ./scripts/verify-l03.sh # skip `next build`
#
# Also reachable as `pnpm verify:l03` from server/ or client/.
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
  step "server integration tests" bash -c "cd '$ROOT/server' && pnpm exec vitest run .it.test"
fi

step "reviewer-core typecheck" bash -c "cd '$ROOT/reviewer-core' && npm run typecheck"
step "reviewer-core tests" bash -c "cd '$ROOT/reviewer-core' && npm test"

step "client typecheck" bash -c "cd '$ROOT/client' && pnpm typecheck"
step "client tests" bash -c "cd '$ROOT/client' && pnpm test"

if [[ "${VERIFY_SKIP_BUILD:-0}" == "1" ]]; then
  skip "client build" "VERIFY_SKIP_BUILD=1"
elif lsof -ti:3000 >/dev/null 2>&1; then
  skip "client build" "a dev server holds :3000"
else
  step "client build" bash -c "cd '$ROOT/client' && pnpm build"
fi

step "e2e typecheck" bash -c "cd '$ROOT/e2e' && npm run typecheck"

step "L03 route is registered" bash -c \
  "cd '$ROOT/server' && pnpm exec vitest run test/routes-smoke.test.ts"

printf '\n\033[1m── L03 verification ──\033[0m\n'
for s in "${SKIPPED[@]:-}"; do
  [[ -n "$s" ]] && printf '\033[33m⊘ skipped: %s\033[0m\n' "$s"
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  for f in "${FAILED[@]}"; do printf '\033[31m✗ failed: %s\033[0m\n' "$f"; done
  printf '\033[31mL03 NOT verified — %d lane(s) failed.\033[0m\n' "${#FAILED[@]}"
  exit 1
fi

printf '\033[32mL03 verified.\033[0m\n'
