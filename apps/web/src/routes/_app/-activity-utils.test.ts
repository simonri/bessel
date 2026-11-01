import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dayStartingAt, localDayBounds } from "./-activity-utils";

const at = (ts: number) => new Date(ts * 1000);

describe("localDayBounds", () => {
  it("runs midnight to midnight by default", () => {
    const [start, end] = localDayBounds(new Date(2026, 9, 4, 15));
    expect(at(start)).toEqual(new Date(2026, 9, 4));
    expect(at(end)).toEqual(new Date(2026, 9, 5));
  });

  it("can start the day later", () => {
    const [start, end] = localDayBounds(new Date(2026, 9, 4, 15), 6);
    expect(at(start)).toEqual(new Date(2026, 9, 4, 6));
    expect(at(end)).toEqual(new Date(2026, 9, 5, 6));
  });
});

describe("dayStartingAt", () => {
  it("is still the day before until the start hour", () => {
    expect(dayStartingAt(new Date(2026, 9, 4, 5, 59), 6)).toEqual(
      new Date(2026, 9, 3),
    );
    expect(dayStartingAt(new Date(2026, 9, 4, 6), 6)).toEqual(
      new Date(2026, 9, 4),
    );
  });

  describe("on DST days", () => {
    beforeAll(() => {
      vi.stubEnv("TZ", "Europe/Stockholm");
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("switches at 6am on the clock after the clocks spring forward", () => {
      expect(dayStartingAt(new Date(2026, 2, 29, 6, 30), 6)).toEqual(
        new Date(2026, 2, 29),
      );
    });

    it("switches at 6am on the clock after the clocks fall back", () => {
      expect(dayStartingAt(new Date(2026, 9, 25, 5, 30), 6)).toEqual(
        new Date(2026, 9, 24),
      );
    });
  });
});
