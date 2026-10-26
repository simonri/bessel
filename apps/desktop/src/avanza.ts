import path from "node:path";
import { app, safeStorage } from "electron";
import { AvanzaLoginStore, AvanzaSync, localDay } from "./avanza-core.js";
import { ipcHandle } from "./ipc.js";
import { isRealEncryptionAvailable } from "./secure-storage.js";

/**
 * Avanza's login can trade, so it stays on this computer: main logs in and
 * hands the renderer Avanza's raw JSON to upload, never the password or secret.
 */
export function registerAvanzaHandlers(): void {
  const store = new AvanzaLoginStore(
    path.join(app.getPath("userData"), "avanza-login.bin"),
    {
      isRealEncryptionAvailable,
      encrypt: (plainText) => safeStorage.encryptStringAsync(plainText),
      decrypt: (data) => safeStorage.decryptStringAsync(data),
    },
  );
  // Node's fetch, not net.fetch: the default session's cookie jar is persisted to disk.
  const avanza = new AvanzaSync(store, {
    fetch: (url, init) => fetch(url, init),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    today: () => localDay(new Date()),
  });

  ipcHandle("avanza:status", () => avanza.status());
  ipcHandle("avanza:saveLogin", (_event, login: unknown) =>
    avanza.saveLogin(login),
  );
  ipcHandle("avanza:fetch", (_event, options: unknown) =>
    avanza.fetch(options),
  );
  ipcHandle("avanza:forget", () => avanza.forget());
}
