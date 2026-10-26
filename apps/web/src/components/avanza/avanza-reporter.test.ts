import type { AvanzaConnectionSchema } from "@bessel/client";
import { describe, expect, it } from "vitest";
import { isAvanzaSyncDue, SYNC_EVERY_MS } from "./avanza-reporter";

const NOW = new Date("2026-10-26T12:00:00Z");

function connection(
  extra: Partial<AvanzaConnectionSchema> = {},
): AvanzaConnectionSchema {
  return {
    id: "c1",
    username: "123456",
    credentials_rejected: false,
    last_synced_at: new Date(NOW.getTime() - SYNC_EVERY_MS),
    sync_error: null,
    sync_from: new Date("2026-10-12T00:00:00Z"),
    accounts: [],
    ...extra,
  };
}

describe("isAvanzaSyncDue", () => {
  it("signs in once the last import is six hours old", () => {
    expect(isAvanzaSyncDue(connection(), NOW)).toBe(true);
    expect(
      isAvanzaSyncDue(
        connection({
          last_synced_at: new Date(NOW.getTime() - SYNC_EVERY_MS + 60_000),
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("signs in right away when a linked account was never imported", () => {
    expect(isAvanzaSyncDue(connection({ last_synced_at: null }), NOW)).toBe(
      true,
    );
  });

  it("imports a newly linked account without waiting six hours", () => {
    const account = {
      id: "a1",
      name: "ISK",
      account_type: "INVESTERINGSSPARKONTO",
      cash_balance: 0,
    };
    const recent = new Date(NOW.getTime() - 60_000);
    expect(
      isAvanzaSyncDue(
        connection({
          last_synced_at: recent,
          accounts: [
            { ...account, bank_account_id: "b1", last_synced_at: null },
          ],
        }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isAvanzaSyncDue(
        connection({
          last_synced_at: recent,
          accounts: [
            { ...account, bank_account_id: null, last_synced_at: null },
            {
              ...account,
              id: "a2",
              bank_account_id: "b2",
              last_synced_at: recent,
            },
          ],
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("never retries a login Avanza turned down", () => {
    expect(
      isAvanzaSyncDue(
        connection({ credentials_rejected: true, last_synced_at: null }),
        NOW,
      ),
    ).toBe(false);
  });

  it("waits until an account is linked or Avanza is connected", () => {
    expect(
      isAvanzaSyncDue(
        connection({ sync_from: null, last_synced_at: null }),
        NOW,
      ),
    ).toBe(false);
    expect(isAvanzaSyncDue(null, NOW)).toBe(false);
  });
});
