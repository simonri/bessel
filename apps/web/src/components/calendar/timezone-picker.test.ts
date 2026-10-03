import { describe, expect, it } from "vitest";
import { currentTimeZoneOptions } from "./calendar-timezone";
import { filterZones } from "./timezone-picker";

describe("zone list", () => {
  const options = currentTimeZoneOptions(new Date(2026, 9, 3, 12));

  it("is built once per hour", () => {
    expect(currentTimeZoneOptions(new Date(2026, 9, 3, 12, 59))).toBe(options);
    expect(currentTimeZoneOptions(new Date(2026, 9, 3, 13, 0))).not.toBe(
      options,
    );
  });

  it("matches every word against city, name, id and offset", () => {
    const ids = (q: string) => filterZones(options, q).map((o) => o.id);
    expect(ids("new york")).toContain("America/New_York");
    expect(ids("Stockholm")).toEqual(["Europe/Stockholm"]);
    expect(ids("europe stock")).toEqual(["Europe/Stockholm"]);
    expect(ids("  ")).toHaveLength(options.length);
    expect(ids("zzzz")).toEqual([]);
  });
});
