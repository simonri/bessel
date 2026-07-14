import crypto from "crypto";
import { app, BrowserWindow } from "electron";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { ipcHandle } from "./ipc.js";

// The bessel-axi CLI (packages/axi) runs as a plain Node process outside
// Electron — it has no access to the renderer's Auth0 session. Rather than
// giving it its own OAuth login (a second Auth0 application, and a refresh
// token lifecycle independent of the desktop app's own rotating one), it asks
// this already-logged-in app for a short-lived access token over a
// loopback-only HTTP endpoint. The actual Auth0 SDK state lives in the
// renderer (apps/web/src/providers/auth.tsx), so a request here is relayed
// to the renderer over IPC and back, the same shape as the existing OAuth
// callback relay.
const CLI_BROKER_PORT = app.isPackaged ? 41825 : 41826;
const CLI_BROKER_TOKEN_TIMEOUT_MS = 10_000;

function brokerSecretFile(userDataDir: string): string {
  return path.join(userDataDir, "cli-broker-secret");
}

function loadOrCreateBrokerSecret(userDataDir: string): string {
  const file = brokerSecretFile(userDataDir);
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    // No file yet, or unreadable — fall through and create a fresh one.
  }
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Reads the `exp` claim only for the CLI's local cache bookkeeping — the
// token itself is still a real Auth0-issued access token, verified properly
// by the API's own JWKS check on every request.
function decodeJwtExpirySeconds(token: string): number {
  const FALLBACK_TTL_SECONDS = 3600;
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payload ?? "", "base64url").toString("utf8"),
    );
    if (typeof decoded.exp === "number") return decoded.exp;
  } catch {
    // fall through to fallback
  }
  return Math.floor(Date.now() / 1000) + FALLBACK_TTL_SECONDS;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

interface PendingTokenRequest {
  resolve: (token: string | null) => void;
}

export function registerCliBrokerHandlers(userDataDir: string): void {
  const secret = loadOrCreateBrokerSecret(userDataDir);
  const pending = new Map<string, PendingTokenRequest>();

  ipcHandle(
    "cli:provide-token",
    (_event, requestId: string, token: string | null) => {
      const request = pending.get(requestId);
      if (!request) return;
      pending.delete(requestId);
      request.resolve(token);
    },
  );

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/ping") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && req.url === "/token") {
      const provided = req.headers["x-bessel-broker-secret"];
      if (typeof provided !== "string" || !secretsMatch(provided, secret)) {
        sendJson(res, 403, {
          error: "forbidden",
          message: "Invalid broker secret",
        });
        return;
      }

      const win = BrowserWindow.getAllWindows()[0];
      if (!win) {
        sendJson(res, 401, {
          error: "not_authenticated",
          message: "Open and log into the Bessel desktop app first",
        });
        return;
      }

      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        if (!pending.delete(requestId)) return;
        sendJson(res, 401, {
          error: "not_authenticated",
          message:
            "Timed out waiting for the desktop app to respond — make sure you're logged in",
        });
      }, CLI_BROKER_TOKEN_TIMEOUT_MS);

      pending.set(requestId, {
        resolve: (token) => {
          clearTimeout(timeout);
          if (!token) {
            sendJson(res, 401, {
              error: "not_authenticated",
              message: "Open and log into the Bessel desktop app first",
            });
            return;
          }
          sendJson(res, 200, {
            access_token: token,
            expires_at: decodeJwtExpirySeconds(token),
          });
        },
      });

      win.webContents.send("cli:token-requested", requestId);
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(CLI_BROKER_PORT, "127.0.0.1");
}

// ─── CLI install (Settings > My AI) ────────────────────────────────────────
const CLI_SHIM_DIR = path.join(os.homedir(), ".local", "bin");
const CLI_SHIM_PATH = path.join(CLI_SHIM_DIR, "bessel-axi");

function resolveCliEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "axi", "bin", "bessel-axi.mjs");
  }
  // dist/main.js sits at apps/desktop/dist — three levels up is the repo root.
  return path.resolve(
    __dirname,
    "../../../packages/axi/dist/bin/bessel-axi.mjs",
  );
}

function isPathOnPATH(dir: string): boolean {
  const entries = (process.env.PATH ?? "").split(path.delimiter);
  return entries.includes(dir);
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function registerAxiCliInstallHandlers(): void {
  ipcHandle("axi-cli:status", () => ({
    installed: fs.existsSync(CLI_SHIM_PATH),
    shimPath: CLI_SHIM_PATH,
    onPath: isPathOnPATH(CLI_SHIM_DIR),
    supported: process.platform === "linux" || process.platform === "darwin",
  }));

  ipcHandle("axi-cli:install", () => {
    if (process.platform !== "linux" && process.platform !== "darwin") {
      throw new Error(
        "Installing the bessel-axi CLI is not yet supported on Windows",
      );
    }
    const cliEntry = resolveCliEntry();
    if (!fs.existsSync(cliEntry)) {
      throw new Error(`Bundled CLI not found at ${cliEntry} — rebuild the app`);
    }
    fs.mkdirSync(CLI_SHIM_DIR, { recursive: true });
    const shim = `#!/usr/bin/env bash\nexec env ELECTRON_RUN_AS_NODE=1 ${shQuote(process.execPath)} ${shQuote(cliEntry)} "$@"\n`;
    fs.writeFileSync(CLI_SHIM_PATH, shim, { mode: 0o755 });
    return {
      shimPath: CLI_SHIM_PATH,
      onPath: isPathOnPATH(CLI_SHIM_DIR),
    };
  });
}
