# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///
"""Collect Claude Code token usage and rate limits, push them to Bessel.

Runs locally on whichever machine runs Claude Code (the Bessel API has no
access to this machine's ~/.claude directory). Scans the local transcript
files for token usage, probes Anthropic's OAuth usage endpoint for rate
limits, and POSTs both to Bessel's /v1/agent-usage/sync endpoint.

Configuration is via environment variables (see .env.example):
  CLAUDE_CREDENTIALS_PATH   default: ~/.claude/.credentials.json
  CLAUDE_PROJECTS_PATH      default: ~/.claude/projects
  BESSEL_API_BASE_URL       e.g. https://bessel.example.com
  BESSEL_INTERNAL_API_KEY   shared secret, matches the API's INTERNAL_API_KEY
  DEVICE_NAME               default: this machine's hostname

Usage:
  uv run collect_agent_usage.py            # scan, probe, push
  uv run collect_agent_usage.py --dry-run  # scan, probe, print payload only
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

AGENT_ID = "claude-code"
LOOKBACK_DAYS = 14
USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage"


def _env(name: str, default: str = "") -> str:
  return os.environ.get(name, default)


def device_name() -> str:
  return _env("DEVICE_NAME") or socket.gethostname()


def claude_credentials_path() -> Path:
  return Path(_env("CLAUDE_CREDENTIALS_PATH", "~/.claude/.credentials.json")).expanduser()


def claude_projects_path() -> Path:
  return Path(_env("CLAUDE_PROJECTS_PATH", "~/.claude/projects")).expanduser()


def local_date_from_timestamp(raw: Any) -> str:
  if not raw:
    return date.today().isoformat()
  try:
    parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
      parsed = parsed.astimezone()
    return parsed.date().isoformat()
  except (ValueError, TypeError):
    return date.today().isoformat()


def _int(value: Any) -> int:
  try:
    return round(float(value or 0))
  except (TypeError, ValueError):
    return 0


def scan_transcripts(projects_path: Path, cutoff: date) -> dict[tuple[str, str], dict[str, int]]:
  """Sum token usage per (date, model), for local dates >= cutoff.

  Deduped by assistant message id, same as a transcript re-read on the next
  run would need to be — a message only ever contributes once even if it
  appears in more than one scanned line.
  """
  totals: dict[tuple[str, str], dict[str, int]] = {}
  seen: set[str] = set()

  if not projects_path.is_dir():
    return totals

  for path in projects_path.rglob("*.jsonl"):
    try:
      with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_number, line in enumerate(handle, 1):
          if '"usage":' not in line:
            continue
          try:
            entry = json.loads(line)
          except json.JSONDecodeError:
            continue

          message = entry.get("message") if isinstance(entry.get("message"), dict) else {}
          if entry.get("type") != "assistant" and message.get("role") != "assistant":
            continue

          usage = message.get("usage") or entry.get("usage")
          if not isinstance(usage, dict):
            continue

          message_id = message.get("id") or entry.get("uuid") or f"{path}:{line_number}"
          key = str(message_id)
          if key in seen:
            continue
          seen.add(key)

          day = local_date_from_timestamp(entry.get("timestamp") or message.get("timestamp"))
          if day < cutoff.isoformat():
            continue

          model = str(message.get("model") or "claude")
          bucket = totals.setdefault((day, model), {"input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_creation_tokens": 0})
          bucket["input_tokens"] += _int(usage.get("input_tokens"))
          bucket["output_tokens"] += _int(usage.get("output_tokens"))
          bucket["cache_read_tokens"] += _int(usage.get("cache_read_input_tokens"))
          bucket["cache_creation_tokens"] += _int(usage.get("cache_creation_input_tokens"))
    except OSError as exc:
      print(f"agent-usage-collector: skipping unreadable {path}: {exc}", file=sys.stderr)

  return totals


def build_daily_payload(totals: dict[tuple[str, str], dict[str, int]], device: str) -> list[dict[str, Any]]:
  by_date: dict[str, list[dict[str, Any]]] = {}
  for (day, model), tokens in totals.items():
    if not any(tokens.values()):
      # Synthetic/internal messages (model == "<synthetic>") carry a usage
      # block but no real tokens; skip rather than push empty rows.
      continue
    by_date.setdefault(day, []).append({"model": model, **tokens})
  return [{"device": device, "agent": AGENT_ID, "date": day, "models": models} for day, models in sorted(by_date.items())]


def load_access_token(credentials_path: Path) -> str | None:
  try:
    data = json.loads(credentials_path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return None
  login = data.get("claudeAiOauth")
  if not isinstance(login, dict):
    return None
  return login.get("accessToken") or None


def plan_tier(credentials_path: Path) -> str | None:
  try:
    data = json.loads(credentials_path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return None
  login = data.get("claudeAiOauth")
  if not isinstance(login, dict):
    return None
  return login.get("subscriptionType") or None


def _normalize_utilization(value: Any, *, percent_scale: bool) -> float | None:
  try:
    n = float(str(value).strip().replace("%", ""))
  except (TypeError, ValueError):
    return None
  if n < 0:
    return None
  # Anthropic's usage endpoint has been observed reporting both percentages
  # (37.0) and fractions (0.37) across payload versions; any value >= 1 is
  # unambiguously percent-scaled.
  if percent_scale or n > 1:
    return min(100.0, n)
  return min(100.0, n * 100.0)


def probe_rate_limits(access_token: str) -> list[dict[str, Any]]:
  try:
    response = httpx.get(
      USAGE_ENDPOINT,
      headers={"Authorization": f"Bearer {access_token}", "anthropic-beta": "oauth-2025-04-20", "Accept": "application/json"},
      timeout=10,
    )
    response.raise_for_status()
    payload = response.json()
  except httpx.HTTPError as exc:
    print(f"agent-usage-collector: rate-limit probe failed: {exc}", file=sys.stderr)
    return []

  raw_values = []
  session = payload.get("five_hour")
  weekly = payload.get("seven_day_oauth_apps") or payload.get("seven_day")
  if isinstance(session, dict):
    raw_values.append(session.get("utilization"))
  if isinstance(weekly, dict):
    raw_values.append(weekly.get("utilization"))
  scoped = payload.get("limits") if isinstance(payload.get("limits"), list) else []
  raw_values += [entry.get("percent") for entry in scoped if isinstance(entry, dict)]
  percent_scale = any(_looks_like_percent(v) for v in raw_values)

  limits: list[dict[str, Any]] = []
  if isinstance(session, dict):
    pct = _normalize_utilization(session.get("utilization"), percent_scale=percent_scale)
    if pct is not None:
      limits.append({"window_label": "session_5h", "utilization_pct": pct, "resets_at": session.get("resets_at")})
  if isinstance(weekly, dict):
    pct = _normalize_utilization(weekly.get("utilization"), percent_scale=percent_scale)
    if pct is not None:
      limits.append({"window_label": "week", "utilization_pct": pct, "resets_at": weekly.get("resets_at")})
  for entry in scoped:
    if not isinstance(entry, dict):
      continue
    model_scope = entry.get("scope", {}).get("model") if isinstance(entry.get("scope"), dict) else None
    model_name = (model_scope or {}).get("id") or (model_scope or {}).get("display_name") if isinstance(model_scope, dict) else None
    kind = str(entry.get("kind") or "")
    pct = _normalize_utilization(entry.get("percent"), percent_scale=percent_scale)
    if pct is None or not model_name:
      continue
    label = f"{model_name}_{kind}".strip("_")
    limits.append({"window_label": label[:50], "utilization_pct": pct, "resets_at": entry.get("resets_at")})

  return limits


def _looks_like_percent(value: Any) -> bool:
  try:
    return float(str(value).strip().replace("%", "")) >= 1
  except (TypeError, ValueError):
    return False


def build_rate_limit_payload(limits: list[dict[str, Any]], device: str, tier: str | None) -> list[dict[str, Any]]:
  return [
    {
      "device": device,
      "agent": AGENT_ID,
      "window_label": limit["window_label"],
      "utilization_pct": limit["utilization_pct"],
      "resets_at": limit.get("resets_at"),
      "tier": tier,
    }
    for limit in limits
  ]


def push(base_url: str, api_key: str, daily: list[dict[str, Any]], rate_limits: list[dict[str, Any]]) -> None:
  response = httpx.post(
    f"{base_url.rstrip('/')}/v1/agent-usage/sync",
    json={"daily": daily, "rate_limits": rate_limits},
    headers={"X-Api-Key": api_key},
    timeout=30,
  )
  response.raise_for_status()
  print(f"agent-usage-collector: {response.json()}")


def main() -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--dry-run", action="store_true", help="print the payload instead of pushing it")
  args = parser.parse_args()

  device = device_name()
  cutoff = (datetime.now(UTC) - timedelta(days=LOOKBACK_DAYS)).date()

  totals = scan_transcripts(claude_projects_path(), cutoff)
  daily = build_daily_payload(totals, device)

  access_token = load_access_token(claude_credentials_path())
  rate_limits: list[dict[str, Any]] = []
  if access_token:
    limits = probe_rate_limits(access_token)
    rate_limits = build_rate_limit_payload(limits, device, plan_tier(claude_credentials_path()))
  else:
    print("agent-usage-collector: no Claude credentials found, skipping rate-limit probe", file=sys.stderr)

  if args.dry_run:
    print(json.dumps({"daily": daily, "rate_limits": rate_limits}, indent=2))
    return 0

  base_url = _env("BESSEL_API_BASE_URL")
  api_key = _env("BESSEL_INTERNAL_API_KEY")
  if not base_url or not api_key:
    print("agent-usage-collector: BESSEL_API_BASE_URL and BESSEL_INTERNAL_API_KEY must both be set", file=sys.stderr)
    return 1

  if not daily and not rate_limits:
    print("agent-usage-collector: nothing to push")
    return 0

  try:
    push(base_url, api_key, daily, rate_limits)
  except httpx.HTTPError as exc:
    print(f"agent-usage-collector: push failed: {exc}", file=sys.stderr)
    return 1
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
