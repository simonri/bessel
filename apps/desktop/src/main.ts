import {
  type ChildProcessWithoutNullStreams,
  execFile,
  spawn,
} from "child_process";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  safeStorage,
  session,
  shell,
} from "electron";
import crypto from "crypto";
import { autoUpdater } from "electron-updater";
import fs from "fs";
import http from "http";
import * as pty from "node-pty";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { promisify } from "util";
import * as Sentry from "@sentry/electron/main";
import { SENTRY_DSN } from "./env.js";

const execFileAsync = promisify(execFile);

// Electron derives the userData directory from package.json's top-level
// "name" field unless overridden. The Jul 11 rebrand changed that field
// ("@metron/desktop" -> "@bessel/desktop"), which silently moved every
// user's profile to a new, empty directory on the next launch — wiping
// workspace templates, settings, and window layouts with no migration.
// Pin the path explicitly so future renames can't do that again.
//
// `pnpm dev` gets its own "-dev" suffixed profile rather than sharing the
// packaged build's: two unrelated Chromium processes hitting the same
// on-disk profile (cookies, session storage, GPU shader cache, the
// persist:browser <webview> partition) concurrently is a well-known source
// of corruption, and it let a running packaged app block dev via
// requestSingleInstanceLock() below.
const USER_DATA_DIR = path.join(
  app.getPath("appData"),
  "@bessel",
  app.isPackaged ? "desktop" : "desktop-dev",
);
app.setPath("userData", USER_DATA_DIR);

// Chromium only auto-selects a real Secret Service keyring for safeStorage when
// it recognises the desktop environment as GNOME or KDE (via XDG_CURRENT_DESKTOP).
// On anything else — Hyprland, Sway, and other wlroots compositors — it silently
// falls back to the "basic_text" backend, which isRealEncryptionAvailable() below
// (correctly) rejects as not real encryption. That makes saveAuthCache() a no-op,
// so the Auth0 token cache is never written and every app restart forces a fresh
// login. Pin the libsecret backend explicitly: it talks to org.freedesktop.secrets
// (gnome-keyring, KeePassXC, KWallet's compat service, …) regardless of DE. Where
// no Secret Service is running, isEncryptionAvailable() still returns false and we
// degrade to the same no-persistence behaviour as before — no regression. Must run
// before app "ready", since Chromium reads --password-store when os_crypt inits.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("password-store", "gnome-libsecret");
}

// The pin above stops *future* renames from silently switching profiles, but
// it doesn't undo the Jul 11 one — anyone who hadn't launched a build under
// the new name yet still has their real data sitting in the pre-rebrand
// "@metron/desktop" profile, invisible to the new one. Seed the new profile
// from it, but only on the very first launch under the new path: this runs
// before Chromium has opened "Local Storage" for USER_DATA_DIR (a plain file
// copy is only safe into a directory nothing has touched yet — copying into,
// or out of, an *open* LevelDB store risks corrupting it), and it must never
// clobber real usage that already happened under the new profile. Only the
// packaged profile has pre-rebrand data to migrate — the "-dev" profile is new.
if (app.isPackaged) {
  const LEGACY_USER_DATA_DIR = path.join(app.getPath("appData"), "@metron", "desktop");
  const NEW_LOCAL_STORAGE_DIR = path.join(USER_DATA_DIR, "Local Storage");
  const LEGACY_LOCAL_STORAGE_DIR = path.join(LEGACY_USER_DATA_DIR, "Local Storage");
  if (!fs.existsSync(NEW_LOCAL_STORAGE_DIR) && fs.existsSync(LEGACY_LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    fs.cpSync(LEGACY_LOCAL_STORAGE_DIR, NEW_LOCAL_STORAGE_DIR, { recursive: true });
  }
}

// Guards against two copies of the *same* profile running at once — e.g. two
// `pnpm dev` sessions, or two packaged instances — rather than dev vs. prod,
// since those now use separate profiles (see USER_DATA_DIR above).
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

// Only enabled for packaged builds — a `pnpm dev` session shouldn't spam the
// Sentry project with local-only errors. The renderer (apps/web) inherits
// this config and reports through this process — see apps/web/src/lib/sentry.ts.
// It reports over a fetch-based fallback rather than the preload IPC bridge:
// the preload script is loaded in Electron's sandboxed context, which can't
// `require()` arbitrary npm packages, so `@sentry/electron/preload` isn't an
// option there without bundling the preload script (it isn't bundled today).
// uncaughtException/unhandledRejection are still reported via the handlers
// below rather than Sentry's own integrations, so those are filtered out here
// to avoid double-reporting and Sentry's own crash dialog.
if (app.isPackaged && SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: app.getVersion(),
    environment: "production",
    tracesSampleRate: 0,
    integrations: (integrations) =>
      integrations.filter(
        (i) => i.name !== "OnUncaughtException" && i.name !== "OnUnhandledRejection",
      ),
  });
}

function shQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// Build a `cd` argument that stays safe under the remote shell while still
// letting a leading ~ expand to the remote home directory.
function remoteCdArg(p: string): string {
  if (p === "~") return "~";
  if (p.startsWith("~/")) return "~/" + shQuote(p.slice(2));
  return shQuote(p);
}

// ─── monitor ──────────────────────────────────────────────────────────────────
const SYSTEMD_USER_DIR = path.join(os.homedir(), ".config", "systemd", "user");
const MONITOR_SERVICE_NAME = "metron-monitor";
// Service file lives in the repo; %h specifiers in its ExecStart are expanded by systemd at runtime.
const MONITOR_SERVICE_SRC = path.resolve(
  __dirname,
  "../../../services/monitor/metron-monitor.service",
);

