#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
if [ -z "$REPO_ROOT" ]; then
  echo "deprecation-audit: not inside a git repository" >&2
  exit 1
fi
cd "$REPO_ROOT" || exit 1

WARN_WINDOW_DAYS=14

if [ "$#" -gt 0 ]; then
  SCAN_DIRS=("$@")
else
  SCAN_DIRS=(server/src client/src reviewer-core/src)
fi

SCANNED=()
for dir in "${SCAN_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    SCANNED+=("$dir")
  else
    echo "deprecation-audit: skipping missing directory $dir" >&2
  fi
done

if [ "${#SCANNED[@]}" -eq 0 ]; then
  echo "deprecation-audit: no scan directories exist" >&2
  exit 1
fi

TODAY=$(date +%F)
DUE_SOON=$(date -d "+${WARN_WINDOW_DAYS} days" +%F 2>/dev/null) \
  || DUE_SOON=$(date -v"+${WARN_WINDOW_DAYS}d" +%F 2>/dev/null) \
  || DUE_SOON="$TODAY"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FILES="$WORK/files.txt"
MARKERS="$WORK/markers.tsv"
: > "$MARKERS"

grep -rl \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next \
  --exclude-dir=coverage --exclude-dir=.turbo \
  '@deprecated' "${SCANNED[@]}" 2>/dev/null | sort > "$FILES"

while IFS= read -r file; do
  [ -n "$file" ] || continue
  awk -v file="$file" '
    BEGIN { US = sprintf("%c", 31) }
    /@deprecated/ && !inblock { inblock = 1; start = FNR; dep = $0; ra = ""; mg = "" }
    inblock && /@removeAfter/ { ra = $0 }
    inblock && /@migration/ { mg = $0 }
    inblock && /\*\// {
      print file US start US dep US ra US mg
      inblock = 0
    }
    END { if (inblock) print file US start US dep US ra US mg }
  ' "$file" >> "$MARKERS"
done < "$FILES"

TOTAL=0
ERRORS=0
WARNINGS=0

report() {
  local level="$1" file="$2" line="$3" message="$4"
  printf '%s  %s:%s  %s\n' "$level" "$file" "$line" "$message"
  if [ "$level" = "ERROR" ]; then
    ERRORS=$((ERRORS + 1))
  else
    WARNINGS=$((WARNINGS + 1))
  fi
}

SEMVER='[0-9]+\.[0-9]+\.[0-9]+'
ISO_DATE='[0-9]{4}-[0-9]{2}-[0-9]{2}'

while IFS=$'\037' read -r file line dep ra mg; do
  [ -n "${file:-}" ] || continue
  TOTAL=$((TOTAL + 1))

  if ! printf '%s' "$dep" | grep -Eq "@deprecated[[:space:]]+since[[:space:]]+$SEMVER"; then
    report ERROR "$file" "$line" "malformed: expected '@deprecated since <version> — <replacement>'"
    continue
  fi

  since=$(printf '%s' "$dep" \
    | sed -E "s/.*@deprecated[[:space:]]+since[[:space:]]+($SEMVER).*/\1/")
  if [ "$since" = "0.0.0" ]; then
    report ERROR "$file" "$line" "since 0.0.0 is a placeholder, not a version: set the package to 0.1.0 in this commit"
  fi

  replacement=$(printf '%s' "$dep" \
    | sed -E "s/.*@deprecated[[:space:]]+since[[:space:]]+$SEMVER//" \
    | sed -E 's/^[[:space:]]*(—|-{1,2})[[:space:]]*//' \
    | sed -E 's/[[:space:]]*\*\/[[:space:]]*$//' \
    | sed -E 's/[[:space:]]+$//')
  if [ "${#replacement}" -lt 3 ]; then
    report ERROR "$file" "$line" "no replacement stated: add '— use {@link X}' or '— no replacement; <reason>'"
  fi

  if [ -z "$ra" ]; then
    report ERROR "$file" "$line" "missing @removeAfter — a marker with no date never expires"
    continue
  fi

  if ! printf '%s' "$ra" | grep -Eq "@removeAfter[[:space:]]+$SEMVER[[:space:]]+$ISO_DATE"; then
    report ERROR "$file" "$line" "malformed @removeAfter: expected '@removeAfter <version> <YYYY-MM-DD>'"
    continue
  fi

  if printf '%s' "$ra" | grep -Eq "@removeAfter[[:space:]]+0\.0\.0[[:space:]]"; then
    report ERROR "$file" "$line" "@removeAfter 0.0.0 can never be reached: name the version the removal lands in"
  fi

  if [ -z "$mg" ]; then
    report ERROR "$file" "$line" "missing @migration — the consumer has no escape route"
  else
    mg_path=$(printf '%s' "$mg" | sed -E 's/.*@migration[[:space:]]+//' | sed -E 's/[[:space:]].*$//')
    if [ -n "$mg_path" ] && [ ! -f "$mg_path" ]; then
      report WARN "$file" "$line" "@migration path does not exist: $mg_path"
    fi
  fi

  due=$(printf '%s' "$ra" | grep -Eo "$ISO_DATE" | head -1)
  if [ -z "$due" ]; then
    continue
  fi

  if [[ "$due" < "$TODAY" ]]; then
    report ERROR "$file" "$line" "overdue: @removeAfter $due has passed (today $TODAY)"
  elif [[ ! "$due" > "$DUE_SOON" ]]; then
    report WARN "$file" "$line" "due within ${WARN_WINDOW_DAYS} days: @removeAfter $due"
  fi
done < "$MARKERS"

printf '\ndeprecation-audit: %d marker(s), %d error(s), %d warning(s) in %s\n' \
  "$TOTAL" "$ERRORS" "$WARNINGS" "${SCANNED[*]}"

if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
exit 0
