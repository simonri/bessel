/**
 * The parts of Avanza's private web API Bessel reads, ported from
 * services/api/src/api/avanza/client.py. Avanza has no public API; these are
 * the routes its web app uses, which can change without notice. Only read
 * routes are called. Kept free of "electron" so it runs under vitest.
 */
import fs from "node:fs/promises";
import { KeyedMutex } from "./keyed-mutex.js";
import {
  InvalidTotpSecretError,
  msUntilNextCode,
  normalizeTotpSecret,
  totp,
} from "./totp.js";

export const BASE_URL = "https://www.avanza.se";
export const LOGIN_PATH = "/_api/authentication/sessions/usercredentials";
export const TOTP_PATH = "/_api/authentication/sessions/totp";
export const OVERVIEW_PATH =
  "/_api/account-overview/overview/categorizedAccounts";
export const POSITIONS_PATH = "/_api/position-data/positions";
export const TRANSACTIONS_PATH = "/_api/transactions/list";
export const PAGE_LIMIT = 1000;
const TIMEOUT_MS = 30_000;
const USER_AGENT = "Bessel (personal dashboard)";
// The shortest session Avanza allows; Bessel only needs a few minutes.
const SESSION_MINUTES = 30;
const DAY_MS = 86_400_000;

/** Avanza answered with an error or something unexpected; try again later. */
export class AvanzaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvanzaError";
  }
}

/** Avanza rejected the username, password or TOTP secret; new ones are needed. */
export class AvanzaAuthError extends AvanzaError {
  constructor(message: string) {
    super(message);
    this.name = "AvanzaAuthError";
  }
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface AvanzaClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface AvanzaLogin {
  username: string;
  password: string;
  totpSecret: string;
}

export type AvanzaFailure = {
  ok: false;
  reason: "rejected" | "unreachable" | "not_signed_in";
  message: string;
};

export type AvanzaResult<T> = ({ ok: true } & T) | AvanzaFailure;

export interface AvanzaSnapshot {
  username: string;
  overview: unknown;
  positions: unknown | null;
  transactions: unknown[];
  fetchedFrom: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One login's HTTP session: its cookies and security token die with it. */
export class AvanzaClient {
  private token: string | null = null;
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly fetch: Fetch,
    private readonly clock: AvanzaClock,
  ) {}

  async login(login: AvanzaLogin): Promise<void> {
    const { username, password, totpSecret } = login;
    let response = await this.send("POST", LOGIN_PATH, {
      body: { maxInactiveMinutes: SESSION_MINUTES, username, password },
    });
    if (response.status === 401)
      throw new AvanzaAuthError(
        "Avanza didn't accept the username or password.",
      );
    check(response, LOGIN_PATH);
    const body = await readJson(response, LOGIN_PATH);
    if (!isRecord(body)) throw unexpected(LOGIN_PATH);
    if (body.twoFactorLogin == null) {
      this.token = response.headers.get("X-SecurityToken");
      return;
    }
    if (!isRecord(body.twoFactorLogin)) throw unexpected(LOGIN_PATH);
    if (body.twoFactorLogin.method !== "TOTP")
      throw new AvanzaAuthError(
        "Avanza asks for a second factor other than an authenticator app.",
      );

    response = await this.sendCode(totpSecret);
    if (response.status === 401) {
      // A code is single-use: one used moments ago (another login) fails, so try the next one.
      await this.clock.sleep(msUntilNextCode(this.clock.now()));
      response = await this.sendCode(totpSecret);
      if (response.status === 401)
        throw new AvanzaAuthError(
          "Avanza didn't accept the code from the TOTP secret.",
        );
    }
    check(response, TOTP_PATH);
    this.token = response.headers.get("X-SecurityToken");
  }

  overview(): Promise<unknown> {
    return this.get(OVERVIEW_PATH);
  }

  positions(): Promise<unknown> {
    return this.get(POSITIONS_PATH);
  }

  transactions(from: string, to: string, maxElements: number) {
    return this.get(TRANSACTIONS_PATH, {
      from,
      to,
      maxElements: String(maxElements),
    });
  }

