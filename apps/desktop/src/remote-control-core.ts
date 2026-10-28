import { createHash } from "node:crypto";
import path from "node:path";

/**
 * One systemd --user unit per code folder runs `claude remote-control` there,
 * so sessions can be started from the Claude app or claude.ai and run on this
 * computer. It outlives Bessel: the server owns the sessions it starts, and
 * they'd end mid-turn if it lived inside the app.
 */
export function unitNameFor(folder: string): string {
  const base =
    path
      .basename(folder)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "folder";
  const hash = createHash("sha256").update(folder).digest("hex").slice(0, 8);
  return `bessel-remote-control-${base}-${hash}.service`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** One systemd argument: it would otherwise expand $VARS and %specifiers itself. */
function systemdQuote(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/%/g, "%%")
    .replace(/\$/g, "$$$$");
  return `"${escaped}"`;
}

/**
 * The server needs a terminal, so it runs under `script`; a login shell gives
 * its sessions the same tools (mise, uv, docker, ssh) a terminal has. Its
 * screen redraws constantly, so output goes nowhere. Sessions skip permission
 * prompts, like the ones Bessel starts itself.
 */
export function unitFileFor(folder: string, name: string): string {
  if (/[\r\n]/.test(folder)) throw new Error("A folder path can't hold a line break.");
  const server = [
    "claude remote-control",
    "--spawn same-dir",
    "--no-create-session-in-dir",
    "--permission-mode bypassPermissions",
    `--remote-control-session-name-prefix ${shellQuote(name)}`,
  ].join(" ");
  const command = `exec script -qfc ${shellQuote(server)} /dev/null`;
  return [
    "[Unit]",
    `Description=Claude Remote Control for ${name.replace(/[\r\n%]/g, " ")}`,
    "After=network-online.target",
    "StartLimitIntervalSec=600",
    "StartLimitBurst=5",
    "",
    "[Service]",
    // Takes the rest of the line as the path, unquoted; only specifiers need escaping.
    `WorkingDirectory=${folder.replace(/%/g, "%%")}`,
    `ExecStart=/bin/bash -lic ${systemdQuote(command)}`,
    "StandardOutput=null",
    "StandardError=journal",
    "Restart=always",
    "RestartSec=15",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

/**
 * Whether `claude` trusts `folder`: it won't serve an untrusted one. Trusting
 * a folder covers everything inside it, as Claude itself treats it.
 */
export function isTrustedFolder(
  claudeConfig: unknown,
  folder: string,
): boolean {
  const projects = (claudeConfig as { projects?: Record<string, unknown> })
    ?.projects;
  for (let dir = path.resolve(folder); ; dir = path.dirname(dir)) {
    const entry = projects?.[dir] as
      | { hasTrustDialogAccepted?: boolean }
      | undefined;
    if (entry?.hasTrustDialogAccepted === true) return true;
    if (path.dirname(dir) === dir) return false;
  }
}

export interface PhoneNotifications {
  /** Claude's "Push when actions required": a session is waiting on a permission or a question. */
  inputNeeded: boolean;
  /** Claude's "Push when Claude decides": a session thinks you'd want to know. */
  claudeDecides: boolean;
}

export function phoneNotificationsFrom(settings: unknown): PhoneNotifications {
  const s = (settings ?? {}) as Record<string, unknown>;
  return {
    inputNeeded: s.inputNeededNotifEnabled === true,
    claudeDecides: s.agentPushNotifEnabled === true,
  };
}

/** `settings` with the notification keys changed and everything else (hooks, permissions) as it was. */
export function withPhoneNotifications(
  settings: unknown,
  patch: Partial<PhoneNotifications>,
): Record<string, unknown> {
  const next = { ...((settings ?? {}) as Record<string, unknown>) };
  if (patch.inputNeeded !== undefined)
    next.inputNeededNotifEnabled = patch.inputNeeded;
  if (patch.claudeDecides !== undefined)
    next.agentPushNotifEnabled = patch.claudeDecides;
  return next;
}
