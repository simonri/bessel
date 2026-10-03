import type { LocationActivity, LocationVisit } from "@bessel/client";
import { describe, expect, it } from "vitest";
import {
  activityInfo,
  adjacentDay,
  dayEntries,
  dayOffset,
  dayParam,
  dayStats,
  formatDistance,
  formatDuration,
  isoDay,
  localTime,
  utcOffsetLabel,
  visitTitle,
} from "./-google-timeline-utils";

function visit(
  id: string,
  start: string,
  end: string,
  extra: Partial<LocationVisit> = {},
): LocationVisit {
  return {
    id,
    start_at: new Date(start),
    end_at: new Date(end),
    utc_offset_minutes: 120,
    place_id: `place-${id}`,
    name: null,
    address: null,
    semantic_type: "Unknown",
    hierarchy_level: 0,
    latitude: 59.3,
    longitude: 18.0,
    ...extra,
  };
}

function trip(
  id: string,
  start: string,
  end: string,
  meters: number,
): LocationActivity {
  return {
    id,
    start_at: new Date(start),
    end_at: new Date(end),
    utc_offset_minutes: 120,
    activity_type: "walking",
    distance_meters: meters,
    start_latitude: 59.3,
    start_longitude: 18.0,
    end_latitude: 59.31,
    end_longitude: 18.01,
  };
}

describe("days", () => {
  it("round-trips a day through the API's UTC-midnight Date", () => {
    expect(dayParam("2026-09-01").toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    expect(isoDay(dayParam("2026-09-01"))).toBe("2026-09-01");
  });

  it("steps to the nearest day with data", () => {
    const days = ["2026-08-30", "2026-09-01", "2026-09-05"];
    expect(adjacentDay(days, "2026-09-01", 1)).toBe("2026-09-05");
    expect(adjacentDay(days, "2026-09-01", -1)).toBe("2026-08-30");
    expect(adjacentDay(days, "2026-09-03", -1)).toBe("2026-09-01");
    expect(adjacentDay(days, "2026-09-05", 1)).toBeNull();
    expect(adjacentDay(days, "2026-08-30", -1)).toBeNull();
  });
});

describe("localTime", () => {
  it("shows the time where it happened, not the viewer's", () => {
    // 16:30 UTC is 23:30 in Ho Chi Minh City.
    expect(localTime(new Date("2026-09-01T16:30:00Z"), 420)).toBe("23:30");
    expect(localTime(new Date("2026-09-01T16:30:00Z"), -300)).toBe("11:30");
  });

  it("adds the date when the time is on another day", () => {
    const at = new Date("2026-09-01T20:00:00Z");
    expect(localTime(at, 120, "2026-09-01")).toBe("22:00");
    expect(localTime(at, 420, "2026-09-01")).toMatch(/Sep 2, 03:00$/);
  });

  it("labels offsets", () => {
    expect(utcOffsetLabel(420)).toBe("GMT+7");
    expect(utcOffsetLabel(330)).toBe("GMT+5:30");
    expect(utcOffsetLabel(-300)).toBe("GMT-5");
  });
});

describe("formatting", () => {
  it("formats durations and distances", () => {
    expect(formatDuration(20_000)).toBe("1 min");
    expect(formatDuration(45 * 60_000)).toBe("45 min");
    expect(formatDuration(120 * 60_000)).toBe("2 h");
    expect(formatDuration(135 * 60_000)).toBe("2 h 15 min");
    expect(formatDistance(812.5)).toBe("810 m");
    expect(formatDistance(3979)).toBe("4.0 km");
    expect(formatDistance(23_400)).toBe("23 km");
  });

  it("names activities from either platform's spelling", () => {
    expect(activityInfo("in passenger vehicle").label).toBe("Driving");
    expect(activityInfo("IN_PASSENGER_VEHICLE").label).toBe("Driving");
    expect(activityInfo("flying").label).toBe("Flight");
    expect(activityInfo("paragliding").label).toBe("Paragliding");
    expect(activityInfo(null).label).toBe("Moving");
  });

  it("titles visits by name, then Google's label", () => {
    const v = visit("a", "2026-09-01T08:00:00Z", "2026-09-01T09:00:00Z");
    expect(visitTitle({ ...v, name: "Café Pascal" })).toBe("Café Pascal");
    expect(visitTitle({ ...v, semantic_type: "Home" })).toBe("Home");
    expect(visitTitle({ ...v, semantic_type: "INFERRED_WORK" })).toBe("Work");
    expect(visitTitle(v)).toBe("Unnamed place");
  });
});

describe("dayEntries", () => {
  it("orders visits and trips, nesting visits inside a visit", () => {
    const mall = visit("mall", "2026-09-01T10:00:00Z", "2026-09-01T12:00:00Z");
    const shop = visit("shop", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", {
      hierarchy_level: 1,
    });
    const home = visit("home", "2026-09-01T06:00:00Z", "2026-09-01T09:30:00Z");
    const walk = trip(
      "walk",
      "2026-09-01T09:30:00Z",
      "2026-09-01T10:00:00Z",
      900,
    );
    const entries = dayEntries([mall, shop, home], [walk]);
    expect(
      entries.map((e) => (e.kind === "visit" ? e.visit.id : e.activity.id)),
    ).toEqual(["home", "walk", "mall"]);
    const last = entries[2];
    expect(last.kind === "visit" && last.children.map((c) => c.id)).toEqual([
      "shop",
    ]);
  });

  it("joins a stay Google split in two", () => {
    const evening = visit("a", "2026-09-01T16:00:00Z", "2026-09-01T22:00:00Z");
    const night = visit("b", "2026-09-01T22:00:00Z", "2026-09-02T06:00:00Z", {
      place_id: "place-a",
    });
    const walk = trip(
      "walk",
      "2026-09-02T06:00:00Z",
      "2026-09-02T06:20:00Z",
      900,
    );
    const back = visit("c", "2026-09-02T06:20:00Z", "2026-09-02T07:00:00Z", {
      place_id: "place-a",
    });
    const entries = dayEntries([evening, night, back], [walk]);
    expect(entries).toHaveLength(3);
    const first = entries[0];
    expect(first.kind === "visit" && first.visit.end_at).toEqual(
      new Date("2026-09-02T06:00:00Z"),
    );
  });

  it("puts a visit before the trip leaving at the same instant", () => {
    const home = visit("home", "2026-09-01T09:00:00Z", "2026-09-01T09:30:00Z");
    const walk = trip(
      "walk",
      "2026-09-01T09:00:00Z",
      "2026-09-01T09:10:00Z",
      1,
    );
    expect(dayEntries([home], [walk])[0].kind).toBe("visit");
  });
});

