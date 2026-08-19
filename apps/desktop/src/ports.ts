import { execFile } from "child_process";
import fs from "fs";
import { promisify } from "util";
import { ipcHandle } from "./ipc.js";

const execFileAsync = promisify(execFile);

export interface PortEntry {
  port: number;
  address: string;
  pid: number;
  processName: string;
  cmdline: string;
  cwd: string | null;
  ageSeconds: number | null;
}

// Matched against the process's own name (ss's/proc's "comm", e.g. "node",
// "electron", "chrome") — never the full cmdline, which can legitimately
// contain these words as part of a dev project's own path or args (a repo
// checked out under ~/dev/chrome-extension/, an Electron app's own dev
// server). "bessel"/"electron" excludes this app's own listening ports —
// this list is for desktop/GUI/system processes that happen to hold a
// listening socket, not anything the user would come here to kill.
const NOISE_PATTERNS =
  /^(bessel|electron|chrome|chromium|code|code-oss|firefox|dropbox|spotify|slack|discord|steam|1password|bitwarden|gnome-|systemd|pulseaudio|pipewire|cupsd|sshd|Xwayland|Hyprland)/i;

let lastKnownPids = new Set<number>();

function isNoise(processName: string): boolean {
  return NOISE_PATTERNS.test(processName);
}

async function readCwd(pid: number): Promise<string | null> {
  try {
    return await fs.promises.readlink(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}

async function readCmdline(pid: number): Promise<string> {
  try {
    const raw = await fs.promises.readFile(`/proc/${pid}/cmdline`, "utf8");
    return raw.split("\0").filter(Boolean).join(" ");
  } catch {
    return "";
  }
}

async function readAges(pids: number[]): Promise<Map<number, number>> {
  const ages = new Map<number, number>();
  if (pids.length === 0) return ages;
  try {
    const { stdout } = await execFileAsync("ps", [
      "-o",
      "pid=,etimes=",
      "-p",
      pids.join(","),
    ]);
    for (const line of stdout.trim().split("\n")) {
      const [pidStr, etimeStr] = line.trim().split(/\s+/);
      const pid = Number(pidStr);
      const ageSeconds = Number(etimeStr);
      if (Number.isFinite(pid) && Number.isFinite(ageSeconds))
        ages.set(pid, ageSeconds);
    }
  } catch {}
  return ages;
}

// `ss -H -tlnp` output, one listening socket per line:
//   LISTEN 0 2048 0.0.0.0:8100 0.0.0.0:* users:(("python3",pid=43837,fd=4),("uvicorn",pid=43835,fd=4))
// Unprivileged `ss` only resolves the `users:(...)` process column for
// sockets owned by the invoking user — every other user's/root's listeners
// show no process info at all, which doubles as exactly the "relevant to
// me" filter this feature wants, for free.
const SS_LINE_RE =
  /^LISTEN\s+\S+\s+\S+\s+(\S+)\s+\S+(?:\s+users:\((.+)\))?\s*$/;
const USER_ENTRY_RE = /\("([^"]+)",pid=(\d+),fd=\d+\)/g;

async function listLinux(): Promise<PortEntry[]> {
  const { stdout } = await execFileAsync("ss", ["-H", "-tlnp"]);

  const rows: { port: number; address: string; pid: number; processName: string }[] =
    [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const match = line.match(SS_LINE_RE);
    if (!match) continue;
    const [, localAddr, usersGroup] = match;
    if (!usersGroup) continue;
    const sepIdx = localAddr.lastIndexOf(":");
    if (sepIdx === -1) continue;
    const port = Number(localAddr.slice(sepIdx + 1));
    if (!Number.isFinite(port)) continue;
    const address = localAddr.slice(0, sepIdx);
    for (const [, processName, pidStr] of usersGroup.matchAll(USER_ENTRY_RE)) {
      rows.push({ port, address, pid: Number(pidStr), processName });
    }
  }

  const relevant = rows.filter((r) => !isNoise(r.processName));
  const ages = await readAges(Array.from(new Set(relevant.map((r) => r.pid))));

  const entries = await Promise.all(
    relevant.map(async (r) => ({
      port: r.port,
      address: r.address,
      pid: r.pid,
      processName: r.processName,
      cmdline: await readCmdline(r.pid),
      cwd: await readCwd(r.pid),
      ageSeconds: ages.get(r.pid) ?? null,
    })),
  );
  entries.sort((a, b) => a.port - b.port);
  return entries;
}

export function registerPortsHandlers(): void {
  ipcHandle("ports:list", async () => {
    if (process.platform !== "linux") {
      lastKnownPids = new Set();
      return { supported: false, entries: [] as PortEntry[] };
    }
    const entries = await listLinux();
    lastKnownPids = new Set(entries.map((e) => e.pid));
    return { supported: true, entries };
  });

  // Only a PID this very session just listed as a listening process can be
  // killed — ipcHandle authenticates the sender's origin, not the payload,
  // so without this an untrusted payload could otherwise ask to SIGTERM any
  // process this user owns (systemd --user, the app itself, ...).
  ipcHandle("ports:kill", async (_, pid: unknown) => {
    if (typeof pid !== "number" || !lastKnownPids.has(pid)) {
      throw new Error(
        `PID ${pid} is not a currently listed listening process`,
      );
    }
    try {
      process.kill(pid, "SIGTERM");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
    }
  });
}
