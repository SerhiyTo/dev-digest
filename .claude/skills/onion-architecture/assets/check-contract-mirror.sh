#!/usr/bin/env bash
# Contracts in server/src/vendor/shared are canonical and mirrored into
# client/src/vendor/shared. Nothing else can see that: dependency-cruiser runs
# inside one package, and the two packages have separate tsconfigs and
# lockfiles, so a contract can drift for months while both sides typecheck.
#
# Usage: check-contract-mirror.sh [repo-root]   (default: current directory)
set -uo pipefail

ROOT="${1:-.}"
SERVER="$ROOT/server/src/vendor/shared"
CLIENT="$ROOT/client/src/vendor/shared"

for dir in "$SERVER" "$CLIENT"; do
  if [ ! -d "$dir" ]; then
    echo "check-contract-mirror: no such directory: $dir" >&2
    exit 2
  fi
done

drift="$(diff -rq "$SERVER" "$CLIENT" 2>&1)"

if [ -z "$drift" ]; then
  echo "contract mirror: in sync ($SERVER == $CLIENT)"
  exit 0
fi

echo "contract mirror: DRIFTED"
echo
echo "$drift" | sed 's/^/  /'
echo
echo "server/src/vendor/shared is canonical. Copy the changed files into"
echo "client/src/vendor/shared in the same commit, then re-run this check."
echo "Per-file diffs:"
echo "$drift" | grep '^Files ' | awk '{print "  diff " $2 " " $4}'
exit 1
