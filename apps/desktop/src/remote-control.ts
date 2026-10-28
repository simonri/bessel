import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ipcHandle } from "./ipc.js";
import {
  isTrustedFolder,
  type PhoneNotifications,
  phoneNotificationsFrom,
  unitFileFor,
  unitNameFor,
  withPhoneNotifications,
} from "./remote-control-core.js";

const execFileAsync = promisify(execFile);

const SYSTEMD_USER_DIR = path.join(os.homedir(), ".config", "systemd", "user");
const CLAUDE_CONFIG = path.join(os.homedir(), ".claude.json");
const CLAUDE_SETTINGS = path.join(os.homedir(), ".claude", "settings.json");

export type RemoteControlState =
  | "off"
  | "running"
  | "starting"
  | "failed"
  | "untrusted";

export interface RemoteControlStatus {
  /** Only Linux has systemd --user to keep the server running outside Bessel. */
  supported: boolean;
  state: RemoteControlState;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function systemctl(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["--user", ...args]);
    return stdout.trim();
  } catch (err: unknown) {
    const { stdout } = err as { stdout?: string };
    if (stdout !== undefined) return stdout.trim();
    throw err;
  }
}

function assertFolder(folder: unknown): asserts folder is string {
  if (
    typeof folder !== "string" ||
    !path.isAbsolute(folder) ||
    !fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()
  )
    throw new Error("That folder doesn't exist on this computer.");
}

async function status(folder: string): Promise<RemoteControlStatus> {
  if (process.platform !== "linux") return { supported: false, state: "off" };
  const unit = unitNameFor(folder);
  if (!fs.existsSync(path.join(SYSTEMD_USER_DIR, unit))) {
    return {
      supported: true,
      state: isTrustedFolder(readJson(CLAUDE_CONFIG), folder)
        ? "off"
        : "untrusted",
    };
  }
  const active = await systemctl("is-active", unit);
  const state: RemoteControlState =
    active === "active"
      ? "running"
      : active === "activating" || active === "reloading"
        ? "starting"
        : "failed";
  return { supported: true, state };
}

async function enable(
  folder: string,
  name: string,
): Promise<RemoteControlStatus> {
  if (process.platform !== "linux")
    throw new Error("Starting sessions from your phone needs Linux for now.");
  if (!isTrustedFolder(readJson(CLAUDE_CONFIG), folder))
    throw new Error(
      `Run \`claude\` once in ${folder} and accept the trust prompt first.`,
    );
  const unit = unitNameFor(folder);
  fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(SYSTEMD_USER_DIR, unit),
    unitFileFor(folder, name),
  );
  await systemctl("daemon-reload");
  await systemctl("reset-failed", unit).catch(() => "");
  await systemctl("enable", unit);
  await systemctl("restart", unit);
  return status(folder);
}

async function disable(folder: string): Promise<RemoteControlStatus> {
  const unit = unitNameFor(folder);
  const file = path.join(SYSTEMD_USER_DIR, unit);
  if (fs.existsSync(file)) {
    await systemctl("disable", "--now", unit).catch(() => "");
    fs.rmSync(file);
    await systemctl("daemon-reload");
  }
  return status(folder);
}

function readNotifications(): PhoneNotifications {
  return phoneNotificationsFrom(readJson(CLAUDE_SETTINGS));
}

function writeNotifications(
  patch: Partial<PhoneNotifications>,
): PhoneNotifications {
  const current = fs.existsSync(CLAUDE_SETTINGS)
    ? readJson(CLAUDE_SETTINGS)
    : {};
  // A settings file Bessel can't read is left alone rather than replaced.
  if (current === null)
    throw new Error(`Couldn't read ${CLAUDE_SETTINGS}, so it wasn't changed.`);
  const next = withPhoneNotifications(current, patch);
  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true });
  const temp = `${CLAUDE_SETTINGS}.bessel-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(temp, CLAUDE_SETTINGS);
  return phoneNotificationsFrom(next);
}

export function registerRemoteControlHandlers(): void {
  ipcHandle("remoteControl:status", (_event, folder: unknown) => {
    assertFolder(folder);
    return status(folder);
  });
  ipcHandle(
    "remoteControl:enable",
    (_event, folder: unknown, name: unknown) => {
      assertFolder(folder);
      return enable(
        folder,
        typeof name === "string" && name.trim()
          ? name.trim().slice(0, 60)
          : path.basename(folder),
      );
    },
  );
  ipcHandle("remoteControl:disable", (_event, folder: unknown) => {
    assertFolder(folder);
    return disable(folder);
  });
  ipcHandle("claudeNotifications:get", () => readNotifications());
  ipcHandle("claudeNotifications:set", (_event, patch: unknown) => {
    const p = (patch ?? {}) as Record<string, unknown>;
    return writeNotifications({
      ...(typeof p.inputNeeded === "boolean"
        ? { inputNeeded: p.inputNeeded }
        : {}),
      ...(typeof p.claudeDecides === "boolean"
        ? { claudeDecides: p.claudeDecides }
        : {}),
    });
  });
}
