import path from "path";
import fs from "fs";
import os from "os";
import { pathToFileURL } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, net, protocol, safeStorage, shell } from "electron";
import { autoUpdater } from "electron-updater";
import * as pty from "node-pty";

const execFileAsync = promisify(execFile);

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

  win.webContents.on("did-finish-load", () => {
    globalShortcut.register("CommandOrControl+Shift+I", () => {
      win.webContents.toggleDevTools();
    });
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

  ipcMain.handle("auth:get", (_, key: string): string | null => authCache[key] ?? null);
  ipcMain.handle("auth:set", (_, key: string, value: string): void => {
    authCache[key] = value;
    saveAuthCache();
  });
  ipcMain.handle("auth:remove", (_, key: string): void => {
    delete authCache[key];
    saveAuthCache();
  });
  ipcMain.handle("auth:all-keys", (): string[] => Object.keys(authCache));

  ipcMain.on("close-window", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("shell:open-external", (_, url: string) => shell.openExternal(url));

  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle("app:check-update", () => {
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

  ipcMain.handle("dialog:select-folder", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      properties: ["openDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(
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
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send("terminal:data", sessionId, data);
        }
      });

      p.onExit(({ exitCode }) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send("terminal:exit", sessionId, exitCode ?? 0);
        }
        ptySessions.delete(sessionId);
      });
    }
  );

  ipcMain.on("terminal:input", (_, sessionId: string, data: string) => {
    ptySessions.get(sessionId)?.write(data);
  });

  ipcMain.on("terminal:resize", (_, sessionId: string, cols: number, rows: number) => {
    ptySessions.get(sessionId)?.resize(cols, rows);
  });

  ipcMain.on("terminal:kill", (_, sessionId: string) => {
    ptySessions.get(sessionId)?.kill();
    ptySessions.delete(sessionId);
  });

  ipcMain.handle("git:status", async (_, repoPath: string) => {
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

  ipcMain.handle("git:diff", async (_, repoPath: string, file: string, staged: boolean, untracked: boolean) => {
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

  ipcMain.handle("git:stage", (_, repoPath: string, files: string[]) =>
    gitRun(["add", "--", ...files], repoPath));

  ipcMain.handle("git:unstage", (_, repoPath: string, files: string[]) =>
    gitRun(["restore", "--staged", "--", ...files], repoPath));

  ipcMain.handle("git:commit", (_, repoPath: string, message: string) =>
    gitRun(["commit", "-m", message], repoPath));

  ipcMain.handle("git:push", (_, repoPath: string) =>
    gitRun(["push"], repoPath));

  ipcMain.handle("git:log", async (_, repoPath: string, limit: number = 30) => {
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

  ipcMain.handle("monitor:status", async () => {
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

  ipcMain.handle("monitor:install", async () => {
    if (!fs.existsSync(MONITOR_SERVICE_SRC)) {
      throw new Error(`Service file not found at ${MONITOR_SERVICE_SRC} — is the repo at ~/dev/metron?`);
    }
    fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
    fs.copyFileSync(MONITOR_SERVICE_SRC, path.join(SYSTEMD_USER_DIR, `${MONITOR_SERVICE_NAME}.service`));
    await execFileAsync("systemctl", ["--user", "daemon-reload"]);
    await execFileAsync("systemctl", ["--user", "enable", MONITOR_SERVICE_NAME]);
    await execFileAsync("systemctl", ["--user", "start", MONITOR_SERVICE_NAME]);
  });

  ipcMain.handle("monitor:start", async () => {
    await execFileAsync("systemctl", ["--user", "start", MONITOR_SERVICE_NAME]);
  });

  ipcMain.handle("monitor:stop", async () => {
    await execFileAsync("systemctl", ["--user", "stop", MONITOR_SERVICE_NAME]);
  });

  ipcMain.handle("monitor:setEnabled", async (_, enabled: boolean) => {
    if (enabled) {
      await execFileAsync("systemctl", ["--user", "enable", MONITOR_SERVICE_NAME]);
    } else {
      await execFileAsync("systemctl", ["--user", "disable", MONITOR_SERVICE_NAME]);
    }
  });

  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    const target =
      !pathname || pathname === "/" || !path.extname(pathname)
        ? path.join(WEB_DIR, "index.html")
        : path.join(WEB_DIR, pathname);
    try {
      const headers: Record<string, string> = {};
      const range = request.headers.get("range");
      if (range) headers["range"] = range;
      return await net.fetch(pathToFileURL(target).toString(), { headers });
    } catch {
      return net.fetch(
        pathToFileURL(path.join(WEB_DIR, "index.html")).toString()
      );
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
