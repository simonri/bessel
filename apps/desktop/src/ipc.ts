import { app, BrowserWindow, ipcMain } from "electron";

// The Vite dev server is only trusted in development: in a packaged build,
// whatever happens to listen on localhost:3001 must never get IPC access.
// Mirrored in preload.ts, which can't import this module (sandboxed preload).
export const TRUSTED_ORIGINS = new Set([
  "app://localhost",
  ...(app.isPackaged ? [] : ["http://localhost:3001"]),
]);

export function isTrustedUrl(url: string | undefined): boolean {
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

function isTrustedSender(
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
): boolean {
  return isTrustedUrl(event.senderFrame?.url);
}

let reportListenerError = (channel: string, err: unknown): void =>
  console.error(`IPC listener "${channel}" threw`, err);

export function setIpcErrorReporter(
  reporter: (channel: string, err: unknown) => void,
): void {
  reportListenerError = reporter;
}

export function ipcHandle(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event))
      throw new Error(`Rejected "${channel}" from untrusted sender`);
    return listener(event, ...args);
  });
}

// Fire-and-forget listeners have no caller to reject to: a throw here would
// otherwise surface as an uncaughtException, which exits the app.
export function ipcOn(
  channel: string,
  listener: (event: Electron.IpcMainEvent, ...args: any[]) => void,
): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) return;
    try {
      listener(event, ...args);
    } catch (err) {
      reportListenerError(channel, err);
    }
  });
}

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
}

/** The app's own window, never a popup opened from a browser widget. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || !isTrustedUrl(win.webContents.getURL())) continue;
    win.webContents.send(channel, ...args);
  }
}