async function querySystemctl(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["--user", ...args]);
    return stdout.trim();
  } catch (err: unknown) {
    return ((err as { stdout?: string }).stdout ?? "").trim();
  }
}

// ─── spotify ──────────────────────────────────────────────────────────────────
// Controlled via playerctl/MPRIS (the local D-Bus interface Spotify's Linux
// client exposes) rather than the Spotify Web API — no OAuth app registration,
// no Premium requirement, and no network round-trip, just the local player.
//
// Status is pushed, not polled. A naive renderer-side setInterval poll looked
// fine in dev but took up to ~2 minutes to notice a play/pause in practice:
// Chromium throttles a hidden/unfocused page's timers, and this topbar spends
// most of its life behind other windows. IPC sends to the renderer aren't
// subject to that throttling, so instead a long-lived `playerctl --follow`
// process streams status the instant Spotify's own D-Bus signal fires, and
// every line gets broadcast straight to the renderer's query cache.
//
// `--follow` can't self-report "no such player" — targeting a player name
// that doesn't exist just blocks forever with no output and no exit (verified
// empirically), so it can't be trusted to signal Spotify opening/closing. A
// cheap watchdog (`playerctl -l`, just a D-Bus name list) polls for that
// instead, and only that — it never touches metadata/status.
const PLAYERCTL_PLAYER = "spotify";
const PLAYERCTL_SEP = "\x1f";
const PLAYERCTL_STATUS_FIELDS = [
  "status",
  "title",
  "artist",
  "album",
  "mpris:artUrl",
  "mpris:length",
  "position",
];
const SPOTIFY_WATCHDOG_MS = 5000;

interface SpotifyStatus {
  running: boolean;
  playing?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  artUrl?: string;
  lengthMs?: number;
  positionMs?: number;
}

let spotifyStatus: SpotifyStatus = { running: false };
let spotifyFollowProc: ChildProcessWithoutNullStreams | null = null;
let spotifyWatchdogTimer: ReturnType<typeof setInterval> | null = null;

async function playerctl(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("playerctl", [
    "-p",
    PLAYERCTL_PLAYER,
    ...args,
  ]);
  return stdout.trim();
}

function setSpotifyStatus(next: SpotifyStatus): void {
  spotifyStatus = next;
  broadcast("spotify:status-changed", next);
}

function parseSpotifyStatusLine(raw: string): SpotifyStatus {
  const [status, title, artist, album, artUrl, lengthUs, positionUs] =
    raw.split(PLAYERCTL_SEP);
  return {
    running: true,
    playing: status === "Playing",
    title: title || "",
    artist: artist || "",
    album: album || "",
    artUrl: artUrl || "",
    lengthMs: Math.round(Number(lengthUs) / 1000) || 0,
    positionMs: Math.round(Number(positionUs) / 1000) || 0,
  };
}

function startSpotifyFollow(): void {
  if (spotifyFollowProc) return;
  const fmt = PLAYERCTL_STATUS_FIELDS.map((f) => `{{${f}}}`).join(
    PLAYERCTL_SEP,
  );
  const proc = spawn("playerctl", [
    "-p",
    PLAYERCTL_PLAYER,
    "metadata",
    "--format",
    fmt,
    "--follow",
  ]);
  spotifyFollowProc = proc;

  let buffer = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line) setSpotifyStatus(parseSpotifyStatusLine(line));
    }
  });
  const onDone = () => {
    if (spotifyFollowProc === proc) spotifyFollowProc = null;
  };
  proc.on("exit", onDone);
  proc.on("error", onDone);
}

function stopSpotifyFollow(): void {
  spotifyFollowProc?.kill();
  spotifyFollowProc = null;
}

async function spotifyWatchdogTick(): Promise<void> {
  let players: string[] = [];
  try {
    const { stdout } = await execFileAsync("playerctl", ["-l"]);
    players = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    players = [];
  }

  if (players.includes(PLAYERCTL_PLAYER)) {
    if (!spotifyFollowProc) startSpotifyFollow();
  } else {
    stopSpotifyFollow();
    if (spotifyStatus.running) setSpotifyStatus({ running: false });
  }
}

function startSpotifyWatchdog(): void {
  spotifyWatchdogTick();
  spotifyWatchdogTimer = setInterval(spotifyWatchdogTick, SPOTIFY_WATCHDOG_MS);
}

function stopSpotifyWatchdog(): void {
  if (spotifyWatchdogTimer) clearInterval(spotifyWatchdogTimer);
  spotifyWatchdogTimer = null;
  stopSpotifyFollow();
}

interface GitFileEntry {
  path: string;
  originalPath?: string;
  status: string;
}

async function gitRun(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

// Raw-byte variant for image previews — gitRun's string stdout is decoded as
// utf8, which corrupts binary content.
async function gitRunBuffer(args: string[], cwd: string): Promise<Buffer> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "buffer",
  });
  return stdout;
}

function parsePorcelain(output: string): {
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
} {
  if (!output) return { staged: [], unstaged: [], untracked: [] };
  const parts = output.split("\0");
  const staged: GitFileEntry[] = [];
  const unstaged: GitFileEntry[] = [];
  const untracked: GitFileEntry[] = [];
  let i = 0;
  while (i < parts.length) {
    const entry = parts[i++];
    if (!entry || entry.length < 3) continue;
    const x = entry[0];
    const y = entry[1];
    const filePath = entry.slice(3);
    let originalPath: string | undefined;
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      originalPath = parts[i++];
    }
    if (x === "?" && y === "?") {
      untracked.push({ path: filePath, status: "?" });
      continue;
    }
    if (x !== " " && x !== "?") {
      staged.push({ path: filePath, originalPath, status: x });
    }
    if (y !== " " && y !== "?") {
      unstaged.push({ path: filePath, status: y });
    }
  }
  return { staged, unstaged, untracked };
}

