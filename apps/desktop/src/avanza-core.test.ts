import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AvanzaLoginStore,
  AvanzaSync,
  type Encryption,
  LOGIN_PATH,
  NoKeychainError,
  OVERVIEW_PATH,
  POSITIONS_PATH,
  TOTP_PATH,
  TRANSACTIONS_PATH,
} from "./avanza-core.js";

const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const LOGIN = { username: "anna", password: "hunter2", totpSecret: SECRET };
// At 59 s the RFC 6238 key gives 287082; one step later (61 s) it gives 359152.
const START_MS = 59_000;

interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  init: RequestInit;
}

type Reply = Response | ((call: Call) => Response);

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

const TOTP_REQUIRED = () =>
  json(
    { twoFactorLogin: { method: "TOTP" } },
    { headers: { "Set-Cookie": "AZACSRF=abc; Path=/; HttpOnly" } },
  );
const TOKEN = () => json({}, { headers: { "X-SecurityToken": "tok-1" } });
const OVERVIEW = { categories: [{ name: "Sparande" }] };
const OVERVIEW_REPLY = () => json(OVERVIEW);

class FakeAvanza {
  readonly calls: Call[] = [];
  private readonly routes = new Map<string, Reply[]>();

  on(method: string, path: string, ...replies: Reply[]): this {
    this.routes.set(`${method} ${path}`, replies);
    return this;
  }

  signedIn(): this {
    return this.on("POST", LOGIN_PATH, TOTP_REQUIRED)
      .on("POST", TOTP_PATH, TOKEN)
      .on("GET", OVERVIEW_PATH, OVERVIEW_REPLY);
  }

  paths(): string[] {
    return this.calls.map((c) => `${c.method} ${c.path}`);
  }

  readonly fetch = async (
    url: string,
    init: RequestInit,
  ): Promise<Response> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://www.avanza.se");
    const call: Call = {
      method: init.method ?? "GET",
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams),
      headers: init.headers as Record<string, string>,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      init,
    };
    this.calls.push(call);
    const replies = this.routes.get(`${call.method} ${call.path}`);
    if (!replies?.length)
      throw new Error(`unexpected ${call.method} ${call.path}`);
    const reply = replies.length > 1 ? replies.shift() : replies[0];
    return typeof reply === "function" ? reply(call) : (reply as Response);
  };
}

class FakeClock {
  nowMs = START_MS;
  readonly sleeps: number[] = [];
  now = () => this.nowMs;
  sleep = async (ms: number) => {
    this.sleeps.push(ms);
    this.nowMs += ms;
  };
}

