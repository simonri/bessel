import { execFile } from "child_process";
import { app } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { ipcHandle } from "./ipc.js";

const execFileAsync = promisify(execFile);

// Bessel's backend runs on a VPS with no access to the user's machine, so
// these two background jobs — the activity monitor and the agent usage
// collector — run locally via systemd --user units. Both units are shipped
// two ways: checked into the repo (for `make install` on a dev checkout) and
// bundled as Electron extraResources (for a genuine downloaded app with no
// repo present). Either way, systemd needs the actual script content at a
// path that outlives the process that installed it — an AppImage mounts at
// an ephemeral /tmp/.mount_* path that only exists while that one launch is
// running, so a unit can never reference resourcesPath directly. Both install
// paths converge on copying the payload to this stable, non-versioned
// location first, and the checked-in unit files' ExecStart= lines point here.
const SYSTEMD_USER_DIR = path.join(os.homedir(), ".config", "systemd", "user");
const PAYLOAD_ROOT = path.join(os.homedir(), ".local", "share", "bessel");
const CONFIG_ROOT = path.join(os.homedir(), ".config", "bessel");
const DEFAULT_API_BASE_URL = "https://api.getbessel.com";
// The API used to be reachable only over Tailscale. Env files written back
// then still point there, so installs repoint them at the public host.
const RETIRED_API_BASE_URLS = new Set(["https://vps.tailca3fd9.ts.net"]);
const LEGACY_MONITOR_ENV = path.join(
  os.homedir(),
  ".config",
  "metron",
  "monitor.env",
);
const COLLECTOR_ENV = path.join(CONFIG_ROOT, "agent-usage-collector.env");

interface UnitStatusResult {
  installed: boolean;
  active: boolean;
  enabled: boolean;
  failed: boolean;
  state: string;
}

async function querySystemctl(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["--user", ...args]);
    return stdout.trim();
  } catch (err: unknown) {
    return ((err as { stdout?: string }).stdout ?? "").trim();
  }
}

// Written by the running monitor (services/monitor/main.py STATUS_PATH).
const MONITOR_STATUS_FILE = path.join(
  process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
  "activity-tracker",
  "status.json",
);