// ─── diagnostics log ────────────────────────────────────────────────────────
// There was no logging anywhere in the main process, so a freeze (e.g. the
// browser widget hanging after extended video playback) left zero forensic
// trail. This appends timestamped crash/hang/memory diagnostics to a file so
// the next occurrence can actually be diagnosed.
let logFilePath = "";

function appendLog(line: string): void {
  if (!logFilePath) return;
  const entry = `[${new Date().toISOString()}] ${line}\n`;
  // Sync so a fatal error is guaranteed to be on disk before the process can
  // exit (see the uncaughtException handler below).
  try {
    fs.appendFileSync(logFilePath, entry);
  } catch {
    // best-effort logging only
  }
  if (!app.isPackaged) console.log(entry.trimEnd());
}

function initLogging(): void {
  const logDir = app.getPath("logs");
  fs.mkdirSync(logDir, { recursive: true });
  logFilePath = path.join(logDir, "main.log");
  try {
    if (fs.statSync(logFilePath).size > 5 * 1024 * 1024) {
      fs.renameSync(logFilePath, `${logFilePath}.old`);
    }
  } catch {
    // no existing log file yet
  }
  appendLog(
    `app ready — version ${app.getVersion()}, platform ${process.platform}`,
  );

  // Without a listener, Node's default behavior is to crash the process on an
  // uncaught exception — log first, then exit the same way, rather than
  // silently swallowing it and limping on in a possibly-corrupt state.
  process.on("uncaughtException", (err) => {
    appendLog(`uncaughtException: ${err.stack ?? err}`);
    Sentry.captureException(err);
    // Sentry's transport is async, so give it a chance to flush before the
    // process exits — captureException alone doesn't guarantee delivery.
    void Sentry.flush(2000).finally(() => app.exit(1));
  });
  process.on("unhandledRejection", (reason) => {
    appendLog(`unhandledRejection: ${reason}`);
    Sentry.captureException(reason);
  });

  // Fires for any renderer (host window or a <webview> guest) that crashes,
  // gets OOM-killed, or is killed — the reason field is the key diagnostic.
  app.on("render-process-gone", (_event, webContents, details) => {
    appendLog(
      `render-process-gone type=${webContents.getType()} url=${webContents.getURL()} ` +
        `reason=${details.reason} exitCode=${details.exitCode}`,
    );
  });

  // Covers the GPU process specifically — video playback is GPU-decode heavy,
  // and a GPU process crash/restart loop is a common cause of an apparent freeze.
  app.on("child-process-gone", (_event, details) => {
    appendLog(
      `child-process-gone type=${details.type} name=${details.name ?? ""} ` +
        `reason=${details.reason} exitCode=${details.exitCode}`,
    );
  });

  // Periodic memory snapshot so a slow leak building up to a freeze shows up
  // in the log even when nothing actually crashes. pid is included so a
  // climbing process can be cross-referenced against the "webview pid=" line
  // logged once a given <webview> guest has navigated.
  setInterval(
    () => {
      const summary = app
        .getAppMetrics()
        .map(
          (m) =>
            `${m.type}${m.name ? `:${m.name}` : ""}#${m.pid}=${Math.round((m.memory?.workingSetSize ?? 0) / 1024)}MB`,
        )
        .join(" ");
      appendLog(`memory ${summary}`);
    },
    2 * 60 * 1000,
  ).unref();
}

const WEB_DIR = path.join(__dirname, "../../web/dist/client");

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// ─── auth cache ───────────────────────────────────────────────────────────────
let authCache: Record<string, string> = {};
let authCachePath = "";

function isRealEncryptionAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  // getSelectedStorageBackend() only exists on Linux (it reports which keyring
  // was picked — kwallet, gnome-libsecret, or "basic_text", which is plaintext
  // obfuscation rather than real encryption). Calling it on mac/Windows throws
  // a TypeError, since isEncryptionAvailable() already guarantees a real OS
  // keychain/DPAPI backend there.
  if (process.platform !== "linux") return true;
  return safeStorage.getSelectedStorageBackend() !== "basic_text";
}

