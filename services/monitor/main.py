#!/usr/bin/env python3
"""
metron-monitor — log the focused window and active/idle state.

Writes one row per *change* plus a heartbeat every 5 minutes so that gaps
from crashes or suspend don't inflate timings in reports.

Usage:
    ./main.py                            # start tracking
    ./main.py --push                     # sync unsynced events to the API
    ./main.py --push --reset-cursor      # re-push all events from the start (safe, server dedupes)
    ./main.py --push --source work-mac   # override machine identifier
    ./main.py --report                   # today's time-per-app summary
    ./main.py --report --date 2026-06-10 # another day
    ./main.py --dump                     # all events as CSV (for analysis)
    ./main.py --dump --date 2026-06-10   # single-day CSV
"""

import argparse
import csv
import json
import os
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from wayland_idle import InputIdle, WaylandError

# ─── config ──────────────────────────────────────────────────────────────────
POLL_SECONDS = 2
IDLE_THRESHOLD_SECS = 60

# Write events even when state is unchanged so crash/suspend gaps are bounded.
# Any inter-event gap > HEARTBEAT_SECS * 2 in reports is capped to exclude
# time when the tracker wasn't running.
HEARTBEAT_SECS = 300

# On Hyprland/Sway the tracker asks the compositor for input-only idle
# notifications (see wayland_idle.py). Where that isn't offered it runs its own
# swayidle, which writes the epoch second inactivity began to this file and
# removes it on input. swayidle honours idle inhibitors, so there a playing
# video keeps the user active.
IDLE_FILE = Path("/tmp/activity-tracker-idle")
LOCK_CHECK_SECS = 10
IDLE_RESTART_SECS = 30
STATUS_CHECK_SECS = 30

DATA_DIR = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "activity-tracker"
DB_PATH = DATA_DIR / "activity.db"
CURSOR_PATH = DATA_DIR / "push_cursor"
# Read by the desktop app's Settings → Monitor page.
STATUS_PATH = DATA_DIR / "status.json"
_SCHEMA_VERSION = 2

METRON_API_URL = os.environ.get("METRON_API_URL", "http://localhost:8100")
METRON_INTERNAL_API_KEY = os.environ.get("METRON_INTERNAL_API_KEY", "")
PUSH_BATCH_SIZE = 500
# Cloudflare's Browser Integrity Check rejects urllib's default User-Agent (1010).
USER_AGENT = "bessel-monitor/0.1"
# ─────────────────────────────────────────────────────────────────────────────

_running = True


def _stop(*_):
    global _running
    _running = False


