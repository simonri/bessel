import { describe, expect, it } from "vitest";
import { accountsPollInterval } from "./use-calendar-data";

const MINUTE = 60_000;

describe("accountsPollInterval", () => {
  const now = 100 * MINUTE;

  it("polls while an account waits on its first sync", () => {
    expect(accountsPollInterval(now - MINUTE, 0, now)).toBe(3_000);
  });

  it("gives up on a first sync that never finishes", () => {
    expect(accountsPollInterval(now - 3 * MINUTE, 0, now)).toBe(false);
  });

  it("polls for a while after a connect or sync", () => {
    expect(accountsPollInterval(null, now + MINUTE, now)).toBe(3_000);
    expect(accountsPollInterval(null, now - 1, now)).toBe(false);
  });
});
