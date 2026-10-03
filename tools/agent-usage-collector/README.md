# agent-usage-collector

Scans local Claude Code transcripts (`~/.claude/projects/**/*.jsonl`) for
token usage and calls Anthropic's OAuth usage endpoint for rate limits, then
pushes both to Bessel's `/v1/agent-usage/sync` endpoint. Runs on whichever
machine actually runs Claude Code — Bessel's backend has no access to that
machine's `~/.claude` directory, so this has to be a local push.

## Setup

The desktop app does all of this: Settings → Agent Usage → Install creates an
ingest token for your account, writes the env file and installs the timer. To
set it up by hand instead:

1. Create an ingest token for your account: `POST /v1/ingest-tokens` with
   `{"name": "agent-usage@<machine>"}` while signed in. The token is shown once.
2. `mkdir -p ~/.config/bessel && cp .env.example ~/.config/bessel/agent-usage-collector.env`,
   `chmod 600` it, then fill in `BESSEL_API_BASE_URL` and set
   `BESSEL_INTERNAL_API_KEY` to the token from step 1.
3. Try it once by hand: `uv run collect_agent_usage.py --dry-run` — spot-check
   the printed token totals look right, then drop `--dry-run` to push for real.
4. Install the timer:
   ```sh
   cp agent-usage-collector.service agent-usage-collector.timer ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now agent-usage-collector.timer
   ```
   The service unit's `ExecStart` assumes the repo lives at
   `~/dev/metron` — edit the path first if yours is checked out elsewhere.
5. Check it's running: `systemctl --user status agent-usage-collector.timer`,
   `journalctl --user -u agent-usage-collector`.

## Notes

- Re-sends the last 14 days on every run. Cheap, and self-correcting — the
  Bessel side upserts by (device, agent, date, model), overwriting rather
  than summing, so a resend can never double-count.
- `probe_rate_limits()` has been dry-run against a live Anthropic usage
  payload and correctly parsed `five_hour`/`seven_day_oauth_apps`/`limits[]`
  into session, weekly, and per-model scoped percentages. If Anthropic
  changes this response shape later, `--dry-run` output is the fastest way
  to notice.
