import path from "path";
import { pathToFileURL } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol } from "electron";
import { autoUpdater } from "electron-updater";
import * as pty from "node-pty";

const execFileAsync = promisify(execFile);

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

  ipcMain.on("close-window", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
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
    async (_, sessionId: string, cols: number, rows: number, cwd?: string) => {
      if (ptySessions.has(sessionId)) return;

      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;

      const p = pty.spawn("claude", ["--dangerously-skip-permissions"], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: cwd ?? env.HOME ?? process.cwd(),
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

  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    const target =
      !pathname || pathname === "/" || !path.extname(pathname)
        ? path.join(WEB_DIR, "index.html")
        : path.join(WEB_DIR, pathname);
    try {
      return await net.fetch(pathToFileURL(target).toString());
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
