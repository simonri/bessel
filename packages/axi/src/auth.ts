import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { besselDesktopUserDataDir, cliCredentialsDir } from "./paths.js";

export interface CachedToken {
  access_token: string;
  /** Unix seconds. */
  expires_at: number;
}

const BROKER_PORT = Number(process.env.BESSEL_AXI_BROKER_PORT) || 41825;
const BROKER_SECRET_FILE =
  process.env.BESSEL_AXI_BROKER_SECRET_FILE ??
  join(besselDesktopUserDataDir(), "cli-broker-secret");

function credentialsFile(): string {
  return join(cliCredentialsDir(), "credentials.json");
}

function readCache(): CachedToken | null {
  try {
    return JSON.parse(readFileSync(credentialsFile(), "utf8")) as CachedToken;
  } catch {
    return null;
  }
}

function writeCache(token: CachedToken): void {
  mkdirSync(cliCredentialsDir(), { recursive: true });
  writeFileSync(credentialsFile(), JSON.stringify(token), { mode: 0o600 });
}

export function clearCache(): void {
  rmSync(credentialsFile(), { force: true });
}

/**
 * Reads the `exp` claim without verifying the signature — this CLI never
 * trusts the token's contents, it only forwards it as a bearer credential to
 * an API that verifies it properly. `exp` here is purely local bookkeeping
 * for "do I need to re-broker yet".
 */
export function decodeJwtExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

const NOT_RUNNING_HELP = [
  "Open the Bessel desktop app and make sure you're logged in, then retry.",
];

async function readBrokerSecret(): Promise<string> {
  try {
    return readFileSync(BROKER_SECRET_FILE, "utf8").trim();
  } catch {
    throw new AxiError(
      "No CLI broker secret found for the Bessel desktop app",
      "NOT_INSTALLED",
      NOT_RUNNING_HELP,
    );
  }
}

async function requestBrokerToken(): Promise<CachedToken> {
  const secret = await readBrokerSecret();

  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${BROKER_PORT}/token`, {
      headers: { "X-Bessel-Broker-Secret": secret },
    });
  } catch {
    throw new AxiError(
      "Could not reach the Bessel desktop app's CLI broker",
      "BROKER_UNREACHABLE",
      NOT_RUNNING_HELP,
    );
  }

  if (response.status === 401) {
    throw new AxiError(
      "Bessel desktop app is open but not logged in",
      "NOT_AUTHENTICATED",
      NOT_RUNNING_HELP,
    );
  }
  if (response.status === 403) {
    throw new AxiError(
      "CLI broker secret was rejected",
      "BROKER_SECRET_MISMATCH",
      ["Reinstall the CLI from Settings › My AI in the desktop app"],
    );
  }
  if (!response.ok) {
    throw new AxiError(
      `CLI broker request failed (${response.status})`,
      "BROKER_ERROR",
    );
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_at: number;
  };
  const token: CachedToken = {
    access_token: body.access_token,
    expires_at: body.expires_at,
  };
  writeCache(token);
  return token;
}

const EXPIRY_BUFFER_SECONDS = 60;

export async function getValidToken(): Promise<string> {
  const cached = readCache();
  const nowSeconds = Date.now() / 1000;
  if (cached && cached.expires_at - EXPIRY_BUFFER_SECONDS > nowSeconds) {
    return cached.access_token;
  }
  const fresh = await requestBrokerToken();
  return fresh.access_token;
}

export async function forceRebroker(): Promise<CachedToken> {
  return requestBrokerToken();
}

export async function checkBrokerReachable(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${BROKER_PORT}/ping`);
    return response.ok;
  } catch {
    return false;
  }
}

export function cachedTokenStatus(): {
  cached: boolean;
  validForSeconds: number | null;
} {
  const cached = readCache();
  if (!cached) return { cached: false, validForSeconds: null };
  const remaining = Math.round(cached.expires_at - Date.now() / 1000);
  return { cached: true, validForSeconds: remaining > 0 ? remaining : 0 };
}
