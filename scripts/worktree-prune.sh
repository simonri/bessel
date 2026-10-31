#!/usr/bin/env bash
# Lists the worktrees under .claude/worktrees and whether each can go: its branch is merged into master, it has no
# uncommitted changes, and no process (a Claude session, a dev server) is working in it.
#
#   scripts/worktree-prune.sh            report only
#   scripts/worktree-prune.sh --remove   also remove the ones that can go, with their local branches
set -euo pipefail

MAIN="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
REMOVE=false
[ "${1:-}" = "--remove" ] && REMOVE=true

git -C "$MAIN" fetch --quiet origin master

in_use() {
  local dir="$1" link
  for link in /proc/[0-9]*/cwd; do
    case "$(readlink "$link" 2>/dev/null)/" in "$dir"/*) return 0 ;; esac
  done
  return 1
}

git -C "$MAIN" worktree list --porcelain | awk '/^worktree /{print substr($0, 10)}' | while IFS= read -r dir; do
  case "$dir" in "$MAIN"/.claude/worktrees/*) ;; *) continue ;; esac
  name="${dir##*/}"
  branch="$(git -C "$dir" branch --show-current 2>/dev/null || true)"
  reasons=()
  if [ -z "$branch" ] || ! git -C "$MAIN" merge-base --is-ancestor "$branch" origin/master 2>/dev/null; then
    reasons+=("not merged")
  fi
  [ -n "$(git -C "$dir" status --porcelain 2>/dev/null)" ] && reasons+=("uncommitted changes")
  in_use "$dir" && reasons+=("in use")

  if [ "${#reasons[@]}" -gt 0 ]; then
    printf 'keep    %-32s %-36s %s\n' "$name" "${branch:-detached}" "$(IFS=,; echo "${reasons[*]}")"
  elif $REMOVE; then
    git -C "$MAIN" worktree unlock "$dir" 2>/dev/null || true
    git -C "$MAIN" worktree remove "$dir"
    git -C "$MAIN" branch -d "$branch" > /dev/null
    printf 'removed %-32s %s\n' "$name" "$branch"
  else
    printf 'can go  %-32s %s\n' "$name" "$branch"
  fi
done
git -C "$MAIN" worktree prune