def _run(cmd):
    """Run a command; return stripped stdout or None on any failure."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        return r.stdout.strip() if r.returncode == 0 else None
    except (subprocess.SubprocessError, OSError):
        return None


# ─── backend detection ───────────────────────────────────────────────────────

def detect_backend():
    if os.environ.get("HYPRLAND_INSTANCE_SIGNATURE"):
        return "hyprland"
    if os.environ.get("SWAYSOCK"):
        return "sway"
    session = os.environ.get("XDG_SESSION_TYPE", "")
    desktop = os.environ.get("XDG_CURRENT_DESKTOP", "").lower()
    if session == "wayland" and "gnome" in desktop:
        return "gnome-wayland"
    if session == "x11" or os.environ.get("DISPLAY"):
        return "x11"
    return "unknown"


# ─── window info ─────────────────────────────────────────────────────────────

def _window_x11():
    wid = _run(["xdotool", "getactivewindow"])
    if not wid:
        return None, None, None
    title = _run(["xdotool", "getwindowname", wid]) or ""
    cls = ""
    wmclass = _run(["xprop", "-id", wid, "WM_CLASS"])
    if wmclass and "=" in wmclass:
        # WM_CLASS(STRING) = "instance", "Class"
        cls = wmclass.split("=", 1)[1].strip().strip('"').split('", "')[-1].strip('"')
    return title, cls, None


def _window_hyprland():
    out = _run(["hyprctl", "activewindow", "-j"])
    if not out:
        return None, None, None
    try:
        d = json.loads(out)
    except json.JSONDecodeError:
        return None, None, None
    if "error" in d:
        return "", "", None  # no focused window (empty workspace)
    ws = d.get("workspace") or {}
    workspace = ws.get("name") or (str(ws["id"]) if ws.get("id") else None)
    return d.get("title", ""), d.get("class", ""), workspace


def _window_sway():
    out = _run(["swaymsg", "-t", "get_tree"])
    if not out:
        return None, None, None
    try:
        tree = json.loads(out)
    except json.JSONDecodeError:
        return None, None, None

    found = {}

    def walk(node):
        if node.get("focused") and node.get("type") in ("con", "floating_con"):
            found["n"] = node
        for child in node.get("nodes", []) + node.get("floating_nodes", []):
            walk(child)

    walk(tree)
    n = found.get("n")
    if not n:
        return None, None, None
    title = n.get("name") or ""
    cls = n.get("app_id") or (n.get("window_properties") or {}).get("class") or ""
    return title, cls, None


# ─── idle detection ──────────────────────────────────────────────────────────

def _idle_secs_x11():
    out = _run(["xprintidle"])
    return int(out) / 1000 if (out and out.isdigit()) else None


def _idle_secs_gnome():
    # GetIdletime returns milliseconds
    out = _run([
        "gdbus", "call", "--session",
        "--dest", "org.gnome.Mutter.IdleMonitor",
        "--object-path", "/org/gnome/Mutter/IdleMonitor/Core",
        "--method", "org.gnome.Mutter.IdleMonitor.GetIdletime",
    ])
    if out:
        digits = "".join(c for c in out if c.isdigit())
        if digits:
            return int(digits) / 1000
    return None


def _screen_locked():
    if shutil.which("omarchy-shell"):
        return _run(["omarchy-shell", "-q", "lock", "isLocked"]) == "true"
    return _run(["pidof", "hyprlock"]) is not None


class WaylandIdle:
    """Idle signal on Hyprland/Sway that doesn't depend on the desktop shell.

    Prefers the compositor's input-only idle notifications, which ignore idle
    inhibitors (videos, wake locks). Falls back to its own swayidle writing
    IDLE_FILE. Either is restarted if it dies, and a locked screen counts as
    idle straight away.
    """

    def __init__(self):
        self._input_idle = None
        self._proc = None
        self._restart_at = 0.0
        self._locked = False
        self._lock_checked_at = float("-inf")

    def start(self):
        try:
            self._input_idle = InputIdle.connect(IDLE_THRESHOLD_SECS)
            return
        except (OSError, WaylandError) as err:
            print(f"metron-monitor  input-only idle unavailable ({err}); using swayidle", file=sys.stderr, flush=True)
        if shutil.which("swayidle") is None:
            self._restart_at = time.monotonic() + IDLE_RESTART_SECS
            return
        IDLE_FILE.unlink(missing_ok=True)
        # Backdate by the threshold: swayidle only fires after it has elapsed.
        on_idle = f"echo $(($(date +%s) - {IDLE_THRESHOLD_SECS})) > {IDLE_FILE}"
        self._proc = subprocess.Popen(
            ["swayidle", "-w", "timeout", str(IDLE_THRESHOLD_SECS), on_idle, "resume", f"rm -f {IDLE_FILE}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def stop(self):
        if self._input_idle is not None:
            self._input_idle.close()
            self._input_idle = None
        if self._proc is not None and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        self._proc = None
        IDLE_FILE.unlink(missing_ok=True)

    def _supervise(self):
        if self._input_idle is not None and not self._input_idle.alive:
            # The compositor went away (restart, logout); reconnect shortly.
            self._input_idle = None
            self._restart_at = time.monotonic() + IDLE_RESTART_SECS
            print("metron-monitor  lost the compositor's idle notifications; reconnecting shortly", file=sys.stderr, flush=True)
        if self._proc is not None and self._proc.poll() is not None:
            # A file left behind by a dead swayidle would report idle forever.
            IDLE_FILE.unlink(missing_ok=True)
            self._proc = None
            self._restart_at = time.monotonic() + IDLE_RESTART_SECS
            print("metron-monitor  swayidle exited; restarting shortly", file=sys.stderr, flush=True)
        if self._input_idle is None and self._proc is None and time.monotonic() >= self._restart_at:
            self.start()

    @property
    def source(self):
        if self._input_idle is not None and self._input_idle.alive:
            return "Wayland input"
        if self._proc is not None and self._proc.poll() is None:
            return "swayidle"
        if _run(["pidof", "hypridle"]) is not None:
            return "hypridle"
        return None

    @property
    def lock_source(self):
        if shutil.which("omarchy-shell"):
            return "omarchy-shell"
        if shutil.which("hyprlock"):
            return "hyprlock"
        return None

    def is_idle(self):
        self._supervise()
        if self._input_idle is not None and self._input_idle.idle:
            return True
        try:
            since = int(IDLE_FILE.read_text().strip())
            if time.time() - since >= IDLE_THRESHOLD_SECS:
                return True
        except (FileNotFoundError, ValueError):
            pass
        now = time.monotonic()
        if now - self._lock_checked_at >= LOCK_CHECK_SECS:
            self._lock_checked_at = now
            self._locked = _screen_locked()
        return self._locked


def _idle_status(backend, wayland_idle):
    if wayland_idle is not None:
        source = wayland_idle.source
        warning = None if source else "No idle detection: swayidle isn't installed, so all time is recorded as active."
        return {"idle_source": source, "lock_source": wayland_idle.lock_source, "warning": warning}
    if backend == "x11":
        ok = shutil.which("xprintidle") is not None
        return {
            "idle_source": "xprintidle" if ok else None,
            "lock_source": None,
            "warning": None if ok else "No idle detection: xprintidle isn't installed, so all time is recorded as active.",
        }
    return {"idle_source": "gnome-mutter", "lock_source": None, "warning": None}


def _write_status(status):
    payload = {**status, "updated_at": datetime.now(timezone.utc).isoformat()}
    tmp = STATUS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload))
    tmp.replace(STATUS_PATH)


# ─── sampler ─────────────────────────────────────────────────────────────────

def make_sampler(backend, wayland_idle):
    _win = {
        "x11": _window_x11,
        "hyprland": _window_hyprland,
        "sway": _window_sway,
    }.get(backend, lambda: (None, None, None))

    def _is_idle():
        if backend == "x11":
            secs = _idle_secs_x11()
            return secs is not None and secs >= IDLE_THRESHOLD_SECS
        if backend == "gnome-wayland":
            secs = _idle_secs_gnome()
            return secs is not None and secs >= IDLE_THRESHOLD_SECS
        return wayland_idle.is_idle()

    def sample():
        title, cls, workspace = _win()
        return title, cls, workspace, _is_idle()

    return sample


# ─── database ────────────────────────────────────────────────────────────────

def _open_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    _migrate(conn)
    return conn


def _migrate(conn):
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    if version >= _SCHEMA_VERSION:
        return

    has_table = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='events'"
    ).fetchone()

    if not has_table:
        conn.execute("""
            CREATE TABLE events (
                id        INTEGER PRIMARY KEY,
                ts        INTEGER NOT NULL,   -- Unix epoch seconds (UTC)
                state     TEXT    NOT NULL,   -- 'active' or 'idle'
                app_class TEXT,               -- window class / app identifier
                title     TEXT,               -- window title (raw, full)
                workspace TEXT               -- workspace name or number
            )
        """)
        conn.execute("CREATE INDEX events_ts ON events(ts)")
    else:
        # v1 schema: ts was ISO8601 TEXT, no workspace column; migrate in place.
        print("metron-monitor: upgrading database schema …", file=sys.stderr)
        conn.execute("ALTER TABLE events RENAME TO _events_old")
        conn.execute("""
            CREATE TABLE events (
                id        INTEGER PRIMARY KEY,
                ts        INTEGER NOT NULL,
                state     TEXT    NOT NULL,
                app_class TEXT,
                title     TEXT,
                workspace TEXT
            )
        """)
        conn.execute("CREATE INDEX events_ts ON events(ts)")
        # strftime('%s', ts) handles ISO8601 with timezone offset correctly.
        conn.execute("""
            INSERT INTO events (ts, state, app_class, title, workspace)
            SELECT
                COALESCE(CAST(strftime('%s', ts) AS INTEGER), 0),
                state, app_class, title, NULL
            FROM _events_old
        """)
        conn.execute("DROP TABLE _events_old")
        print("metron-monitor: upgrade complete.", file=sys.stderr)

    conn.execute(f"PRAGMA user_version = {_SCHEMA_VERSION}")
    conn.commit()


# ─── tracking loop ───────────────────────────────────────────────────────────

def _auto_push_loop(source: str) -> None:
    """Background thread: push to API every HEARTBEAT_SECS while tracking."""
    while _running:
        time.sleep(HEARTBEAT_SECS)
        if not _running:
            break
        try:
            cursor = _read_cursor()
            inserted, skipped, _ = _do_push(source, cursor)
            if inserted:
                print(f"metron-monitor  auto-push inserted={inserted} skipped={skipped}", flush=True)
        except Exception as e:
            print(f"metron-monitor  auto-push failed: {e}", file=sys.stderr, flush=True)


def track(source: str) -> None:
    backend = detect_backend()
    if backend == "unknown":
        sys.exit("Cannot detect display server — set DISPLAY or Wayland env vars.")
    conn = _open_db()
    wayland_idle = WaylandIdle() if backend in ("hyprland", "sway") else None
    if wayland_idle is not None:
        wayland_idle.start()
    sample = make_sampler(backend, wayland_idle)

    status = _idle_status(backend, wayland_idle)
    _write_status(status)
    print(
        f"metron-monitor  backend={backend}  idle={status['idle_source']}  lock={status['lock_source']}  db={DB_PATH}  source={source}",
        flush=True,
    )
    if status["warning"]:
        print(f"metron-monitor  WARNING: {status['warning']}", file=sys.stderr, flush=True)
    status_checked_at = time.monotonic()

    t = threading.Thread(target=_auto_push_loop, args=(source,), daemon=True)
    t.start()

    last_key = None
    last_write_ts = 0
    try:
        while _running:
            title, cls, workspace, idle = sample()
            state = "idle" if idle else "active"
            key = (state, cls, title, workspace)
            now = int(time.time())
            if key != last_key or now - last_write_ts >= HEARTBEAT_SECS:
                conn.execute(
                    "INSERT INTO events (ts, state, app_class, title, workspace) VALUES (?,?,?,?,?)",
                    (now, state, cls, title, workspace),
                )
                conn.commit()
                last_key = key
                last_write_ts = now
            if time.monotonic() - status_checked_at >= STATUS_CHECK_SECS:
                status_checked_at = time.monotonic()
                new_status = _idle_status(backend, wayland_idle)
                if new_status != status:
                    status = new_status
                    _write_status(status)
                    if status["warning"]:
                        print(f"metron-monitor  WARNING: {status['warning']}", file=sys.stderr, flush=True)
            time.sleep(POLL_SECONDS)
    finally:
        if wayland_idle is not None:
            wayland_idle.stop()
        conn.close()


# ─── reporting ───────────────────────────────────────────────────────────────

def _day_bounds(d: date) -> tuple[int, int]:
    """Return (start, end) as UTC epoch seconds for a local calendar day."""
    local_tz = datetime.now().astimezone().tzinfo
    start = datetime(d.year, d.month, d.day, tzinfo=local_tz)
    return int(start.timestamp()), int((start + timedelta(days=1)).timestamp())


def _fmt_dur(secs: float) -> str:
    m = int(secs) // 60
    return f"{m // 60}h {m % 60:02d}m" if m >= 60 else f"{m}m"


def report(target: date):
    if not DB_PATH.exists():
        sys.exit("No data yet — run without --report to start tracking.")

    start_ts, end_ts = _day_bounds(target)
    conn = _open_db()
    with conn:
        rows = conn.execute(
            "SELECT ts, state, app_class, title, workspace "
            "FROM events WHERE ts >= ? AND ts < ? ORDER BY ts",
            (start_ts, end_ts),
        ).fetchall()

    if not rows:
        sys.exit(f"No data for {target}.")

    # Last-segment end: today → now, past day → end of that day.
    tail_ts = min(int(time.time()), end_ts) if target == date.today() else end_ts

    totals: dict[str, float] = defaultdict(float)
    active_total = 0.0
    max_seg = HEARTBEAT_SECS * 2  # cap gaps from tracker not running

    for i, (ts, state, cls, *_) in enumerate(rows):
        nxt_ts = rows[i + 1][0] if i + 1 < len(rows) else tail_ts
        dur = min(nxt_ts - ts, max_seg)
        if state == "active" and dur > 0:
            totals[cls or "(unknown)"] += dur
            active_total += dur

    if not totals:
        sys.exit(f"No active time recorded for {target}.")

    sorted_apps = sorted(totals.items(), key=lambda x: -x[1])
    label_width = max(len(k) for k, _ in sorted_apps)
    print(f"Active time on {target}  —  {_fmt_dur(active_total)}\n")
    for label, sec in sorted_apps:
        pct = sec / active_total * 100
        bar = "█" * int(pct / 2.5)  # 40 chars = 100 %
        print(f"  {label:<{label_width}}  {_fmt_dur(sec):>8}  {pct:5.1f}%  {bar}")


# ─── CSV dump ────────────────────────────────────────────────────────────────

def dump(target: date | None):
    """Write raw events as CSV to stdout for external analysis."""
    if not DB_PATH.exists():
        sys.exit("No data yet.")

    conn = _open_db()
    with conn:
        if target is not None:
            start_ts, end_ts = _day_bounds(target)
            rows = conn.execute(
                "SELECT ts, state, app_class, title, workspace "
                "FROM events WHERE ts >= ? AND ts < ? ORDER BY ts",
                (start_ts, end_ts),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT ts, state, app_class, title, workspace FROM events ORDER BY ts"
            ).fetchall()

    writer = csv.writer(sys.stdout)
    writer.writerow(["ts_unix", "ts_iso", "state", "app_class", "title", "workspace"])
    for ts, state, cls, title, ws in rows:
        iso = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        writer.writerow([ts, iso, state, cls or "", title or "", ws or ""])


# ─── push ────────────────────────────────────────────────────────────────────

def _read_cursor() -> int:
    try:
        return int(CURSOR_PATH.read_text().strip())
    except (FileNotFoundError, ValueError):
        return 0


def _write_cursor(value: int) -> None:
    CURSOR_PATH.write_text(str(value))


def _do_push(source: str, cursor: int) -> tuple[int, int, int]:
    """Push events since cursor to the API. Returns (inserted, skipped, new_cursor).
    Raises OSError / urllib.error.URLError on network failure, RuntimeError on API error.
    """
    conn = _open_db()
    total_inserted = 0
    total_skipped = 0

    try:
        while True:
            rows = conn.execute(
                "SELECT id, ts, state, app_class, title, workspace "
                "FROM events WHERE id > ? ORDER BY id LIMIT ?",
                (cursor, PUSH_BATCH_SIZE),
            ).fetchall()

            if not rows:
                break

            events = []
            for row in rows:
                ts = row[1]
                if isinstance(ts, str):
                    ts = int(datetime.fromisoformat(ts).timestamp())
                events.append({
                    "local_id": row[0],
                    "ts": ts,
                    "state": row[2],
                    "app_class": row[3],
                    "title": row[4],
                    "workspace": row[5],
                })

            payload = json.dumps({"source": source, "events": events}).encode()
            headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT}
            if METRON_INTERNAL_API_KEY:
                headers["X-API-Key"] = METRON_INTERNAL_API_KEY
            req = urllib.request.Request(
                f"{METRON_API_URL}/v1/activity/batch",
                data=payload,
                headers=headers,
                method="POST",
            )

            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    body = json.loads(resp.read())
            except urllib.error.HTTPError as e:
                raise RuntimeError(f"API error {e.code}: {e.read().decode()}") from e
            except (urllib.error.URLError, OSError) as e:
                raise OSError(f"Failed to reach API at {METRON_API_URL}: {e}") from e

            total_inserted += body["inserted"]
            total_skipped += body["skipped"]
            cursor = rows[-1][0]
            _write_cursor(cursor)
    finally:
        conn.close()

    return total_inserted, total_skipped, cursor


def push(source: str, reset_cursor: bool) -> None:
    if not DB_PATH.exists():
        sys.exit("No data yet — run without --push to start tracking.")

    cursor = 0 if reset_cursor else _read_cursor()
    try:
        inserted, skipped, cursor = _do_push(source, cursor)
    except (RuntimeError, OSError) as e:
        sys.exit(str(e))

    print(
        f"Push complete — inserted={inserted} skipped={skipped} cursor={cursor}",
        flush=True,
    )


# ─── entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Track focused window and active/idle state.")
    ap.add_argument("--push", action="store_true", help="sync unsynced events to the Metron API")
    ap.add_argument("--reset-cursor", action="store_true", help="re-push all events from the start (safe, server dedupes)")
    ap.add_argument("--source", metavar="NAME", default=socket.gethostname(),
                    help="machine identifier (default: hostname); used for tracking auto-push and --push")
    ap.add_argument("--report", action="store_true", help="print time-per-app summary and exit")
    ap.add_argument("--dump",   action="store_true", help="write raw events as CSV to stdout")
    ap.add_argument("--date", metavar="YYYY-MM-DD",
                    help="target date for --report / --dump (default: today)")
    args = ap.parse_args()

    if args.push:
        if args.date:
            ap.error("--date does not apply to --push")
        push(source=args.source, reset_cursor=args.reset_cursor)
    elif args.report or args.dump:
        if args.date:
            try:
                target_date = date.fromisoformat(args.date)
            except ValueError:
                ap.error(f"invalid date {args.date!r} — expected YYYY-MM-DD")
        else:
            target_date = date.today()
        if args.report:
            report(target_date)
        else:
            dump(target_date if args.date else None)
    else:
        if args.date or args.reset_cursor:
            ap.error("--date / --reset-cursor only apply to --report, --dump, or --push")
        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)
        track(source=args.source)
