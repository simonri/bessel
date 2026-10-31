#!/usr/bin/env python3
"""PreToolUse hook on Bash: refuses the git commands that hurt other sessions or skip review.

- `git stash` / `git stash pop`: the stash is shared by every worktree, so a pop can take another session's
  changes. `git stash push -m <tag>` and `git stash apply <sha>` stay allowed.
- Force pushes: branches are updated by merging master in, never by rewriting what was pushed.
- Pushes to master: changes reach master through a pull request (scripts/land.sh), which runs CI first.
"""

import json
import re
import shlex
import subprocess
import sys

PROTECTED = {"master", "main"}


def current_branch(cwd: str) -> str:
  result = subprocess.run(["git", "-C", cwd, "branch", "--show-current"], capture_output=True, text=True)
  return result.stdout.strip()


def git_args(segment: str) -> list[str] | None:
  try:
    words = shlex.split(segment)
  except ValueError:
    words = segment.split()
  while words and re.fullmatch(r"\w+=.*", words[0]):
    words = words[1:]
  if not words or words[0] != "git":
    return None
  args = words[1:]
  # Skip global options such as -C <dir> and -c <key=value>.
  while args and args[0].startswith("-"):
    args = args[2:] if args[0] in ("-C", "-c") else args[1:]
  return args


def refusal(args: list[str], cwd: str) -> str | None:
  if not args:
    return None
  command, rest = args[0], args[1:]
  if command == "stash" and (not rest or rest[0] == "pop"):
    return "The stash is shared by every worktree. Use a WIP commit, or `git stash push -u -m <tag>` and `git stash apply <sha>`."
  if command == "push":
    refs = [a for a in rest if not a.startswith("-")][1:]
    if any(a == "-f" or a.startswith("--force") for a in rest) or any(ref.startswith("+") for ref in refs):
      return "Force pushes are off. Update the branch by merging origin/master into it, then push normally."
    targets = {ref.split(":")[-1].removeprefix("refs/heads/").lstrip("+") for ref in refs}
    if not refs or "HEAD" in targets:
      targets.add(current_branch(cwd))
    if targets & PROTECTED:
      return "Changes reach master through a pull request: push the branch and land it with scripts/land.sh."
  return None


def main() -> int:
  event = json.load(sys.stdin)
  command = event.get("tool_input", {}).get("command", "")
  cwd = event.get("cwd") or "."
  for segment in re.split(r"&&|\|\||[;|\n]", command):
    args = git_args(segment)
    reason = refusal(args, cwd) if args is not None else None
    if reason:
      print(reason, file=sys.stderr)
      return 2
  return 0


if __name__ == "__main__":
  sys.exit(main())
