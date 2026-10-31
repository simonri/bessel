#!/usr/bin/env bash
# Checks what this branch changed since it left master: lint, format and types on the changed files, and a single
# Alembic head. Fast enough to run on every stop (the Stop hook does), so no test suites unless --full.
#
#   scripts/check.sh           lint, format, types, migrations
#   scripts/check.sh --full    also the affected tests and, when the API changed, the generated clients
#   scripts/check.sh --hook    as the Stop hook runs it: missing dependencies skip a check instead of failing it
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FULL=false
HOOK=false
for arg in "$@"; do
  case "$arg" in
    --full) FULL=true ;;
    --hook) HOOK=true ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

BASE="$(git merge-base HEAD origin/master 2>/dev/null || git rev-parse HEAD)"
mapfile -t CHANGED < <(
  {
    git diff --name-only --diff-filter=ACMR "$BASE"
    git ls-files --others --exclude-standard
  } | sort -u
)

failed=()
skipped=()

run() {
  local name="$1"
  shift
  echo "── $name"
  if ! "$@"; then
    failed+=("$name")
  fi
}

has() {
  local pattern="$1" file
  for file in "${CHANGED[@]}"; do
    [[ "$file" =~ $pattern ]] && [ -e "$file" ] && return 0
  done
  return 1
}

matching() {
  local pattern="$1" strip="${2:-}" file
  for file in "${CHANGED[@]}"; do
    [[ "$file" =~ $pattern ]] && [ -e "$file" ] && echo "${file#"$strip"}"
  done
}

need_node() {
  if [ -x node_modules/.bin/biome ]; then
    return 0
  fi
  if $HOOK; then
    skipped+=("$1 (no node_modules: run scripts/worktree-setup.sh)")
    return 1
  fi
  echo "No node_modules here. Run scripts/worktree-setup.sh first." >&2
  failed+=("$1")
  return 1
}

if [ "${#CHANGED[@]}" -eq 0 ]; then
  echo "Nothing changed since master."
  exit 0
fi

# Python
if has '^services/api/.*\.py$'; then
  mapfile -t PY < <(matching '^services/api/.*\.py$' services/api/)
  run "ruff check" bash -c 'cd services/api && uv run --quiet ruff check "$@"' _ "${PY[@]}"
  run "ruff format" bash -c 'cd services/api && uv run --quiet ruff format --check "$@"' _ "${PY[@]}"
fi

if has '^services/api/migrations/'; then
  run "one alembic head" bash -c '
    cd services/api
    heads=$(uv run --quiet alembic heads)
    if [ "$(printf "%s\n" "$heads" | grep -c .)" -ne 1 ]; then
      printf "More than one Alembic head:\n%s\nPoint your migration'"'"'s down_revision at master'"'"'s head.\n" "$heads" >&2
      exit 1
    fi'
fi

# TypeScript and friends
if has '\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$' && need_node biome; then
  mapfile -t JS < <(matching '\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$')
  run "biome" node_modules/.bin/biome check --no-errors-on-unmatched "${JS[@]}"
fi

if has '^(apps/web|packages)/.*\.(ts|tsx)$' && need_node "web types"; then
  run "web types" bash -c 'cd apps/web && node_modules/.bin/tsc --noEmit'
fi

if has '^apps/desktop/.*\.ts$' && need_node "desktop types"; then
  run "desktop types" bash -c 'cd apps/desktop && node_modules/.bin/tsc --noEmit'
fi

if $FULL; then
  if has '^services/api/'; then
    run "api tests" bash -c 'cd services/api && BESSEL_ENV=testing uv run --quiet python -m pytest . -q -n auto --maxprocesses=15 -p no:cacheprovider'
  fi
  if has '^(apps/web|packages)/' && need_node "web tests"; then
    mapfile -t WEB < <(matching '^(apps/web|packages)/.*\.(ts|tsx)$')
    WEB=("${WEB[@]/#/../../}")
    run "web tests" bash -c 'cd apps/web && node_modules/.bin/vitest related --run --passWithNoTests "$@"' _ "${WEB[@]}"
  fi
  if has '^apps/desktop/' && need_node "desktop tests"; then
    run "desktop tests" bash -c 'cd apps/desktop && node_modules/.bin/vitest run'
  fi
  if has '^(services/api/src|scripts/generate_)' && need_node "generated clients"; then
    run "generated clients" scripts/check_clients.sh
  fi
fi

echo
for name in "${skipped[@]}"; do
  echo "skipped: $name"
done
if [ "${#failed[@]}" -gt 0 ]; then
  echo "FAILED: ${failed[*]}" >&2
  exit 1
fi
echo "All checks passed."
