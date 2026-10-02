import crypto from "crypto";
import { app, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { ipcHandle } from "./ipc.js";
import { createLocalDataServer } from "./local-data-server-http.js";

// Exposes a loopback-only HTTP server returning a JSON snapshot of the
// user's data (sleep, for now) for a local AI tool to read and analyze.
// Random OS-assigned port (not a fixed one — see USER_DATA_DIR in main.ts
// for why dev and packaged profiles must never collide) discovered via a
// small JSON file written into this profile's own userData directory.
//
// The actual data fetch can only happen in the renderer — see
// cli-broker.ts's header comment for why the main process has no Auth0
// access token of its own. Each HTTP request relays to the renderer over
// IPC (the same request/response-over-broadcast shape as the CLI broker's
// token relay) rather than polling and caching: the user may query this
// rarely, so there's no reason to keep the backend warm in between.
const REQUEST_TIMEOUT_MS = 10_000;

function discoveryFilePath(userDataDir: string): string {
  return path.join(userDataDir, "local-data-server.json");
}

function writeDiscoveryFile(userDataDir: string, port: number): void {
  const payload = { url: `http://127.0.0.1:${port}`, port, pid: process.pid };
  try {
    fs.writeFileSync(
      discoveryFilePath(userDataDir),
      JSON.stringify(payload, null, 2),
    );
  } catch {
    // Non-fatal — the IPC-exposed getUrl() still works for the Settings UI.
  }
}

interface PendingDataRequest {
  resolve: (payload: unknown) => void;
}

export function registerLocalDataServerHandlers(userDataDir: string): void {
  const pending = new Map<string, PendingDataRequest>();
  let currentPort: number | null = null;

  ipcHandle(
    "local-data-server:provide-data",
    (_event, requestId: string, payload: unknown) => {
      const request = pending.get(requestId);
      if (!request) return;
      pending.delete(requestId);
      request.resolve(payload);
    },
  );

  ipcHandle("local-data-server:get-url", () =>
    currentPort ? `http://127.0.0.1:${currentPort}` : null,
  );

  const requestPayload = (windowDays: number): Promise<unknown> => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) {
      return Promise.reject(
        new Error("Open and log into the Bessel desktop app first"),
      );
    }

    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!pending.delete(requestId)) return;
        reject(
          new Error(
            "Timed out waiting for the desktop app to respond — make sure you're logged in",
          ),
        );
      }, REQUEST_TIMEOUT_MS);

      pending.set(requestId, {
        resolve: (payload) => {
          clearTimeout(timeout);
          if (payload == null) {
            reject(
              new Error(
                "Not logged in, or the data request failed in the desktop app",
              ),
            );
            return;
          }
          resolve(payload);
        },
      });

      win.webContents.send(
        "local-data-server:data-requested",
        requestId,
        windowDays,
      );
    });
  };

  const server = createLocalDataServer(requestPayload);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    currentPort = typeof address === "object" && address ? address.port : null;
    if (currentPort) writeDiscoveryFile(userDataDir, currentPort);
  });

  app.on("before-quit", () => {
    try {
      fs.unlinkSync(discoveryFilePath(userDataDir));
    } catch {}
    server.close();
  });
}