function loadAuthCache(): Record<string, string> {
  if (!authCachePath || !isRealEncryptionAvailable()) return {};
  if (!fs.existsSync(authCachePath)) return {};
  try {
    const decrypted = safeStorage.decryptString(fs.readFileSync(authCachePath));
    return JSON.parse(decrypted) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveAuthCache(): void {
  if (!authCachePath || !isRealEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(JSON.stringify(authCache));
  fs.writeFileSync(authCachePath, encrypted);
}

// ─── device identity ────────────────────────────────────────────────────────
// A project's local path/ssh_host resolve per-device on the backend (see
// api/projects/service.py) — this id is what tells the backend "this device"
// on every request, sent as the X-Device-Id header. Persisted outside the
// encrypted auth cache since it isn't a secret and must survive logout.
interface DeviceInfo {
  key: string;
  name: string;
}

let deviceInfo: DeviceInfo | null = null;

function loadOrCreateDeviceInfo(): DeviceInfo {
  const devicePath = path.join(app.getPath("userData"), "device.json");
  try {
    const existing = JSON.parse(
      fs.readFileSync(devicePath, "utf8"),
    ) as DeviceInfo;
    if (existing.key) return existing;
  } catch {
    // No file yet, or it's corrupt — fall through and create a fresh one.
  }
  const info: DeviceInfo = { key: crypto.randomUUID(), name: os.hostname() };
  fs.writeFileSync(devicePath, JSON.stringify(info));
  return info;
}

const ptySessions = new Map<string, pty.IPty>();

// macOS GUI apps inherit launchd's minimal environment (PATH is just
// /usr/bin:/bin:/usr/sbin:/sbin), not the user's shell environment — so
// anything installed via Homebrew/nvm/npm -g (claude, codex, grok, ...) is
// invisible both to pty.spawn's binary lookup and inside the shells it
// starts. Resolve the user's real PATH once by asking their login shell,
// the same way VS Code and other Electron terminal hosts do. The printf
// markers make parsing immune to rc files that print banners.
let shellPathPromise: Promise<string | null> | null = null;
function resolveShellPath(): Promise<string | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  shellPathPromise ??= (async () => {
    const shell = process.env.SHELL ?? "/bin/zsh";
    try {
      const { stdout } = await execFileAsync(
        shell,
        ["-i", "-l", "-c", 'printf "__BSL_PATH__%s__BSL_PATH__" "$PATH"'],
        { timeout: 5000 },
      );
      const path = /__BSL_PATH__(.*)__BSL_PATH__/s.exec(stdout)?.[1];
      if (!path) throw new Error("no PATH marker in shell output");
      return path;
    } catch (err) {
      appendLog(
        `login-shell PATH resolution failed (${shell}): ${(err as Error).message}`,
      );
      return null;
    }
  })();
  return shellPathPromise;
}

const TRUSTED_ORIGINS = new Set(["http://localhost:3001", "app://localhost"]);

// Auth0's hosted login page (VITE_AUTH0_DOMAIN in apps/web/.env) is where the
// window navigates during loginWithRedirect() before coming back to app://localhost.
// "Continue with Google" hops it on to accounts.google.com and back to Auth0.
// Kept separate from TRUSTED_ORIGINS: IPC handlers must never trust these origins,
// but the window still needs permission to navigate there and back.
const NAVIGATION_ALLOWED_ORIGINS = new Set([
  ...TRUSTED_ORIGINS,
  "https://metronapp.us.auth0.com",
  "https://accounts.google.com",
]);

// ─── OAuth loopback callback server ────────────────────────────────────────────
// Google blocks its own login page ("This browser or app may not be secure")
// when it's navigated inside an embedded webview like an Electron BrowserWindow
// — it detects this by more than the User-Agent string (Electron never sends
// the Sec-CH-UA client hints a real Chrome does, no matter what the UA string
// claims), so there's no header to spoof our way out of it. The fix Google
// documents for native/desktop apps is to run the whole OAuth flow in the
// system's real default browser and receive the redirect back via a local
// loopback server (RFC 8252) — see providers/auth.tsx on the web side, which
// opens loginWithRedirect() via shell.openExternal instead of navigating here.
//
// The server is opened on demand, right before a login attempt, rather than
// held open for the app's whole lifetime. Ideally it would also bind an
// OS-assigned ephemeral port instead of a fixed one (RFC 8252's recommended
// approach for native apps) — but Auth0 only allows wildcard placeholders in
// a callback URL's subdomain/domain, not its port, so a per-attempt random
// port can never be allow-listed. Fall back to one fixed port per build
// variant instead: that's still enough to fix the actual bug, since the only
// way two instances fight over the same port is a packaged build and
// `pnpm dev` running at once (two copies of the *same* variant already can't
// run concurrently — see requestSingleInstanceLock() above). Both ports must
// be in the Auth0 application's Allowed Callback URLs; apps/web/src/providers
// /auth.tsx asks main for the port via `auth:start-login` before calling
// loginWithRedirect() rather than hardcoding it on the renderer side too.
const AUTH_CALLBACK_PORT = app.isPackaged ? 41823 : 41824;
const AUTH_CALLBACK_PATH = "/callback";
const AUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

let authCallbackServer: http.Server | null = null;

function startAuthLogin(): Promise<number> {
  // A stale, abandoned attempt (user closed the login tab and tried again)
  // shouldn't keep its port bound.
  authCallbackServer?.close();

  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith(AUTH_CALLBACK_PATH)) {
      res.writeHead(404).end();
      return;
    }
    broadcast(
      "auth:callback",
      `http://127.0.0.1:${AUTH_CALLBACK_PORT}${req.url}`,
    );
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      "<!doctype html><meta charset=utf-8><title>Bessel</title>" +
        "<body style='display:flex;align-items:center;justify-content:center;height:100vh;margin:0;" +
        "background:#0a0a0a;color:#ffffff88;font:14px system-ui,sans-serif'>" +
        "Signed in — you can close this tab and return to Bessel.</body>",
    );
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    server.close();
  });
  authCallbackServer = server;
  server.on("close", () => {
    if (authCallbackServer === server) authCallbackServer = null;
  });
  server.on("error", (err) =>
    appendLog(
      `auth callback server failed to start: ${(err as Error).message}`,
    ),
  );
  // Covers an attempt the user never finishes (closes the browser tab, etc.)
  // — without this the port would stay bound until the app quits.
  setTimeout(() => server.close(), AUTH_CALLBACK_TIMEOUT_MS).unref();

  return new Promise((resolve, reject) => {
    server.once("listening", () => resolve(AUTH_CALLBACK_PORT));
    server.once("error", reject);
    server.listen(AUTH_CALLBACK_PORT, "127.0.0.1");
  });
}

// ─── browser widget ───────────────────────────────────────────────────────────
// Shared by every browser-widget <webview> instance so logging into a site once
// (YouTube, Twitch, ...) carries over to every widget and survives app restarts.
const BROWSER_PARTITION = "persist:browser";

