// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAvanza: vi.fn(),
  importAvanza: vi.fn(),
  reportAvanzaSyncFailed: vi.fn(),
}));
vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  ...api,
}));

const { avanzaErrorMessage, connectAvanzaFromDesktop, syncAvanzaFromDesktop } =
  await import("./avanza-sync");

const desktop = {
  status: vi.fn(),
  saveLogin: vi.fn(),
  fetch: vi.fn(),
  forget: vi.fn(),
};

beforeEach(() => {
  (window as unknown as { electron: unknown }).electron = { avanza: desktop };
  api.importAvanza.mockResolvedValue({ data: { id: "c1" } });
  api.reportAvanzaSyncFailed.mockResolvedValue({});
  api.getAvanza.mockResolvedValue({
    data: {
      available: true,
      connection: { sync_from: new Date("2026-10-12T00:00:00Z") },
    },
  });
});

afterEach(() => {
  vi.resetAllMocks();
  delete (window as unknown as { electron?: unknown }).electron;
});

describe("syncAvanzaFromDesktop", () => {
  it("reads from the day the server needs and uploads the rows as one page", async () => {
    desktop.fetch.mockResolvedValue({
      ok: true,
      username: "123456",
      overview: { categories: [] },
      positions: { withOrderbook: [] },
      transactions: [{ id: "t1" }, { id: "t2" }],
      fetchedFrom: "2026-10-12",
    });

    await syncAvanzaFromDesktop();

    expect(desktop.fetch).toHaveBeenCalledWith({ from: "2026-10-12" });
    const { body } = api.importAvanza.mock.calls[0][0];
    expect(body.transactions).toEqual([
      { transactions: [{ id: "t1" }, { id: "t2" }] },
    ]);
    expect(body.fetched_from.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(body.positions).toEqual({ withOrderbook: [] });
  });

  it("asks only for the overview while nothing is linked", async () => {
    api.getAvanza.mockResolvedValue({
      data: { available: true, connection: { sync_from: null } },
    });
    desktop.fetch.mockResolvedValue({
      ok: true,
      username: "123456",
      overview: {},
      positions: null,
      transactions: [],
      fetchedFrom: null,
    });

    await syncAvanzaFromDesktop();

    expect(desktop.fetch).toHaveBeenCalledWith({ from: null });
    const { body } = api.importAvanza.mock.calls[0][0];
    expect(body.transactions).toEqual([]);
    expect(body.fetched_from).toBeNull();
  });

  it("tells the server Avanza turned the login down, and imports nothing", async () => {
    desktop.fetch.mockResolvedValue({
      ok: false,
      reason: "rejected",
      message: "Avanza didn't accept the username or password.",
    });

    await expect(syncAvanzaFromDesktop()).rejects.toThrow(
      "Avanza didn't accept the username or password.",
    );
    expect(api.reportAvanzaSyncFailed).toHaveBeenCalledWith(
      expect.objectContaining({ body: { reason: "rejected" } }),
    );
    expect(api.importAvanza).not.toHaveBeenCalled();
  });

  it("doesn't report a failure when this computer has no login", async () => {
    desktop.fetch.mockResolvedValue({
      ok: false,
      reason: "not_signed_in",
      message: "Sign in to Avanza on this computer first.",
    });

    await expect(syncAvanzaFromDesktop()).rejects.toThrow();
    expect(api.reportAvanzaSyncFailed).not.toHaveBeenCalled();
  });
});

describe("connectAvanzaFromDesktop", () => {
  it("uploads the accounts a new login sees, never the login", async () => {
    desktop.saveLogin.mockResolvedValue({
      ok: true,
      username: "123456",
      overview: { categories: [] },
    });

    await connectAvanzaFromDesktop({
      username: "123456",
      password: "hunter2",
      totpSecret: "JBSWY3DPEHPK3PXP",
    });

    const { body } = api.importAvanza.mock.calls[0][0];
    expect(body).toEqual({
      username: "123456",
      overview: { categories: [] },
      positions: null,
      transactions: [],
      fetched_from: null,
    });
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("stops at a login Avanza turned down", async () => {
    desktop.saveLogin.mockResolvedValue({
      ok: false,
      reason: "rejected",
      message: "Avanza didn't accept the code from the TOTP secret.",
    });

    await expect(
      connectAvanzaFromDesktop({
        username: "1",
        password: "x",
        totpSecret: "y",
      }),
    ).rejects.toThrow("Avanza didn't accept the code from the TOTP secret.");
    expect(api.importAvanza).not.toHaveBeenCalled();
  });
});

describe("avanzaErrorMessage", () => {
  it("unwraps a message the desktop app threw over IPC", () => {
    const error = new Error(
      "Error invoking remote method 'avanza:saveLogin': Error: This computer has no keychain to keep the Avanza login in, so it can't be saved.",
    );
    expect(avanzaErrorMessage(error, "fallback")).toBe(
      "This computer has no keychain to keep the Avanza login in, so it can't be saved.",
    );
  });

  it("uses the API's detail for an API error", () => {
    expect(avanzaErrorMessage({ detail: "Not available" }, "fallback")).toBe(
      "Not available",
    );
  });
});
