import { describe, expect, it } from "vitest";
import {
  fromWallClock,
  shortOffsetLabel,
  timeZoneOptions,
  toWallClock,
} from "./calendar-timezone";

const INSTANT = new Date("2026-10-07T15:00:00Z");

describe("toWallClock", () => {
  it("reads the instant as wall-clock time in the zone", () => {
    const tokyo = toWallClock(INSTANT, "Asia/Tokyo");
    expect([tokyo.getDate(), tokyo.getHours(), tokyo.getMinutes()]).toEqual([
      8, 0, 0,
    ]);
    const ny = toWallClock(INSTANT, "America/New_York");
    expect([ny.getDate(), ny.getHours()]).toEqual([7, 11]);
  });

  it("handles half-hour offsets", () => {
    const kolkata = toWallClock(INSTANT, "Asia/Kolkata");
    expect([kolkata.getHours(), kolkata.getMinutes()]).toEqual([20, 30]);
  });
});

describe("timeZoneOptions", () => {
  const options = timeZoneOptions(INSTANT);

  it("labels zones with their offset at the given instant", () => {
    const stockholm = options.find((o) => o.id === "Europe/Stockholm");
    expect(stockholm).toMatchObject({
      offset: "GMT+02:00",
      offsetMinutes: 120,
      city: "Stockholm",
    });
    expect(options.find((o) => o.id === "America/Los_Angeles")?.city).toBe(
      "Los Angeles",
    );
  });

  it("sorts by offset", () => {
    const offsets = options.map((o) => o.offsetMinutes);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });

  it("normalizes UTC to a padded offset", () => {
    expect(options.find((o) => o.id === "Europe/London")?.offset).toBe(
      "GMT+01:00",
    );
    expect(options.find((o) => o.id === "Africa/Abidjan")?.offset).toBe(
      "GMT+00:00",
    );
  });
});

it("shortOffsetLabel", () => {
  expect(shortOffsetLabel("Europe/Stockholm", INSTANT)).toBe("GMT+2");
  expect(shortOffsetLabel("Asia/Kolkata", INSTANT)).toBe("GMT+5:30");
});

describe("fromWallClock", () => {
  const wall = (y: number, mo: number, d: number, h: number, mi = 0) =>
    new Date(y, mo - 1, d, h, mi);

  it("inverts toWallClock", () => {
    for (const zone of ["Asia/Tokyo", "America/New_York", "Asia/Kolkata"]) {
      expect(fromWallClock(toWallClock(INSTANT, zone), zone)).toEqual(INSTANT);
    }
  });

  it("reads wall-clock fields as times in the zone", () => {
    expect(
      fromWallClock(wall(2026, 10, 7, 17), "Asia/Tokyo").toISOString(),
    ).toBe("2026-10-07T08:00:00.000Z");
  });

  it("handles both sides of a DST change", () => {
    // New York leaves daylight time on 1 Nov 2026.
    expect(
      fromWallClock(wall(2026, 10, 31, 9), "America/New_York").toISOString(),
    ).toBe("2026-10-31T13:00:00.000Z");
    expect(
      fromWallClock(wall(2026, 11, 2, 9), "America/New_York").toISOString(),
    ).toBe("2026-11-02T14:00:00.000Z");
  });
});