// Electron's default UA appends " Bessel/<version> Electron/<version>", which
// trips Google's "this browser or app may not be secure" block on login. Strip
// those tokens so the guest session presents as plain Chromium.
function chromeUserAgent(ses: Electron.Session): string {
  return ses
    .getUserAgent()
    .split(" ")
    .filter(
      (token) =>
        !token.startsWith("Electron/") && !token.startsWith(`${app.name}/`),
    )
    .join(" ");
}

function isTrustedSender(
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
): boolean {
  const url = event.senderFrame?.url;
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // `.origin` is unreliable for non-special schemes like "app:" (returns the
    // string "null"), so build the origin from protocol + host instead.
    return TRUSTED_ORIGINS.has(`${parsed.protocol}//${parsed.host}`);
  } catch {
    return false;
  }
}

function ipcHandle(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event))
      throw new Error(`Rejected "${channel}" from untrusted sender`);
    return listener(event, ...args);
  });
}

function ipcOn(
  channel: string,
  listener: (event: Electron.IpcMainEvent, ...args: any[]) => void,
): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) return;
    listener(event, ...args);
  });
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  }
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function isImageFile(file: string): boolean {
  const mime = MIME_TYPES[path.extname(file).toLowerCase()];
  return !!mime && mime.startsWith("image/");
}

