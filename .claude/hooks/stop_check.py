#!/usr/bin/env python3
"""Stop hook: Claude may only stop once scripts/check.sh passes for what its branch changed.

Runs in the session's own checkout (the cwd Claude Code passes in), not in $CLAUDE_PROJECT_DIR, which is the main
checkout when the session works in a worktree. A state that already passed isn't checked again, and after
MAX_BLOCKS blocks in a row the hook lets Claude stop, so a failure it can't fix doesn't trap it.
"""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

MAX_BLOCKS = 3
TIMEOUT_SECONDS = 240
MESSAGE = "scripts/check.sh fails on what this branch changed. Fix it before stopping, or, if the failure isn't yours to fix, say so in your reply."


def git(root: Path, *args: str) -> bytes:
  return subprocess.run(["git", "-C", str(root), *args], capture_output=True, check=True).stdout


def fingerprint(root: Path) -> str:
  digest = hashlib.sha256(git(root, "rev-parse", "HEAD"))
  digest.update(git(root, "diff", "HEAD", "--binary"))
  for name in git(root, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0"):
    path = root / name.decode()
    if name and path.is_file():
      stat = path.stat()
      digest.update(name + f"{stat.st_size}:{stat.st_mtime_ns}".encode())
  return digest.hexdigest()


def main() -> int:
  event = json.load(sys.stdin)
  try:
    root = Path(git(Path(event.get("cwd") or "."), "rev-parse", "--show-toplevel").decode().strip())
    state = Path(git(root, "rev-parse", "--absolute-git-dir").decode().strip())
  except (subprocess.CalledProcessError, FileNotFoundError):
    return 0
  script = root / "scripts" / "check.sh"
  if not script.exists():
    return 0

  passed_file = state / "claude-check-passed"
  blocks_file = state / f"claude-check-blocks-{event.get('session_id', '')}"
  current = fingerprint(root)
  if passed_file.exists() and passed_file.read_text() == current:
    return 0

  try:
    result = subprocess.run([str(script), "--hook"], cwd=root, capture_output=True, text=True, timeout=TIMEOUT_SECONDS)
  except subprocess.TimeoutExpired:
    print(f"scripts/check.sh took over {TIMEOUT_SECONDS}s; not blocking.", file=sys.stderr)
    return 0

  if result.returncode == 0:
    passed_file.write_text(current)
    blocks_file.unlink(missing_ok=True)
    return 0

  blocks = int(blocks_file.read_text()) + 1 if blocks_file.exists() else 1
  if blocks > MAX_BLOCKS:
    blocks_file.unlink(missing_ok=True)
    print(f"scripts/check.sh still fails after {MAX_BLOCKS} tries; letting Claude stop.", file=sys.stderr)
    return 0
  blocks_file.write_text(str(blocks))
  output = (result.stdout + result.stderr).strip().splitlines()
  print(MESSAGE + "\n\n" + "\n".join(output[-80:]), file=sys.stderr)
  return 2


if __name__ == "__main__":
  sys.exit(main())