  private sendCode(totpSecret: string): Promise<Response> {
    let code: string;
    try {
      code = totp(totpSecret, this.clock.now());
    } catch (err) {
      if (err instanceof InvalidTotpSecretError)
        throw new AvanzaAuthError(err.message);
      throw err;
    }
    return this.send("POST", TOTP_PATH, {
      body: { method: "TOTP", totpCode: code },
    });
  }

  private async get(
    path: string,
    query?: Record<string, string>,
  ): Promise<unknown> {
    if (this.token === null)
      throw new AvanzaError("Avanza didn't start a session.");
    const response = await this.send("GET", path, {
      query,
      headers: { "X-SecurityToken": this.token },
    });
    if (response.status === 401)
      throw new AvanzaAuthError("Avanza ended the session.");
    check(response, path);
    return readJson(response, path);
  }

  private async send(
    method: "GET" | "POST",
    path: string,
    options: {
      body?: unknown;
      query?: Record<string, string>;
      headers?: Record<string, string>;
    },
  ): Promise<Response> {
    const url = new URL(path, BASE_URL);
    for (const [key, value] of Object.entries(options.query ?? {}))
      url.searchParams.set(key, value);
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      ...options.headers,
    };
    if (this.cookies.size > 0)
      headers.Cookie = [...this.cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    if (options.body !== undefined)
      headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      response = await this.fetch(url.toString(), {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AvanzaError("Couldn't reach Avanza.");
    }
    this.keepCookies(response);
    return response;
  }

  private keepCookies(response: Response): void {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
  }
}

function unexpected(path: string): AvanzaError {
  return new AvanzaError(`Avanza answered unexpectedly for ${path}.`);
}

// Only the status and path: Avanza's error bodies and the request can carry account details.
function check(response: Response, path: string): void {
  if (response.status < 200 || response.status >= 300)
    throw new AvanzaError(`Avanza answered ${response.status} for ${path}.`);
}

async function readJson(response: Response, path: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw unexpected(path);
  }
}

export function parseDay(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day)
    return null;
  return ms / DAY_MS;
}

export function formatDay(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

/** The local calendar day, not UTC's: Stockholm is ahead of UTC. */
export function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function transactionRows(body: unknown): unknown[] {
  if (!isRecord(body)) throw unexpected(TRANSACTIONS_PATH);
  const rows = body.transactions ?? [];
  if (!Array.isArray(rows)) throw unexpected(TRANSACTIONS_PATH);
  return rows;
}

/** Every transaction in [from, to]; Avanza caps a response, so a full one is split until none are. */
export async function allTransactions(
  client: AvanzaClient,
  from: number,
  to: number,
): Promise<unknown[]> {
  const rows = transactionRows(
    await client.transactions(formatDay(from), formatDay(to), PAGE_LIMIT),
  );
  if (rows.length < PAGE_LIMIT) return rows;
  if (from >= to)
    throw new AvanzaError(
      `More than ${PAGE_LIMIT} transactions on ${formatDay(from)}.`,
    );
  const middle = from + Math.floor((to - from) / 2);
  return [
    ...(await allTransactions(client, from, middle)),
    ...(await allTransactions(client, middle + 1, to)),
  ];
}

export function toFailure(err: unknown): AvanzaFailure {
  if (err instanceof AvanzaAuthError)
    return { ok: false, reason: "rejected", message: err.message };
  if (err instanceof AvanzaError)
    return { ok: false, reason: "unreachable", message: err.message };
  return {
    ok: false,
    reason: "unreachable",
    message: "Something went wrong talking to Avanza.",
  };
}

export interface Encryption {
  isRealEncryptionAvailable: () => Promise<boolean>;
  encrypt: (plainText: string) => Promise<Buffer>;
  decrypt: (
    data: Buffer,
  ) => Promise<{ result: string; shouldReEncrypt: boolean }>;
}

export class NoKeychainError extends Error {
  constructor() {
    super(
      "This computer has no keychain to keep the Avanza login in, so it can't be saved.",
    );
    this.name = "NoKeychainError";
  }
}

function asLogin(value: unknown): AvanzaLogin | null {
  if (!isRecord(value)) return null;
  const { username, password, totpSecret } = value;
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    typeof totpSecret !== "string" ||
    !username ||
    !password ||
    !totpSecret
  )
    return null;
  return { username, password, totpSecret };
}

/** The login, encrypted by the OS keychain; never written without one. */
export class AvanzaLoginStore {
  constructor(
    private readonly path: string,
    private readonly encryption: Encryption,
  ) {}