// electron's net.fetch() ignores the Range header on file:// URLs — it always
// returns the full file as a 200 with no Content-Length, which breaks <video>
// playback for any mp4 that needs a byte-range seek (e.g. to read a trailing
// moov atom). Serve local files ourselves so range requests get a real 206.
async function serveLocalFile(
  filePath: string,
  range: string | null,
): Promise<Response> {
  const stat = await fs.promises.stat(filePath);
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const headers: Record<string, string> = {
    "content-type":
      MIME_TYPES[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream",
    "accept-ranges": "bytes",
  };

  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match) {
    const [, startStr, endStr] = match;
    if (startStr) {
      start = Number(startStr);
      if (endStr) end = Number(endStr);
    } else if (endStr) {
      // suffix range, e.g. "bytes=-500" for the last 500 bytes
      start = Math.max(0, stat.size - Number(endStr));
    }
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${stat.size}`;
  }

  headers["content-length"] = String(end - start + 1);
  const body = Readable.toWeb(
    fs.createReadStream(filePath, { start, end }),
  ) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Bessel",
    // Hides the native gray title bar on mac while keeping the traffic lights,
    // which CanvasTopBar reserves left inset space for (MAC_TRAFFIC_LIGHT_INSET).
    // frame:false would drop the traffic lights entirely, which we still want.
    // Windows/Linux keep their native frame — no custom drag region needed there.
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 16, y: 12 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  // Pin the browser widget's <webview> guest to its own isolated partition and
  // strip out anything (preload, node integration) it wasn't given explicitly —
  // defense-in-depth against a compromised renderer requesting a different guest.
  win.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    if (params.partition !== BROWSER_PARTITION) {
      event.preventDefault();
      return;
    }
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    delete webPreferences.preload;
  });

  win.webContents.on("unresponsive", () =>
    appendLog("host window unresponsive"),
  );
  win.webContents.on("responsive", () =>
    appendLog("host window responsive again"),
  );

  // Surfaces the React app's own console.error/warn (e.g. the ErrorBoundary
  // catch) into the same forensic log as everything else, instead of it only
  // ever reaching devtools and vanishing when the window is closed.
  win.webContents.on("console-message", (event) => {
    const { level, message, lineNumber, sourceId } = event;
    if (level === "error" || level === "warning") {
      appendLog(
        `renderer console[${level}] ${sourceId}:${lineNumber} ${message}`,
      );
    }
  });

  win.webContents.on("before-input-event", (_, input) => {
    if (
      input.type === "keyDown" &&
      input.shift &&
      (input.control || input.meta) &&
      input.key.toLowerCase() === "i"
    ) {
      win.webContents.toggleDevTools();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://"))
      shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      if (!NAVIGATION_ALLOWED_ORIGINS.has(`${parsed.protocol}//${parsed.host}`))
        event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  if (!app.isPackaged) {
    win.loadURL("http://localhost:3001");
  } else {
    win.loadURL("app://localhost");
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  initLogging();

  if (app.isPackaged) {
    autoUpdater
      .checkForUpdatesAndNotify()
      .catch((err: Error) => appendLog(`update check failed: ${err.message}`));
  }

  authCachePath = path.join(app.getPath("userData"), "auth-cache.bin");
  authCache = loadAuthCache();
  deviceInfo = loadOrCreateDeviceInfo();
  // Warm the macOS login-shell PATH lookup so the first terminal spawn
  // doesn't stall on it (rc-heavy shells can take a second to start).
  void resolveShellPath();

  // Same UA fix as the browser widget below, applied to the default session so
  // the main window's Auth0/Google login (createWindow) isn't blocked too.
  session.defaultSession.setUserAgent(chromeUserAgent(session.defaultSession));

  const browserSession = session.fromPartition(BROWSER_PARTITION);
  browserSession.setUserAgent(chromeUserAgent(browserSession));
  // Fullscreen (video player) and media (camera/mic prompts some sites show
  // regardless of use) are the only permissions a browser widget guest can ask for.
  browserSession.setPermissionRequestHandler(
    (_contents, permission, callback) => {
      callback(permission === "fullscreen" || permission === "media");
    },
  );

  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return;

    // OAuth login (Google, Twitch, ...) opens via window.open(); let it through
    // as a real popup window so it shares the guest's session/cookies, instead
    // of swallowing the click and leaving login looking broken.
    contents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith("http://") && !url.startsWith("https://"))
        return { action: "deny" };
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    });

    // <webview> HTML5 fullscreen (a video player's fullscreen button) requests
    // fullscreen on the guest, which doesn't automatically propagate to the host
    // window — bridge it manually or the fullscreen button silently does nothing.
    contents.on("enter-html-full-screen", () => {
      if (contents.hostWebContents)
        BrowserWindow.fromWebContents(contents.hostWebContents)?.setFullScreen(
          true,
        );
    });
    contents.on("leave-html-full-screen", () => {
      if (contents.hostWebContents)
        BrowserWindow.fromWebContents(contents.hostWebContents)?.setFullScreen(
          false,
        );
    });

    // Tracked separately rather than calling contents.getURL() from the
    // "destroyed" handler, where the contents may already be torn down.
    let lastUrl = contents.getURL();
    // The guest's OS process only exists once it has actually navigated, so
    // this is logged here (not at creation) and cross-referenced against the
    // pids in the periodic "memory" line to tie a climbing process to a URL.
    contents.on("did-navigate", (_e, url) => {
      lastUrl = url;
      appendLog(
        `webview pid=${contents.getOSProcessId()} navigated to url=${lastUrl}`,
      );
    });
    contents.on("did-navigate-in-page", (_e, url) => {
      lastUrl = url;
    });

    appendLog(`webview created url=${lastUrl}`);
    contents.on("unresponsive", () =>
      appendLog(`webview unresponsive url=${lastUrl}`),
    );
    contents.on("responsive", () =>
      appendLog(`webview responsive again url=${lastUrl}`),
    );
    contents.on("destroyed", () =>
      appendLog(`webview destroyed url=${lastUrl}`),
    );
    // Surfaces guest-page JS errors/warnings (e.g. a video decode or WebGL
    // context-lost error) that might otherwise vanish along with the freeze.
    contents.on("console-message", (event) => {
      const { level, message } = event;
      if (level === "error" || level === "warning") {
        appendLog(`webview console[${level}] url=${lastUrl} ${message}`);
      }
    });
  });

  ipcHandle(
    "auth:get",
    (_, key: string): string | null => authCache[key] ?? null,
  );
  ipcHandle("auth:set", (_, key: string, value: string): void => {
    authCache[key] = value;
    saveAuthCache();
  });
  ipcHandle("auth:remove", (_, key: string): void => {
    delete authCache[key];
    saveAuthCache();
  });
  ipcHandle("auth:all-keys", (): string[] => Object.keys(authCache));
  ipcHandle("auth:start-login", (): Promise<number> => startAuthLogin());

  ipcOn("close-window", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcHandle("shell:open-external", (_, url: string) => {
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      throw new Error("Only http(s) URLs may be opened externally");
    }
    return shell.openExternal(url);
  });

  ipcHandle("app:version", () => app.getVersion());

  ipcHandle("device:get-info", (): DeviceInfo => deviceInfo!);

  ipcHandle("app:check-update", () => {
    if (!app.isPackaged) return Promise.resolve({ status: "dev" });
    return new Promise((resolve) => {
      const cleanup = () => {
        autoUpdater.removeListener("update-available", onAvailable);
        autoUpdater.removeListener("update-not-available", onNotAvailable);
        autoUpdater.removeListener("error", onError);
      };
      const onAvailable = (info: { version: string }) => {
        cleanup();
        resolve({ status: "available", version: info.version });
      };
      const onNotAvailable = () => {
        cleanup();
        resolve({ status: "up-to-date" });
      };
      const onError = (err: Error) => {
        cleanup();
        resolve({ status: "error", message: err.message });
      };
      autoUpdater.once("update-available", onAvailable);
      autoUpdater.once("update-not-available", onNotAvailable);
      autoUpdater.once("error", onError);
      autoUpdater.checkForUpdates().catch(onError);
    });
  });

  ipcHandle("logs:read", (): string => {
    const paths = [`${logFilePath}.old`, logFilePath];
    return paths
      .filter((p) => p && fs.existsSync(p))
      .map((p) => {
        try {
          return fs.readFileSync(p, "utf8");
        } catch {
          return "";
        }
      })
      .join("");
  });

  ipcHandle("logs:reveal", () => {
    if (logFilePath) shell.showItemInFolder(logFilePath);
  });

  ipcHandle("dialog:select-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      properties: ["openDirectory"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcHandle("ssh:list-dir", async (_, host: string, dirPath: string) => {
    if (!/^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host)) {
      throw new Error(`Invalid SSH host: ${host}`);
    }
    const cdArg = remoteCdArg(dirPath?.trim() ? dirPath.trim() : "~");
    // Sentinel markers isolate our output from anything a remote rc file prints.
    const remote = `cd ${cdArg} && printf '\\n@@CWD@@\\n' && pwd && printf '@@DIRS@@\\n' && ls -1Ap`;
    const { stdout } = await execFileAsync(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host, remote],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    const cwdTag = "@@CWD@@\n";
    const dirsTag = "@@DIRS@@\n";
    const cwdAt = stdout.indexOf(cwdTag);
    const dirsAt = stdout.indexOf(dirsTag, cwdAt);
    if (cwdAt === -1 || dirsAt === -1)
      throw new Error("Unexpected response from remote host.");
    const cwd = stdout.slice(cwdAt + cwdTag.length, dirsAt).trim();
    const dirs = stdout
      .slice(dirsAt + dirsTag.length)
      .split("\n")
      .filter((line) => line.endsWith("/"))
      .map((line) => line.slice(0, -1))
      .filter((name) => name && name !== "." && name !== "..")
      .sort((a, b) => a.localeCompare(b));
    return { cwd, dirs };
  });

  ipcHandle(
    "terminal:spawn",
    async (
      _,
      sessionId: string,
      cols: number,
      rows: number,
      config: { command: string; args: string[]; cwd?: string },
    ) => {
      if (ptySessions.has(sessionId)) return;

      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;

      const shellPath = await resolveShellPath();
      if (shellPath) {
        env.PATH = shellPath;
      } else if (process.platform === "darwin") {
        // Resolution failed (exotic shell, slow rc files) — at least cover
        // the standard Homebrew locations rather than launchd's bare PATH.
        env.PATH = `${env.PATH}:/opt/homebrew/bin:/usr/local/bin`;
      }

      const isDefaultShell = config.command === "default-shell";
      const command = isDefaultShell
        ? (env.SHELL ?? "/bin/bash")
        : config.command;
      // macOS terminal emulators start login shells — .zprofile (where
      // Homebrew puts its PATH setup) is only sourced with -l.
      const args =
        isDefaultShell && process.platform === "darwin"
          ? ["-l", ...config.args]
          : config.args;

      let p: pty.IPty;
      try {
        p = pty.spawn(command, args, {
          name: "xterm-256color",
          cols,
          rows,
          cwd: config.cwd ?? env.HOME ?? process.cwd(),
          env,
        });
      } catch (err) {
        appendLog(
          `terminal spawn failed command=${command} cwd=${config.cwd ?? ""} ` +
            `PATH=${env.PATH}: ${(err as Error).message}`,
        );
        throw new Error(
          `Could not launch "${command}": ${(err as Error).message}`,
        );
      }

      ptySessions.set(sessionId, p);

      p.onData((data) => {
        broadcast("terminal:data", sessionId, data);
      });

      p.onExit(({ exitCode }) => {
        broadcast("terminal:exit", sessionId, exitCode ?? 0);
        ptySessions.delete(sessionId);
      });
    },
  );

  ipcOn("terminal:input", (_, sessionId: string, data: string) => {
    ptySessions.get(sessionId)?.write(data);
  });

  ipcOn(
    "terminal:resize",
    (_, sessionId: string, cols: number, rows: number) => {
      ptySessions.get(sessionId)?.resize(cols, rows);
    },
  );

  ipcOn("terminal:kill", (_, sessionId: string) => {
    ptySessions.get(sessionId)?.kill();
    ptySessions.delete(sessionId);
  });

  ipcHandle("git:status", async (_, repoPath: string) => {
    const branch = (
      await gitRun(["rev-parse", "--abbrev-ref", "HEAD"], repoPath)
    ).trim();
    let ahead = 0,
      behind = 0;
    try {
      const counts = (
        await gitRun(
          ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
          repoPath,
        )
      ).trim();
      const [b, a] = counts.split("\t").map(Number);
      ahead = a ?? 0;
      behind = b ?? 0;
    } catch {
      /* no upstream configured */
    }
    const statusOut = await gitRun(
      ["status", "--porcelain=v1", "-z"],
      repoPath,
    );
    return { branch, ahead, behind, ...parsePorcelain(statusOut) };
  });

  // Full old/new file content, so the diff viewer can syntax-highlight against
  // complete source rather than just the visible hunk — a hunk-only highlight
  // misreads any multi-line construct (block comment, template literal, JSX)
  // that opens or closes outside the shown context lines.
  const gitShowFile = async (
    repoPath: string,
    ref: string,
    file: string,
  ): Promise<string> => {
    try {
      return await gitRun(["show", `${ref}:${file}`], repoPath);
    } catch {
      return "";
    }
  };

  const readWorkingTreeFile = (repoPath: string, file: string): string => {
    try {
      return fs.readFileSync(path.join(repoPath, file), "utf8");
    } catch {
      return "";
    }
  };

  const gitShowFileBuffer = async (
    repoPath: string,
    ref: string,
    file: string,
  ): Promise<Buffer | null> => {
    try {
      return await gitRunBuffer(["show", `${ref}:${file}`], repoPath);
    } catch {
      return null;
    }
  };

  const readWorkingTreeFileBuffer = (
    repoPath: string,
    file: string,
  ): Buffer | null => {
    try {
      return fs.readFileSync(path.join(repoPath, file));
    } catch {
      return null;
    }
  };

  ipcHandle(
    "git:diff",
    async (
      _,
      repoPath: string,
      file: string,
      staged: boolean,
      untracked: boolean,
    ) => {
      if (isImageFile(file)) {
        const mimeType = MIME_TYPES[path.extname(file).toLowerCase()];
        const toDataUri = (buf: Buffer | null) =>
          buf ? `data:${mimeType};base64,${buf.toString("base64")}` : null;

        let oldBuf: Buffer | null;
        let newBuf: Buffer | null;
        if (untracked) {
          oldBuf = null;
          newBuf = readWorkingTreeFileBuffer(repoPath, file);
        } else if (staged) {
          [oldBuf, newBuf] = await Promise.all([
            gitShowFileBuffer(repoPath, "HEAD", file),
            gitShowFileBuffer(repoPath, "", file), // index (stage 0)
          ]);
        } else {
          oldBuf = await gitShowFileBuffer(repoPath, "", file); // index (stage 0)
          newBuf = readWorkingTreeFileBuffer(repoPath, file);
        }
        return {
          kind: "image" as const,
          oldImage: toDataUri(oldBuf),
          newImage: toDataUri(newBuf),
        };
      }

      if (untracked) {
        const newContent = readWorkingTreeFile(repoPath, file);
        try {
          const diff = await gitRun(
            ["diff", "--no-index", "/dev/null", file],
            repoPath,
          );
          return { kind: "text" as const, diff, oldContent: "", newContent };
        } catch (err: any) {
          if (err.code === 1)
            return {
              kind: "text" as const,
              diff: err.stdout as string,
              oldContent: "",
              newContent,
            };
          throw err;
        }
      }

      const diff = await gitRun(
        staged ? ["diff", "--cached", "--", file] : ["diff", "--", file],
        repoPath,
      );
      if (staged) {
        const [oldContent, newContent] = await Promise.all([
          gitShowFile(repoPath, "HEAD", file),
          gitShowFile(repoPath, "", file), // index (stage 0)
        ]);
        return { kind: "text" as const, diff, oldContent, newContent };
      }
      const oldContent = await gitShowFile(repoPath, "", file); // index (stage 0)
      const newContent = readWorkingTreeFile(repoPath, file);
      return { kind: "text" as const, diff, oldContent, newContent };
    },
  );

  ipcHandle("git:stage", (_, repoPath: string, files: string[]) =>
    gitRun(["add", "--", ...files], repoPath),
  );

  ipcHandle("git:unstage", (_, repoPath: string, files: string[]) =>
    gitRun(["restore", "--staged", "--", ...files], repoPath),
  );

  ipcHandle(
    "git:discard",
    async (
      _,
      repoPath: string,
      trackedFiles: string[],
      untrackedFiles: string[],
    ) => {
      if (trackedFiles.length > 0) {
        await gitRun(["restore", "--", ...trackedFiles], repoPath);
      }
      const repoRoot = path.resolve(repoPath);
      for (const file of untrackedFiles) {
        const target = path.resolve(repoRoot, file);
        if (target === repoRoot || !target.startsWith(repoRoot + path.sep)) {
          throw new Error(
            `Refusing to delete path outside repository: ${file}`,
          );
        }
        fs.rmSync(target, { recursive: true, force: true });
      }
    },
  );

  ipcHandle("git:commit", (_, repoPath: string, message: string) =>
    gitRun(["commit", "-m", message], repoPath),
  );

  ipcHandle("git:push", (_, repoPath: string) => gitRun(["push"], repoPath));

  ipcHandle("git:log", async (_, repoPath: string, limit = 30) => {
    const SEP = "%x1f";
    const out = await gitRun(
      [
        "log",
        `--format=%H${SEP}%h${SEP}%s${SEP}%an${SEP}%ar${SEP}%D`,
        `-${limit}`,
      ],
      repoPath,
    );
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, subject, author, date, refs] =
          line.split("\x1f");
        return {
          hash,
          shortHash,
          subject: subject ?? "",
          author: author ?? "",
          date: date ?? "",
          refs: refs?.trim() ?? "",
        };
      });
  });

  ipcHandle("monitor:status", async () => {
    const serviceFilePath = path.join(
      SYSTEMD_USER_DIR,
      `${MONITOR_SERVICE_NAME}.service`,
    );
    const installed = fs.existsSync(serviceFilePath);
    if (!installed) {
      return {
        installed: false,
        active: false,
        enabled: false,
        failed: false,
        state: "not-found",
      };
    }
    const state = await querySystemctl("is-active", MONITOR_SERVICE_NAME);
    const enabledStr = await querySystemctl("is-enabled", MONITOR_SERVICE_NAME);
    return {
      installed: true,
      active: state === "active",
      failed: state === "failed",
      enabled: enabledStr === "enabled",
      state,
    };
  });

  ipcHandle("monitor:install", async () => {
    if (!fs.existsSync(MONITOR_SERVICE_SRC)) {
      throw new Error(
        `Service file not found at ${MONITOR_SERVICE_SRC} — is the repo at ~/dev/metron?`,
      );
    }
    fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
    fs.copyFileSync(
      MONITOR_SERVICE_SRC,
      path.join(SYSTEMD_USER_DIR, `${MONITOR_SERVICE_NAME}.service`),
    );
    await execFileAsync("systemctl", ["--user", "daemon-reload"]);
    await execFileAsync("systemctl", [
      "--user",
      "enable",
      MONITOR_SERVICE_NAME,
    ]);
    await execFileAsync("systemctl", ["--user", "start", MONITOR_SERVICE_NAME]);
  });

  ipcHandle("monitor:start", async () => {
    await execFileAsync("systemctl", ["--user", "start", MONITOR_SERVICE_NAME]);
  });

  ipcHandle("monitor:stop", async () => {
    await execFileAsync("systemctl", ["--user", "stop", MONITOR_SERVICE_NAME]);
  });

  ipcHandle("monitor:setEnabled", async (_, enabled: boolean) => {
    if (enabled) {
      await execFileAsync("systemctl", [
        "--user",
        "enable",
        MONITOR_SERVICE_NAME,
      ]);
    } else {
      await execFileAsync("systemctl", [
        "--user",
        "disable",
        MONITOR_SERVICE_NAME,
      ]);
    }
  });

  ipcHandle("spotify:status", async () => spotifyStatus);

  ipcHandle("spotify:playPause", async () => {
    await playerctl("play-pause");
  });

  ipcHandle("spotify:next", async () => {
    await playerctl("next");
  });

  const INDEX_HTML = path.join(WEB_DIR, "index.html");
  protocol.handle("app", async (request) => {
    try {
      const { pathname } = new URL(request.url);
      let target = INDEX_HTML;
      if (pathname && pathname !== "/" && path.extname(pathname)) {
        const resolved = path.resolve(
          WEB_DIR,
          "." + decodeURIComponent(pathname),
        );
        if (resolved.startsWith(WEB_DIR + path.sep)) target = resolved;
      }
      return await serveLocalFile(target, request.headers.get("range"));
    } catch {
      return serveLocalFile(INDEX_HTML, null);
    }
  });

  createWindow();
  startSpotifyWatchdog();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const p of ptySessions.values()) p.kill();
  ptySessions.clear();
  stopSpotifyWatchdog();
  if (process.platform !== "darwin") app.quit();
});
