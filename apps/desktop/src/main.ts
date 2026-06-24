import path from "path";
import { pathToFileURL } from "url";
import { app, BrowserWindow, ipcMain, Menu, net, protocol } from "electron";
import * as pty from "node-pty";

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

  ipcMain.on("close-window", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle(
    "terminal:spawn",
    async (_, sessionId: string, cols: number, rows: number) => {
      if (ptySessions.has(sessionId)) return;

      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;

      const p = pty.spawn("claude", ["--dangerously-skip-permissions"], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: env.HOME ?? process.cwd(),
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
