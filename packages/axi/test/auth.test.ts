import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "bessel-axi-test-"));
  process.env.HOME = tmpHome;
  process.env.XDG_CONFIG_HOME = join(tmpHome, ".config");
  vi.resetModules();
  vi.unstubAllGlobals();
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

async function testPaths() {
  const { cliCredentialsDir, besselDesktopUserDataDir } = await import(
    "../src/paths.js"
  );
  return {
    credentialsFile: join(cliCredentialsDir(), "credentials.json"),
    secretFile: join(besselDesktopUserDataDir(), "cli-broker-secret"),
  };
}

function writeFileDeep(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

describe("decodeJwtExpiry", () => {
  it("reads the exp claim without verifying the signature", async () => {
    const { decodeJwtExpiry } = await import("../src/auth.js");
    expect(decodeJwtExpiry(fakeJwt({ exp: 1234567890, sub: "user" }))).toBe(
      1234567890,
    );
  });

  it("returns null for malformed tokens", async () => {
    const { decodeJwtExpiry } = await import("../src/auth.js");
    expect(decodeJwtExpiry("not-a-jwt")).toBeNull();
    expect(decodeJwtExpiry("")).toBeNull();
    expect(decodeJwtExpiry("aaa.not-json.bbb")).toBeNull();
  });
});

describe("getValidToken", () => {
  it("returns the cached token without brokering when still valid", async () => {
    const { credentialsFile } = await testPaths();
    writeFileDeep(
      credentialsFile,
      JSON.stringify({
        access_token: "cached-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { getValidToken } = await import("../src/auth.js");
    await expect(getValidToken()).resolves.toBe("cached-token");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-brokers and persists a fresh token when the cache is expired", async () => {
    const { credentialsFile, secretFile } = await testPaths();
    writeFileDeep(secretFile, "broker-secret");
    writeFileDeep(
      credentialsFile,
      JSON.stringify({
        access_token: "stale-token",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
        expect(init.headers["X-Bessel-Broker-Secret"]).toBe("broker-secret");
        return new Response(
          JSON.stringify({
            access_token: "fresh-token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200 },
        );
      }),
    );

    const { getValidToken } = await import("../src/auth.js");
    await expect(getValidToken()).resolves.toBe("fresh-token");
    expect(JSON.parse(readFileSync(credentialsFile, "utf8")).access_token).toBe(
      "fresh-token",
    );
  });

  it("throws an actionable error when no broker secret file exists yet", async () => {
    const { AxiError } = await import("axi-sdk-js");
    const { getValidToken } = await import("../src/auth.js");
    await expect(getValidToken()).rejects.toBeInstanceOf(AxiError);
  });

  it("surfaces not-authenticated as an actionable error, not a raw 401", async () => {
    const { secretFile } = await testPaths();
    writeFileDeep(secretFile, "broker-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "not_authenticated" }), {
            status: 401,
          }),
      ),
    );

    const { getValidToken } = await import("../src/auth.js");
    const { AxiError } = await import("axi-sdk-js");
    await expect(getValidToken()).rejects.toBeInstanceOf(AxiError);
  });
});

describe("clearCache", () => {
  it("removes the credentials file", async () => {
    const { credentialsFile } = await testPaths();
    writeFileDeep(
      credentialsFile,
      JSON.stringify({ access_token: "x", expires_at: 0 }),
    );

    const { clearCache } = await import("../src/auth.js");
    clearCache();
    expect(existsSync(credentialsFile)).toBe(false);
  });
});