describe("day stats", () => {
  it("counts distinct places, distance and time moving", () => {
    const visits = [
      visit("a", "2026-09-01T06:00:00Z", "2026-09-01T08:00:00Z"),
      visit("b", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z", {
        place_id: "place-a",
      }),
      visit("c", "2026-09-01T09:10:00Z", "2026-09-01T09:20:00Z", {
        hierarchy_level: 1,
      }),
    ];
    const trips = [
      trip("t1", "2026-09-01T08:00:00Z", "2026-09-01T08:30:00Z", 1500),
      trip("t2", "2026-09-01T10:00:00Z", "2026-09-01T10:15:00Z", 500),
    ];
    expect(dayStats(visits, trips, "2026-09-01")).toEqual({
      places: 1,
      trips: 2,
      distance: 2000,
      moving: 45 * 60_000,
    });
  });

  it("counts only the time moving within the local day", () => {
    // 22:00–02:00 local (+02): two hours on each day.
    const night = trip("n", "2026-09-01T20:00:00Z", "2026-09-02T00:00:00Z", 1);
    expect(dayStats([], [night], "2026-09-01").moving).toBe(2 * 3_600_000);
    expect(dayStats([], [night], "2026-09-02").moving).toBe(2 * 3_600_000);
  });

  it("finds the offset most of the day was spent in", () => {
    const flight = trip("f", "2026-09-01T08:00:00Z", "2026-09-01T10:00:00Z", 1);
    const there = visit("x", "2026-09-01T11:00:00Z", "2026-09-01T22:00:00Z", {
      utc_offset_minutes: 420,
    });
    expect(dayOffset([there], [flight])).toBe(420);
    expect(dayOffset([], [])).toBeNull();
  });
});
