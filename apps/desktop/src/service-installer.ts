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
const DEFAULT_API_BASE_URL = "https://vps.tailca3fd9.ts.net";
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

// The collector needs the same shared-secret the monitor already uses to
// authenticate to the API. If the monitor is already configured on this
// machine, reuse its key so a second unrelated install step isn't needed —
// otherwise leave the key blank and let `collector:status` report that the
// env file needs a value filled in by hand. There's no self-serve secret
// provisioning in this app, so a machine with neither unit configured yet
// genuinely can't bootstrap this on its own.
function ensureCollectorEnvFile(): void {
  if (fs.existsSync(COLLECTOR_ENV)) return;
  fs.mkdirSync(CONFIG_ROOT, { recursive: true });
  const legacy = parseEnvFile(LEGACY_MONITOR_ENV);
  const contents = [
    `BESSEL_API_BASE_URL=${legacy.METRON_API_URL ?? DEFAULT_API_BASE_URL}`,
    `BESSEL_INTERNAL_API_KEY=${legacy.METRON_INTERNAL_API_KEY ?? ""}`,
    `DEVICE_NAME=${os.hostname()}`,
    "",
  ].join("\n");
  fs.writeFileSync(COLLECTOR_ENV, contents, { mode: 0o600 });
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
  ipcHandle("monitor:status", async () =>
    queryUnitStatus("metron-monitor.service"),
  );

  ipcHandle("monitor:install", async () => {
    assertUvAvailable();
    copyFiles(monitorSrcDir, monitorPayloadDir, ["main.py", "pyproject.toml"]);
    copyFiles(monitorSrcDir, SYSTEMD_USER_DIR, ["metron-monitor.service"]);
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

  ipcHandle("collector:install", async () => {
    assertUvAvailable();
    copyFiles(collectorSrcDir, collectorPayloadDir, [
      "collect_agent_usage.py",
    ]);
    ensureCollectorEnvFile();
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