function readMonitorIdleStatus(): {
  idle_source: string | null;
  warning: string | null;
} | null {
  try {
    return JSON.parse(fs.readFileSync(MONITOR_STATUS_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function queryUnitStatus(unitName: string): Promise<UnitStatusResult> {
  const unitFile = path.join(SYSTEMD_USER_DIR, unitName);
  if (!fs.existsSync(unitFile)) {
    return {
      installed: false,
      active: false,
      enabled: false,
      failed: false,
      state: "not-found",
    };
  }
  const state = await querySystemctl("is-active", unitName);
  const enabledStr = await querySystemctl("is-enabled", unitName);
  return {
    installed: true,
    active: state === "active",
    failed: state === "failed",
    enabled: enabledStr === "enabled",
    state,
  };
}

// systemd --user units run without the interactive shell's PATH, so a bare
// `uv` in ExecStart= resolves nothing (mise shims, ~/.local/bin, etc. aren't
// visible) — the units hardcode an absolute interpreter path. Check it
// actually exists at install time rather than letting the unit fail silently
// in the background the first time it fires.
function assertUvAvailable(): void {
  const candidates = [
    path.join(os.homedir(), ".local", "bin", "uv"),
    path.join(os.homedir(), ".local", "share", "mise", "shims", "uv"),
  ];
  if (candidates.some((c) => fs.existsSync(c))) return;
  throw new Error(
    "Could not find a `uv` install at ~/.local/bin/uv — install uv first (https://docs.astral.sh/uv/), then try again.",
  );
}

function resolvePayloadSrcDir(resourceName: string, devRelativeDir: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, resourceName);
  }
  // dist/main.js sits at apps/desktop/dist — three levels up is the repo root.
  return path.resolve(__dirname, "../../../", devRelativeDir);
}

function copyFiles(srcDir: string, destDir: string, files: string[]): void {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of files) {
    const src = path.join(srcDir, file);
    if (!fs.existsSync(src)) {
      throw new Error(`Bundled file not found at ${src} — rebuild the app`);
    }
    fs.copyFileSync(src, path.join(destDir, file));
  }
}

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

function replaceRetiredApiBaseUrl(filePath: string, key: string): void {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  let changed = false;
  const updated = lines.map((line) => {
    const eq = line.indexOf("=");
    const name = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (eq === -1 || name !== key || !RETIRED_API_BASE_URLS.has(value)) {
      return line;
    }
    changed = true;
    return `${key}=${DEFAULT_API_BASE_URL}`;
  });
  if (changed) fs.writeFileSync(filePath, updated.join("\n"));
}

// Ingest tokens are minted by the API for the signed-in user (the renderer
// holds the Auth0 session, so it requests one and passes it in) and tie
// everything a daemon pushes to that user.
const INGEST_TOKEN_PATTERN = /^bsl_[A-Za-z0-9_-]{32,64}$/;

function assertIngestToken(token: unknown): asserts token is string {
  if (typeof token !== "string" || !INGEST_TOKEN_PATTERN.test(token)) {
    throw new Error("Invalid ingest token");
  }
}

// Sets keys in a KEY=value env file, keeping every other line, and keeps the
// file owner-only since it holds a credential.
function upsertEnvVars(filePath: string, vars: Record<string, string>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").split("\n")
    : [];
  const pending = new Map(Object.entries(vars));
  const updated = lines.map((line) => {
    const eq = line.indexOf("=");
    const name = eq === -1 ? "" : line.slice(0, eq).trim();
    if (!pending.has(name)) return line;
    const value = pending.get(name);
    pending.delete(name);
    return `${name}=${value}`;
  });
  while (updated.length > 0 && updated[updated.length - 1] === "") updated.pop();
  for (const [name, value] of pending) updated.push(`${name}=${value}`);
  fs.writeFileSync(filePath, `${updated.join("\n")}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function ensureCollectorEnvFile(): void {
  if (fs.existsSync(COLLECTOR_ENV)) return;
  const legacy = parseEnvFile(LEGACY_MONITOR_ENV);
  upsertEnvVars(COLLECTOR_ENV, {
    BESSEL_API_BASE_URL: legacy.METRON_API_URL ?? DEFAULT_API_BASE_URL,
    DEVICE_NAME: os.hostname(),
  });
}

export function registerServiceInstallerHandlers(): void {
  const monitorSrcDir = resolvePayloadSrcDir("monitor", "services/monitor");
  const monitorPayloadDir = path.join(PAYLOAD_ROOT, "monitor");
  const collectorSrcDir = resolvePayloadSrcDir(
    "agent-usage-collector",
    "tools/agent-usage-collector",
  );
  const collectorPayloadDir = path.join(PAYLOAD_ROOT, "agent-usage-collector");

  // ─── monitor ────────────────────────────────────────────────────────────
  ipcHandle("monitor:status", async () => {
    const base = await queryUnitStatus("metron-monitor.service");
    const idle = base.active ? readMonitorIdleStatus() : null;
    return {
      ...base,
      idleSource: idle?.idle_source ?? null,
      idleWarning: idle?.warning ?? null,
    };
  });

  ipcHandle("monitor:install", async (_, ingestToken: unknown) => {
    assertIngestToken(ingestToken);
    assertUvAvailable();
    upsertEnvVars(LEGACY_MONITOR_ENV, { METRON_INTERNAL_API_KEY: ingestToken });
    copyFiles(monitorSrcDir, monitorPayloadDir, ["main.py", "pyproject.toml"]);
    copyFiles(monitorSrcDir, SYSTEMD_USER_DIR, ["metron-monitor.service"]);
    replaceRetiredApiBaseUrl(LEGACY_MONITOR_ENV, "METRON_API_URL");
    await execFileAsync("systemctl", ["--user", "daemon-reload"]);
    await execFileAsync("systemctl", ["--user", "enable", "metron-monitor"]);
    // restart (not start) so re-running install after an app update actually
    // picks up the freshly copied main.py instead of leaving the old process running.
    await execFileAsync("systemctl", ["--user", "restart", "metron-monitor"]);
  });

  ipcHandle("monitor:start", async () => {
    await execFileAsync("systemctl", ["--user", "start", "metron-monitor"]);
  });

  ipcHandle("monitor:stop", async () => {
    await execFileAsync("systemctl", ["--user", "stop", "metron-monitor"]);
  });

  ipcHandle("monitor:setEnabled", async (_, enabled: boolean) => {
    await execFileAsync("systemctl", [
      "--user",
      enabled ? "enable" : "disable",
      "metron-monitor",
    ]);
  });

  // ─── agent usage collector ──────────────────────────────────────────────
  ipcHandle("collector:status", async () => {
    const base = await queryUnitStatus("agent-usage-collector.timer");
    const env = parseEnvFile(COLLECTOR_ENV);
    return {
      ...base,
      needsConfig: base.installed && !env.BESSEL_INTERNAL_API_KEY,
      envPath: COLLECTOR_ENV,
    };
  });

  ipcHandle("collector:install", async (_, ingestToken: unknown) => {
    assertIngestToken(ingestToken);
    assertUvAvailable();
    copyFiles(collectorSrcDir, collectorPayloadDir, [
      "collect_agent_usage.py",
    ]);
    ensureCollectorEnvFile();
    upsertEnvVars(COLLECTOR_ENV, { BESSEL_INTERNAL_API_KEY: ingestToken });
    replaceRetiredApiBaseUrl(COLLECTOR_ENV, "BESSEL_API_BASE_URL");
    copyFiles(collectorSrcDir, SYSTEMD_USER_DIR, [
      "agent-usage-collector.service",
      "agent-usage-collector.timer",
    ]);
    await execFileAsync("systemctl", ["--user", "daemon-reload"]);
    await execFileAsync("systemctl", [
      "--user",
      "enable",
      "agent-usage-collector.timer",
    ]);
    await execFileAsync("systemctl", [
      "--user",
      "restart",
      "agent-usage-collector.timer",
    ]);
  });

  ipcHandle("collector:runNow", async () => {
    await execFileAsync("systemctl", [
      "--user",
      "start",
      "agent-usage-collector.service",
    ]);
  });

  ipcHandle("collector:setEnabled", async (_, enabled: boolean) => {
    await execFileAsync("systemctl", [
      "--user",
      enabled ? "enable" : "disable",
      "agent-usage-collector.timer",
    ]);
  });
}
