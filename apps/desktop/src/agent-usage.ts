import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";
import {
  AGENT_ID,
  type ClaudeLogin,
  type DailyUsage,
  dailyPayload,
  localDay,
  parseClaudeLogin,
  parseRateLimits,
  type RateLimit,
} from "./agent-usage-core.js";
import type { ScanRequest, ScanResponse } from "./agent-usage-worker.js";
import { ipcHandle } from "./ipc.js";

// Claude Code's token usage and plan limits, read from this machine for the
// renderer to upload. Replaces the agent-usage-collector systemd timer.

const execFileAsync = promisify(execFile);

const LOOKBACK_DAYS = 14;
const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const PROBE_TIMEOUT_MS = 10_000;

export interface AgentUsageSnapshot {
  daily: DailyUsage[];
  rate_limits: (RateLimit & {
    device: string;
    agent: string;
    tier: string | null;
  })[];
}

function claudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

// Packaged, the worker is unpacked next to the asar (see asarUnpack):
// worker threads can't reliably load scripts from inside an archive.
function workerPath(): string {
  return path
    .join(__dirname, "agent-usage-worker.js")
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (response: ScanResponse) => void>();

function scanWorker(): Worker {
  if (worker) return worker;
  const started = new Worker(workerPath());
  started.on("message", (response: ScanResponse) => {
    waiting.get(response.id)?.(response);
    waiting.delete(response.id);
  });
  const fail = (error: string) => {
    for (const reply of waiting.values()) reply({ id: -1, error });
    waiting.clear();
    worker = null;
  };
  started.on("error", (err) => fail(String(err)));
  started.on("exit", (code) => fail(`Scanner exited (${code})`));
  started.unref();
  worker = started;
  return started;
}

async function scanTranscripts(cutoffDay: string): Promise<DailyUsage[]> {
  const id = nextId++;
  const response = await new Promise<ScanResponse>((resolve) => {
    waiting.set(id, resolve);
    scanWorker().postMessage({
      id,
      projectsDir: path.join(claudeDir(), "projects"),
      cutoffDay,
    } satisfies ScanRequest);
  });
  if (response.error) throw new Error(response.error);
  return dailyPayload(new Map(response.totals ?? []), os.hostname());
}

/** On macOS Claude Code keeps its login in the Keychain, elsewhere in a file. */
async function claudeLogin(): Promise<ClaudeLogin | null> {
  try {
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s",
        "Claude Code-credentials",
        "-w",
      ]);
      return parseClaudeLogin(stdout);
    }
    const raw = await fs.promises.readFile(
      path.join(claudeDir(), ".credentials.json"),
      "utf8",
    );
    return parseClaudeLogin(raw);
  } catch {
    return null;
  }
}

async function probeRateLimits(login: ClaudeLogin): Promise<RateLimit[]> {
  const response = await fetch(USAGE_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${login.accessToken}`,
      "anthropic-beta": "oauth-2025-04-20",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`Usage endpoint answered ${response.status}`);
  return parseRateLimits(await response.json());
}

export async function collectAgentUsage(): Promise<AgentUsageSnapshot> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const [daily, login] = await Promise.all([
    scanTranscripts(localDay(cutoff)),
    claudeLogin(),
  ]);
  // Without a login or a reachable endpoint there are still tokens to report.
  const limits = login ? await probeRateLimits(login).catch(() => []) : [];
  const device = os.hostname();
  return {
    daily,
    rate_limits: limits.map((limit) => ({
      ...limit,
      device,
      agent: AGENT_ID,
      tier: login?.tier ?? null,
    })),
  };
}

const LEGACY_UNITS = [
  "agent-usage-collector.timer",
  "agent-usage-collector.service",
];

/**
 * Removes the agent-usage-collector timer older installs set up: the app
 * collects usage itself now, and the timer's credential no longer works.
 */
export async function removeLegacyCollector(
  log: (line: string) => void,
): Promise<void> {
  if (process.platform !== "linux") return;
  const unitDir = path.join(os.homedir(), ".config", "systemd", "user");
  if (!fs.existsSync(path.join(unitDir, LEGACY_UNITS[0]))) return;
  try {
    await execFileAsync("systemctl", [
      "--user",
      "disable",
      "--now",
      LEGACY_UNITS[0],
    ]).catch(() => {});
    await execFileAsync("systemctl", ["--user", "stop", LEGACY_UNITS[1]]).catch(
      () => {},
    );
    for (const unit of LEGACY_UNITS)
      fs.rmSync(path.join(unitDir, unit), { force: true });
    await execFileAsync("systemctl", ["--user", "daemon-reload"]).catch(
      () => {},
    );
    fs.rmSync(
      path.join(
        os.homedir(),
        ".local",
        "share",
        "bessel",
        "agent-usage-collector",
      ),
      {
        recursive: true,
        force: true,
      },
    );
    const configDir = path.join(os.homedir(), ".config", "bessel");
    const configs = fs.existsSync(configDir)
      ? fs.readdirSync(configDir, { withFileTypes: true })
      : [];
    for (const name of configs)
      if (name.isFile() && name.name.startsWith("agent-usage-collector.env"))
        fs.rmSync(path.join(configDir, name.name), { force: true });
    log("removed the legacy agent-usage-collector timer");
  } catch (err) {
    log(
      `couldn't remove the legacy agent-usage-collector timer: ${String(err)}`,
    );
  }
}

export function registerAgentUsageHandlers(): void {
  ipcHandle("agentUsage:collect", () => collectAgentUsage());
}
