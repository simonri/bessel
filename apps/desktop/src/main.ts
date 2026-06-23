import path from "path";
import { pathToFileURL } from "url";
import { app, BrowserWindow, net, protocol } from "electron";

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
  if (process.platform !== "darwin") app.quit();
});
