import path from "path";
import fs from "fs";
import os from "os";
import { pathToFileURL } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, shell } from "electron";
import { autoUpdater } from "electron-updater";
import * as pty from "node-pty";

const execFileAsync = promisify(execFile);

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
const MONITOR_SERVICE_SRC = path.resolve(__dirname, "../../../services/monitor/metron-monitor.service");

async function querySystemctl(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("systemctl", ["--user", ...args]);
    return stdout.trim();
  } catch (err: unknown) {
    return ((err as { stdout?: string }).stdout ?? "").trim();
  }
}

interface GitFileEntry {
  path: string;
  originalPath?: string;
  status: string;
}

async function gitRun(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 });
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
  // On Linux, 'basic_text' is plaintext obfuscation, not OS-keychain encryption
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

const ptySessions = new Map<string, pty.IPty>();

const TRUSTED_ORIGINS = new Set(["http://localhost:3001", "app://localhost"]);

function isTrustedSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url;
  if (!url) return false;
  try {
    return TRUSTED_ORIGINS.has(new URL(url).origin);
  } catch {
    return false;
  }
}

function ipcHandle(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error(`Rejected "${channel}" from untrusted sender`);
    return listener(event, ...args);
  });
}

function ipcOn(channel: string, listener: (event: Electron.IpcMainEvent, ...args: any[]) => void): void {
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Metron",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("before-input-event", (_, input) => {
    if (input.type === "keyDown" && input.shift && (input.control || input.meta) && input.key.toLowerCase() === "i") {
      win.webContents.toggleDevTools();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    try {
      if (!TRUSTED_ORIGINS.has(new URL(url).origin)) event.preventDefault();
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

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  authCachePath = path.join(app.getPath("userData"), "auth-cache.bin");
  authCache = loadAuthCache();

  ipcHandle("auth:get", (_, key: string): string | null => authCache[key] ?? null);
  ipcHandle("auth:set", (_, key: string, value: string): void => {
    authCache[key] = value;
    saveAuthCache();
  });
  ipcHandle("auth:remove", (_, key: string): void => {
    delete authCache[key];
    saveAuthCache();
  });
  ipcHandle("auth:all-keys", (): string[] => Object.keys(authCache));

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

  ipcHandle("app:check-update", () => {
    if (!app.isPackaged) return Promise.resolve({ status: "dev" });
    return new Promise((resolve) => {
      const cleanup = () => {
        autoUpdater.removeListener("update-available", onAvailable);
        autoUpdater.removeListener("update-not-available", onNotAvailable);
        autoUpdater.removeListener("error", onError);
      };
      const onAvailable = (info: { version: string }) => { cleanup(); resolve({ status: "available", version: info.version }); };
      const onNotAvailable = () => { cleanup(); resolve({ status: "up-to-date" }); };
      const onError = (err: Error) => { cleanup(); resolve({ status: "error", message: err.message }); };
      autoUpdater.once("update-available", onAvailable);
      autoUpdater.once("update-not-available", onNotAvailable);
      autoUpdater.once("error", onError);
      autoUpdater.checkForUpdates().catch(onError);
    });
  });

  ipcHandle("dialog:select-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = { properties: ["openDirectory"] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
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
    if (cwdAt === -1 || dirsAt === -1) throw new Error("Unexpected response from remote host.");
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
    async (_, sessionId: string, cols: number, rows: number, config: { command: string; args: string[]; cwd?: string }) => {
      if (ptySessions.has(sessionId)) return;

      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;

      const command = config.command === "default-shell"
        ? (process.env.SHELL ?? "/bin/bash")
        : config.command;

      const p = pty.spawn(command, config.args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd: config.cwd ?? env.HOME ?? process.cwd(),
        env,
      });

      ptySessions.set(sessionId, p);

      p.onData((data) => {
        broadcast("terminal:data", sessionId, data);
      });

      p.onExit(({ exitCode }) => {
        broadcast("terminal:exit", sessionId, exitCode ?? 0);
        ptySessions.delete(sessionId);
      });
    }
  );

  ipcOn("terminal:input", (_, sessionId: string, data: string) => {
    ptySessions.get(sessionId)?.write(data);
  });

  ipcOn("terminal:resize", (_, sessionId: string, cols: number, rows: number) => {
    ptySessions.get(sessionId)?.resize(cols, rows);
  });

  ipcOn("terminal:kill", (_, sessionId: string) => {
    ptySessions.get(sessionId)?.kill();
    ptySessions.delete(sessionId);
  });

  ipcHandle("git:status", async (_, repoPath: string) => {
    const branch = (await gitRun(["rev-parse", "--abbrev-ref", "HEAD"], repoPath)).trim();
    let ahead = 0, behind = 0;
    try {
      const counts = (await gitRun(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], repoPath)).trim();
      const [b, a] = counts.split("\t").map(Number);
      ahead = a ?? 0;
      behind = b ?? 0;
    } catch { /* no upstream configured */ }
    const statusOut = await gitRun(["status", "--porcelain=v1", "-z"], repoPath);
    return { branch, ahead, behind, ...parsePorcelain(statusOut) };
  });

  ipcHandle("git:diff", async (_, repoPath: string, file: string, staged: boolean, untracked: boolean) => {
    if (untracked) {
      try {
        return await gitRun(["diff", "--no-index", "/dev/null", file], repoPath);
      } catch (err: any) {
        if (err.code === 1) return err.stdout as string;
        throw err;
      }
    }
    return gitRun(staged ? ["diff", "--cached", "--", file] : ["diff", "--", file], repoPath);
  });

  ipcHandle("git:stage", (_, repoPath: string, files: string[]) =>
    gitRun(["add", "--", ...files], repoPath));

  ipcHandle("git:unstage", (_, repoPath: string, files: string[]) =>
    gitRun(["restore", "--staged", "--", ...files], repoPath));

  ipcHandle("git:discard", async (_, repoPath: string, trackedFiles: string[], untrackedFiles: string[]) => {
    if (trackedFiles.length > 0) {
      await gitRun(["restore", "--", ...trackedFiles], repoPath);
    }
    const repoRoot = path.resolve(repoPath);
    for (const file of untrackedFiles) {
      const target = path.resolve(repoRoot, file);
      if (target === repoRoot || !target.startsWith(repoRoot + path.sep)) {
        throw new Error(`Refusing to delete path outside repository: ${file}`);
      }
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  ipcHandle("git:commit", (_, repoPath: string, message: string) =>
    gitRun(["commit", "-m", message], repoPath));

  ipcHandle("git:push", (_, repoPath: string) =>
    gitRun(["push"], repoPath));

  ipcHandle("git:log", async (_, repoPath: string, limit: number = 30) => {
    const SEP = "%x1f";
    const out = await gitRun(
      ["log", `--format=%H${SEP}%h${SEP}%s${SEP}%an${SEP}%ar${SEP}%D`, `-${limit}`],
      repoPath,
    );
    return out.trim().split("\n").filter(Boolean).map((line) => {
      const [hash, shortHash, subject, author, date, refs] = line.split("\x1f");
      return { hash, shortHash, subject: subject ?? "", author: author ?? "", date: date ?? "", refs: refs?.trim() ?? "" };
    });
  });

  ipcHandle("monitor:status", async () => {
    const serviceFilePath = path.join(SYSTEMD_USER_DIR, `${MONITOR_SERVICE_NAME}.service`);
    const installed = fs.existsSync(serviceFilePath);
    if (!installed) {
      return { installed: false, active: false, enabled: false, failed: false, state: "not-found" };
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
      throw new Error(`Service file not found at ${MONITOR_SERVICE_SRC} — is the repo at ~/dev/metron?`);
    }
    fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
    fs.copyFileSync(MONITOR_SERVICE_SRC, path.join(SYSTEMD_USER_DIR, `${MONITOR_SERVICE_NAME}.service`));
    await execFileAsync("systemctl", ["--user", "daemon-reload"]);
    await execFileAsync("systemctl", ["--user", "enable", MONITOR_SERVICE_NAME]);
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
      await execFileAsync("systemctl", ["--user", "enable", MONITOR_SERVICE_NAME]);
    } else {
      await execFileAsync("systemctl", ["--user", "disable", MONITOR_SERVICE_NAME]);
    }
  });

  const INDEX_HTML = path.join(WEB_DIR, "index.html");
  protocol.handle("app", async (request) => {
    try {
      const { pathname } = new URL(request.url);
      let target = INDEX_HTML;
      if (pathname && pathname !== "/" && path.extname(pathname)) {
        const resolved = path.resolve(WEB_DIR, "." + decodeURIComponent(pathname));
        if (resolved.startsWith(WEB_DIR + path.sep)) target = resolved;
      }
      const headers: Record<string, string> = {};
      const range = request.headers.get("range");
      if (range) headers["range"] = range;
      return await net.fetch(pathToFileURL(target).toString(), { headers });
    } catch {
      return net.fetch(pathToFileURL(INDEX_HTML).toString());
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const p of ptySessions.values()) p.kill();
  ptySessions.clear();
  if (process.platform !== "darwin") app.quit();
});
