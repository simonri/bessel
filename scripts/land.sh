#!/usr/bin/env bash
# Lands this branch on master, one branch at a time: merges origin/master in, runs the full checks, pushes, waits
# for the pull request's CI, merges it and waits for the deploy. Run it only when asked to merge.
#
#   scripts/land.sh    opens the pull request if there is none (title and body from the commits)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
GH="$(command -v /usr/bin/gh || command -v gh)"

BRANCH="$(git branch --show-current)"
case "$BRANCH" in
  "" | master | main) echo "Land from a feature branch, not '${BRANCH:-a detached HEAD}'." >&2; exit 1 ;;
esac
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or discard your changes first:" >&2
  git status --short >&2
  exit 1
fi

step() { printf '\n== %s\n' "$*"; }

catch_up() {
  git fetch --quiet origin master
  if git merge-base --is-ancestor origin/master HEAD; then
    return 1
  fi
  step "Merging origin/master into $BRANCH"
  if ! git merge --no-edit origin/master; then
    echo "Merge conflicts. Resolve them (regenerate clients with 'make clients' rather than merging them by hand;" >&2
    echo "point a new migration's down_revision at master's head), commit, and run scripts/land.sh again." >&2
    exit 1
  fi
  return 0
}

catch_up || true
step "Full checks"
scripts/check.sh --full

step "Pushing $BRANCH"
git push --quiet -u origin HEAD

if ! "$GH" pr view --json number > /dev/null 2>&1; then
  step "Opening a pull request"
  "$GH" pr create --base master --fill
fi
PR="$("$GH" pr view --json number --jq .number)"

while true; do
  step "Waiting for CI on #$PR"
  sleep 10
  "$GH" pr checks "$PR" --watch --fail-fast || { echo "CI failed on #$PR." >&2; exit 1; }
  # Master moved while CI ran: test the combination, not each half.
  if catch_up; then
    scripts/check.sh --full
    git push --quiet origin HEAD
    continue
  fi
  break
done

step "Merging #$PR"
"$GH" pr merge "$PR" --merge
SHA="$("$GH" pr view "$PR" --json mergeCommit --jq .mergeCommit.oid)"

step "Waiting for the deploy of ${SHA:0:7}"
RUN=""
for _ in $(seq 30); do
  RUN="$("$GH" run list --workflow deploy.yml --commit "$SHA" --json databaseId --jq '.[0].databaseId // empty')"
  [ -n "$RUN" ] && break
  sleep 10
done
if [ -z "$RUN" ]; then
  echo "No deploy started for ${SHA:0:7} (nothing it deploys changed)."
  exit 0
fi
if ! "$GH" run watch "$RUN" --exit-status > /dev/null; then
  echo "Deploy $RUN failed: $("$GH" run view "$RUN" --json url --jq .url)" >&2
  echo "Rerun it ('gh run rerun $RUN --failed') rather than fixing forward: a later push only deploys what it changed." >&2
  exit 1
fi
echo "Landed #$PR as ${SHA:0:7} and deployed."