  canStore(): Promise<boolean> {
    return this.encryption.isRealEncryptionAvailable();
  }

  async save(login: AvanzaLogin): Promise<void> {
    if (!(await this.canStore())) throw new NoKeychainError();
    const { username, password, totpSecret } = login;
    const encrypted = await this.encryption.encrypt(
      JSON.stringify({ username, password, totpSecret }),
    );
    const tmp = `${this.path}.tmp`;
    try {
      await fs.writeFile(tmp, encrypted, { mode: 0o600 });
      await fs.rename(tmp, this.path);
      await fs.chmod(this.path, 0o600);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  async load(): Promise<AvanzaLogin | null> {
    if (!(await this.canStore())) return null;
    let data: Buffer;
    try {
      data = await fs.readFile(this.path);
    } catch {
      return null;
    }
    let login: AvanzaLogin | null;
    let shouldReEncrypt: boolean;
    try {
      const decrypted = await this.encryption.decrypt(data);
      login = asLogin(JSON.parse(decrypted.result));
      shouldReEncrypt = decrypted.shouldReEncrypt;
    } catch {
      return null;
    }
    if (login && shouldReEncrypt) await this.save(login).catch(() => {});
    return login;
  }

  async forget(): Promise<void> {
    await fs.rm(this.path, { force: true });
    await fs.rm(`${this.path}.tmp`, { force: true });
  }
}

const NOT_SIGNED_IN: AvanzaFailure = {
  ok: false,
  reason: "not_signed_in",
  message: "Sign in to Avanza on this computer first.",
};

export interface AvanzaDeps extends AvanzaClock {
  fetch: Fetch;
  /** Today as a local YYYY-MM-DD day. */
  today: () => string;
}

/** What the IPC handlers expose; one Avanza login runs at a time. */
export class AvanzaSync {
  private readonly lock = new KeyedMutex();

  constructor(
    private readonly store: AvanzaLoginStore,
    private readonly deps: AvanzaDeps,
  ) {}

  status(): Promise<{ username: string | null }> {
    return this.serial(async () => ({
      username: (await this.store.load())?.username ?? null,
    }));
  }

  async saveLogin(
    input: unknown,
  ): Promise<AvanzaResult<{ username: string; overview: unknown }>> {
    const parsed = asLogin(input);
    if (!parsed)
      throw new TypeError(
        "An Avanza login needs a username, password and TOTP secret.",
      );
    const login = {
      ...parsed,
      totpSecret: normalizeTotpSecret(parsed.totpSecret),
    };
    return this.serial(async () => {
      if (!(await this.store.canStore())) throw new NoKeychainError();
      let overview: unknown;
      try {
        const client = this.client();
        await client.login(login);
        overview = await client.overview();
      } catch (err) {
        return toFailure(err);
      }
      await this.store.save(login);
      return { ok: true, username: login.username, overview };
    });
  }

  async fetch(input: unknown): Promise<AvanzaResult<AvanzaSnapshot>> {
    const from = isRecord(input) ? input.from : undefined;
    const fromDay = typeof from === "string" ? parseDay(from) : null;
    if (from !== null && fromDay === null)
      throw new TypeError("`from` must be null or a YYYY-MM-DD day.");
    return this.serial(async () => {
      const login = await this.store.load();
      if (!login) return NOT_SIGNED_IN;
      try {
        const client = this.client();
        await client.login(login);
        const overview = await client.overview();
        if (fromDay === null)
          return {
            ok: true,
            username: login.username,
            overview,
            positions: null,
            transactions: [],
            fetchedFrom: null,
          };
        const today = parseDay(this.deps.today());
        if (today === null) throw new Error("Invalid local day.");
        const positions = await client.positions();
        const transactions = await allTransactions(client, fromDay, today);
        return {
          ok: true,
          username: login.username,
          overview,
          positions,
          transactions,
          fetchedFrom: formatDay(fromDay),
        };
      } catch (err) {
        return toFailure(err);
      }
    });
  }

  forget(): Promise<void> {
    return this.serial(() => this.store.forget());
  }

  private client(): AvanzaClient {
    return new AvanzaClient(this.deps.fetch, this.deps);
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    return this.lock.run("avanza", task);
  }
}
