import { BrowserWindow, ipcMain } from "electron";

export const TRUSTED_ORIGINS = new Set([
  "http://localhost:3001",
  "app://localhost",
]);

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

export function ipcOn(
  channel: string,
  listener: (event: Electron.IpcMainEvent, ...args: any[]) => void,
): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) return;
    listener(event, ...args);
  });
}

export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  }
}