const KEY = 0x5a;
const fakeEncryption = (available = true): Encryption => ({
  isRealEncryptionAvailable: async () => available,
  encrypt: async (text) =>
    Buffer.concat([
      Buffer.from("enc:"),
      Buffer.from(text, "utf8").map((b) => b ^ KEY),
    ]),
  decrypt: async (data) => {
    if (data.subarray(0, 4).toString() !== "enc:") throw new Error("bad");
    return {
      result: Buffer.from(data.subarray(4).map((b) => b ^ KEY)).toString(),
      shouldReEncrypt: false,
    };
  },
});

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "avanza-test-"));
  file = path.join(dir, "avanza-login.bin");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function setup(options: { encryption?: Encryption; today?: string } = {}) {
  const avanza = new FakeAvanza();
  const clock = new FakeClock();
  const store = new AvanzaLoginStore(
    file,
    options.encryption ?? fakeEncryption(),
  );
  const sync = new AvanzaSync(store, {
    fetch: avanza.fetch,
    now: clock.now,
    sleep: clock.sleep,
    today: () => options.today ?? "2026-01-10",
  });
  return { avanza, clock, store, sync };
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

describe("logging in", () => {
  it("sends the credentials, then the TOTP code, then reads with the token", async () => {
    const { avanza, sync } = setup();
    avanza.signedIn();

    const result = await sync.saveLogin(LOGIN);

    expect(result).toEqual({ ok: true, username: "anna", overview: OVERVIEW });
    expect(avanza.paths()).toEqual([
      `POST ${LOGIN_PATH}`,
      `POST ${TOTP_PATH}`,
      `GET ${OVERVIEW_PATH}`,
    ]);
    const [credentials, code, overview] = avanza.calls;
    expect(credentials.body).toEqual({
      maxInactiveMinutes: 30,
      username: "anna",
      password: "hunter2",
    });
    expect(code.body).toEqual({ method: "TOTP", totpCode: "287082" });
    for (const call of avanza.calls) {
      expect(call.headers["User-Agent"]).toBe("Bessel (personal dashboard)");
      expect(call.init.redirect).toBe("manual");
      expect(call.init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(credentials.headers["Content-Type"]).toBe("application/json");
    expect(code.headers["Content-Type"]).toBe("application/json");
    expect(credentials.headers["X-SecurityToken"]).toBeUndefined();
    expect(overview.headers["X-SecurityToken"]).toBe("tok-1");
  });

  it("sends the cookies Avanza set on every later request", async () => {
    const { avanza, sync } = setup();
    avanza.signedIn();

    await sync.saveLogin(LOGIN);

    const [credentials, code, overview] = avanza.calls;
    expect(credentials.headers.Cookie).toBeUndefined();
    expect(code.headers.Cookie).toBe("AZACSRF=abc");
    expect(overview.headers.Cookie).toBe("AZACSRF=abc");
  });

  it("takes the token from the credentials answer when no second factor is asked", async () => {
    const { avanza, sync } = setup();
    avanza
      .on("POST", LOGIN_PATH, () =>
        json(
          { twoFactorLogin: null },
          { headers: { "X-SecurityToken": "t0" } },
        ),
      )
      .on("GET", OVERVIEW_PATH, OVERVIEW_REPLY);

    const result = await sync.saveLogin(LOGIN);

    expect(result.ok).toBe(true);
    expect(avanza.paths()).toEqual([
      `POST ${LOGIN_PATH}`,
      `GET ${OVERVIEW_PATH}`,
    ]);
    expect(avanza.calls[1].headers["X-SecurityToken"]).toBe("t0");
  });

  it("retries a code Avanza just saw once, with the next code", async () => {
    const { avanza, clock, sync } = setup();
    avanza
      .signedIn()
      .on("POST", TOTP_PATH, new Response(null, { status: 401 }), TOKEN);

    const result = await sync.saveLogin(LOGIN);

    expect(result.ok).toBe(true);
    expect(clock.sleeps).toEqual([2_000]);
    const codes = avanza.calls
      .filter((c) => c.path === TOTP_PATH)
      .map((c) => (c.body as { totpCode: string }).totpCode);
    expect(codes).toEqual(["287082", "359152"]);
  });

  it("is rejected when the next code fails too", async () => {
    const { avanza, sync } = setup();
    avanza
      .signedIn()
      .on("POST", TOTP_PATH, () => new Response(null, { status: 401 }));

    const result = await sync.saveLogin(LOGIN);

    expect(result).toEqual({
      ok: false,
      reason: "rejected",
      message: "Avanza didn't accept the code from the TOTP secret.",
    });
    expect(
      avanza.paths().filter((p) => p === `POST ${TOTP_PATH}`),
    ).toHaveLength(2);
  });

  it("is rejected on a wrong username or password, without sending a code", async () => {
    const { avanza, sync } = setup();
    avanza.on("POST", LOGIN_PATH, new Response(null, { status: 401 }));

    const result = await sync.saveLogin(LOGIN);

    expect(result).toEqual({
      ok: false,
      reason: "rejected",
      message: "Avanza didn't accept the username or password.",
    });
    expect(avanza.paths()).toEqual([`POST ${LOGIN_PATH}`]);
  });

  it("is rejected when Avanza asks for a second factor other than TOTP", async () => {
    const { avanza, sync } = setup();
    avanza.on(
      "POST",
      LOGIN_PATH,
      json({ twoFactorLogin: { method: "BANKID" } }),
    );

    const result = await sync.saveLogin(LOGIN);

    expect(result).toMatchObject({ ok: false, reason: "rejected" });
    expect(avanza.paths()).toEqual([`POST ${LOGIN_PATH}`]);
  });

  it("is rejected for an invalid TOTP secret, without sending a code", async () => {
    const { avanza, sync } = setup();
    avanza.signedIn();

    const result = await sync.saveLogin({
      ...LOGIN,
      totpSecret: "not base32!",
    });

    expect(result).toEqual({
      ok: false,
      reason: "rejected",
      message: "The TOTP secret isn't valid.",
    });
    expect(avanza.paths()).toEqual([`POST ${LOGIN_PATH}`]);
  });

  it("is rejected when Avanza ends the session on a read", async () => {
    const { avanza, sync } = setup();
    avanza
      .signedIn()
      .on("GET", OVERVIEW_PATH, new Response(null, { status: 401 }));

    expect(await sync.saveLogin(LOGIN)).toEqual({
      ok: false,
      reason: "rejected",
      message: "Avanza ended the session.",
    });
  });

  it("reports an error status by status and path only, never the body", async () => {
    const { avanza, sync } = setup();
    avanza.on(
      "POST",
      LOGIN_PATH,
      new Response("account 9988-1234567 locked", { status: 500 }),
    );

    expect(await sync.saveLogin(LOGIN)).toEqual({
      ok: false,
      reason: "unreachable",
      message: `Avanza answered 500 for ${LOGIN_PATH}.`,
    });
  });

  it("treats a redirect as an error rather than following it", async () => {
    const { avanza, sync } = setup();
    avanza.on(
      "POST",
      LOGIN_PATH,
      new Response(null, { status: 302, headers: { Location: "/login" } }),
    );

    expect(await sync.saveLogin(LOGIN)).toMatchObject({
      ok: false,
      reason: "unreachable",
      message: `Avanza answered 302 for ${LOGIN_PATH}.`,
    });
  });

  it("is unreachable when the network fails", async () => {
    const { store } = setup();
    const failing = new AvanzaSync(store, {
      fetch: async () => {
        throw new TypeError(
          "fetch failed: getaddrinfo ENOTFOUND www.avanza.se",
        );
      },
      now: () => START_MS,
      sleep: async () => {},
      today: () => "2026-01-10",
    });

    expect(await failing.saveLogin(LOGIN)).toEqual({
      ok: false,
      reason: "unreachable",
      message: "Couldn't reach Avanza.",
    });
  });

  it("doesn't pass on a body that isn't JSON", async () => {
    const { avanza, sync } = setup();
    avanza
      .signedIn()
      .on("GET", OVERVIEW_PATH, new Response("<html>secret 42</html>"));

    const result = await sync.saveLogin(LOGIN);

    expect(result).toEqual({
      ok: false,
      reason: "unreachable",
      message: `Avanza answered unexpectedly for ${OVERVIEW_PATH}.`,
    });
  });

  it("fails a read when Avanza gave no security token", async () => {
    const { avanza, sync } = setup();
    avanza.signedIn().on("POST", TOTP_PATH, json({}));

    expect(await sync.saveLogin(LOGIN)).toMatchObject({
      ok: false,
      reason: "unreachable",
    });
    expect(avanza.paths()).not.toContain(`GET ${OVERVIEW_PATH}`);
  });
});

describe("saveLogin", () => {
  it("keeps the login, with the secret normalised, only after Avanza accepted it", async () => {
    const { avanza, store, sync } = setup();
    avanza.signedIn();

    const result = await sync.saveLogin({
      ...LOGIN,
      totpSecret: "gezd gnbv gy3t qojq gezd gnbv gy3t qojq",
    });

    expect(result.ok).toBe(true);
    expect(await store.load()).toEqual(LOGIN);
  });

  it("never hands the password or secret back", async () => {
    const { avanza, sync } = setup();
    avanza.signedIn();

    const text = JSON.stringify(await sync.saveLogin(LOGIN));

    expect(text).not.toContain("hunter2");
    expect(text).not.toContain(SECRET);
  });

  it("keeps nothing when Avanza turns the login down", async () => {
    const { avanza, sync } = setup();
    avanza.on("POST", LOGIN_PATH, new Response(null, { status: 401 }));

    await sync.saveLogin(LOGIN);

    expect(await exists(file)).toBe(false);
    expect(await sync.status()).toEqual({ username: null });
  });

  it("refuses before contacting Avanza when there is no keychain", async () => {
    const { avanza, sync } = setup({ encryption: fakeEncryption(false) });
    avanza.signedIn();

    await expect(sync.saveLogin(LOGIN)).rejects.toThrow(NoKeychainError);

    expect(avanza.calls).toEqual([]);
    expect(await exists(file)).toBe(false);
  });

  it("rejects input that isn't a full login", async () => {
    const { avanza, sync } = setup();

    await expect(
      sync.saveLogin({ username: "anna", password: "x" }),
    ).rejects.toThrow(TypeError);
    await expect(sync.saveLogin({ ...LOGIN, password: 123 })).rejects.toThrow(
      TypeError,
    );
    await expect(sync.saveLogin({ ...LOGIN, username: "" })).rejects.toThrow(
      TypeError,
    );
    expect(avanza.calls).toEqual([]);
  });
});

describe("fetch", () => {
  const rows = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `${tag}-${i}` }));

  it("is not signed in without a stored login", async () => {
    const { avanza, sync } = setup();

    expect(await sync.fetch({ from: null })).toEqual({
      ok: false,
      reason: "not_signed_in",
      message: "Sign in to Avanza on this computer first.",
    });
    expect(avanza.calls).toEqual([]);
  });

  it("reads only the overview when from is null", async () => {
    const { avanza, store, sync } = setup();
    await store.save(LOGIN);
    avanza.signedIn();

    expect(await sync.fetch({ from: null })).toEqual({
      ok: true,
      username: "anna",
      overview: OVERVIEW,
      positions: null,
      transactions: [],
      fetchedFrom: null,
    });
    expect(avanza.paths()).toEqual([
      `POST ${LOGIN_PATH}`,
      `POST ${TOTP_PATH}`,
      `GET ${OVERVIEW_PATH}`,
    ]);
    expect(avanza.calls[0].body).toMatchObject({
      username: "anna",
      password: "hunter2",
    });
  });

  it("reads positions and transactions from `from` to today", async () => {
    const { avanza, store, sync } = setup({ today: "2026-01-10" });
    await store.save(LOGIN);
    const positions = { withOrderbook: [{ id: 1 }] };
    avanza
      .signedIn()
      .on("GET", POSITIONS_PATH, () => json(positions))
      .on("GET", TRANSACTIONS_PATH, () => json({ transactions: rows(3, "a") }));

    const result = await sync.fetch({ from: "2026-01-01" });

    expect(result).toEqual({
      ok: true,
      username: "anna",
      overview: OVERVIEW,
      positions,
      transactions: rows(3, "a"),
      fetchedFrom: "2026-01-01",
    });
    expect(avanza.calls.at(-1)?.query).toEqual({
      from: "2026-01-01",
      to: "2026-01-10",
      maxElements: "1000",
    });
  });

  it("splits a full window in half until no page is full", async () => {
    const { avanza, store, sync } = setup({ today: "2026-01-10" });
    await store.save(LOGIN);
    const pages: Record<string, unknown[]> = {
      "2026-01-01..2026-01-10": rows(1000, "full"),
      "2026-01-01..2026-01-05": rows(1000, "full"),
      "2026-01-01..2026-01-03": rows(2, "a"),
      "2026-01-04..2026-01-05": rows(999, "b"),
      "2026-01-06..2026-01-10": rows(1, "c"),
    };
    avanza
      .signedIn()
      .on("GET", POSITIONS_PATH, () => json({}))
      .on("GET", TRANSACTIONS_PATH, (call) => {
        const page = pages[`${call.query.from}..${call.query.to}`];
        if (!page)
          throw new Error(`unexpected window ${JSON.stringify(call.query)}`);
        return json({ transactions: page });
      });

    const result = await sync.fetch({ from: "2026-01-01" });

    expect(
      avanza.calls
        .filter((c) => c.path === TRANSACTIONS_PATH)
        .map((c) => `${c.query.from}..${c.query.to}`),
    ).toEqual(Object.keys(pages));
    expect(result).toMatchObject({
      ok: true,
      transactions: [...rows(2, "a"), ...rows(999, "b"), ...rows(1, "c")],
    });
  });

  it("fails when a single day is still full", async () => {
    const { avanza, store, sync } = setup({ today: "2026-01-02" });
    await store.save(LOGIN);
    avanza
      .signedIn()
      .on("GET", POSITIONS_PATH, () => json({}))
      .on("GET", TRANSACTIONS_PATH, () =>
        json({ transactions: rows(1000, "x") }),
      );

    expect(await sync.fetch({ from: "2026-01-02" })).toEqual({
      ok: false,
      reason: "unreachable",
      message: "More than 1000 transactions on 2026-01-02.",
    });
  });

  it("treats a page without transactions as empty", async () => {
    const { avanza, store, sync } = setup();
    await store.save(LOGIN);
    avanza
      .signedIn()
      .on("GET", POSITIONS_PATH, () => json({}))
      .on("GET", TRANSACTIONS_PATH, () => json({}));

    expect(await sync.fetch({ from: "2026-01-01" })).toMatchObject({
      ok: true,
      transactions: [],
    });
  });

  it("rejects a `from` that isn't a real day", async () => {
    const { sync } = setup();

    await expect(sync.fetch({ from: "2026-02-30" })).rejects.toThrow(TypeError);
    await expect(sync.fetch({ from: "2026-1-5" })).rejects.toThrow(TypeError);
    await expect(sync.fetch({})).rejects.toThrow(TypeError);
  });

  it("runs one Avanza login at a time", async () => {
    const { avanza, store, sync } = setup();
    await store.save(LOGIN);
    avanza.signedIn();

    await Promise.all([sync.fetch({ from: null }), sync.fetch({ from: null })]);

    const one = [
      `POST ${LOGIN_PATH}`,
      `POST ${TOTP_PATH}`,
      `GET ${OVERVIEW_PATH}`,
    ];
    expect(avanza.paths()).toEqual([...one, ...one]);
  });

  it("is rejected when the stored login stops working, and keeps it", async () => {
    const { avanza, store, sync } = setup();
    await store.save(LOGIN);
    avanza.on("POST", LOGIN_PATH, new Response(null, { status: 401 }));

    expect(await sync.fetch({ from: null })).toMatchObject({
      ok: false,
      reason: "rejected",
    });
    expect(await sync.status()).toEqual({ username: "anna" });
  });
});

