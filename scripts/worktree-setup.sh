#!/usr/bin/env bash
# Makes a fresh worktree ready to work in: the main checkout's env files (Claude Code copies them through
# .worktreeinclude, but a worktree made any other way has none) and the dependencies. Safe to run again.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIN="$(cd "$(git -C "$ROOT" rev-parse --git-common-dir)/.." && pwd)"
cd "$ROOT"

if [ "$MAIN" != "$ROOT" ]; then
  while IFS= read -r file; do
    case "$file" in '' | '#'*) continue ;; esac
    if [ -f "$MAIN/$file" ] && [ ! -e "$file" ]; then
      cp "$MAIN/$file" "$file"
      echo "copied $file"
    fi
  done < .worktreeinclude
fi

# The mise pnpm shim has no version set on this machine; corepack reads packageManager from package.json.
if pnpm --version > /dev/null 2>&1; then
  pnpm install --frozen-lockfile --prefer-offline
else
  corepack pnpm install --frozen-lockfile --prefer-offline
fi

(cd services/api && uv sync --quiet)
echo "Worktree ready."