describe("status and forget", () => {
  it("reports the stored username until forgotten", async () => {
    const { store, sync } = setup();
    await store.save(LOGIN);

    // What a save interrupted by a crash leaves behind.
    await fs.writeFile(`${file}.tmp`, "partial");

    expect(await sync.status()).toEqual({ username: "anna" });
    await sync.forget();
    expect(await exists(`${file}.tmp`)).toBe(false);
    expect(await sync.status()).toEqual({ username: null });
    expect(await exists(file)).toBe(false);
  });

  it("waits for a login in flight before forgetting", async () => {
    const { avanza, sync } = setup();
    avanza.signedIn();

    const saving = sync.saveLogin(LOGIN);
    await sync.forget();
    await saving;

    expect(await exists(file)).toBe(false);
  });
});

describe("AvanzaLoginStore", () => {
  it("writes only encrypted bytes, readable by the owner alone", async () => {
    const store = new AvanzaLoginStore(file, fakeEncryption());

    await store.save(LOGIN);

    const bytes = await fs.readFile(file);
    for (const secret of ["anna", "hunter2", SECRET, "totpSecret"])
      expect(bytes.includes(Buffer.from(secret))).toBe(false);
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    expect(await store.load()).toEqual(LOGIN);
    expect(await exists(`${file}.tmp`)).toBe(false);
  });

  it("refuses to write without real encryption", async () => {
    const store = new AvanzaLoginStore(file, fakeEncryption(false));

    await expect(store.save(LOGIN)).rejects.toThrow(NoKeychainError);

    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("reads nothing back without real encryption", async () => {
    await new AvanzaLoginStore(file, fakeEncryption()).save(LOGIN);

    expect(
      await new AvanzaLoginStore(file, fakeEncryption(false)).load(),
    ).toBeNull();
  });

  it("treats a file it can't decrypt as no login", async () => {
    await fs.writeFile(file, "garbage");

    expect(
      await new AvanzaLoginStore(file, fakeEncryption()).load(),
    ).toBeNull();
  });

  it("re-encrypts when the keychain asks for it", async () => {
    const base = fakeEncryption();
    let encrypts = 0;
    const store = new AvanzaLoginStore(file, {
      ...base,
      encrypt: (text) => {
        encrypts++;
        return base.encrypt(text);
      },
      decrypt: async (data) => ({
        ...(await base.decrypt(data)),
        shouldReEncrypt: true,
      }),
    });
    await store.save(LOGIN);

    expect(await store.load()).toEqual(LOGIN);
    expect(encrypts).toBe(2);
  });
});
