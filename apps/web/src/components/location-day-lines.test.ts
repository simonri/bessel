import type {
  LocationActivity,
  LocationPoint,
  LocationVisit,
} from "@bessel/client";
import { describe, expect, it } from "vitest";
import { tripLines } from "./location-day-lines";

const HOME: [number, number] = [59.3, 18.0];
const OFFICE: [number, number] = [59.34, 18.06];

function at(time: string): Date {
  return new Date(`2026-09-01T${time}:00Z`);
}

function stay(
  id: string,
  start: string,
  end: string,
  [latitude, longitude]: [number, number],
  extra: Partial<LocationVisit> = {},
): LocationVisit {
  return {
    id,
    start_at: at(start),
    end_at: at(end),
    utc_offset_minutes: 120,
    end_utc_offset_minutes: 120,
    place_id: `place-${id}`,
    name: null,
    address: null,
    semantic_type: "Unknown",
    hierarchy_level: 0,
    latitude,
    longitude,
    ...extra,
  };
}

function trip(
  id: string,
  start: string,
  end: string,
  extra: Partial<LocationActivity> = {},
): LocationActivity {
  return {
    id,
    start_at: at(start),
    end_at: at(end),
    utc_offset_minutes: 120,
    end_utc_offset_minutes: 120,
    activity_type: "in passenger vehicle",
    distance_meters: 5000,
    // Google's ends, deliberately off from the stays and the route.
    start_latitude: 59.29,
    start_longitude: 17.95,
    end_latitude: 59.35,
    end_longitude: 18.1,
    ...extra,
  };
}

function point(
  time: string,
  latitude: number,
  longitude: number,
): LocationPoint {
  return { latitude, longitude, ts: at(time).getTime() / 1000 };
}

describe("tripLines", () => {
  it("runs from the place left to the place reached through the recorded route, not Google's trip ends", () => {
    const lines = tripLines(
      [
        stay("home", "07:00", "08:00", HOME),
        stay("office", "08:30", "17:00", OFFICE),
      ],
      [trip("drive", "08:01", "08:29")],
      [point("08:05", 59.31, 18.02), point("08:20", 59.33, 18.05)],
    );

    expect(lines).toEqual([
      {
        id: "drive",
        points: [HOME, [59.31, 18.02], [59.33, 18.05], OFFICE],
        recorded: true,
        mode: "ride",
      },
    ]);
  });

  it("continues a trip from where the one before it ended when there's no stay between", () => {
    const [walk, bus] = tripLines(
      [stay("home", "07:00", "08:00", HOME)],
      [
        trip("walk", "08:00", "08:10", { activity_type: "walking" }),
        trip("bus", "08:12", "08:40", { activity_type: "in bus" }),
      ],
      [point("08:09", 59.305, 18.01), point("08:30", 59.32, 18.04)],
    );

    expect(walk.points).toEqual([HOME, [59.305, 18.01]]);
    expect(bus.points[0]).toEqual([59.305, 18.01]);
    expect([walk.mode, bus.mode]).toEqual(["walk", "ride"]);
  });

  it("starts at a stay between two trips rather than at the earlier trip", () => {
    const lines = tripLines(
      [stay("shop", "08:20", "08:27", OFFICE)],
      [trip("there", "08:00", "08:19"), trip("back", "08:28", "09:00")],
      [point("08:10", 59.32, 18.03), point("08:50", 59.31, 18.02)],
    );

    expect(lines[1].points[0]).toEqual(OFFICE);
  });

  it("falls back to Google's ends, marked unrecorded, when there's no route and no stay nearby", () => {
    const [line] = tripLines(
      [stay("far", "05:00", "06:00", HOME)],
      [trip("flight", "08:00", "12:00", { activity_type: "flying" })],
      [],
    );

    expect(line).toEqual({
      id: "flight",
      points: [
        [59.29, 17.95],
        [59.35, 18.1],
      ],
      recorded: false,
      mode: "flight",
    });
  });

  it("joins only stays within 15 minutes and only top-level places", () => {
    const [line] = tripLines(
      [
        stay("long-before", "06:00", "07:40", HOME),
        stay("area", "07:00", "08:00", HOME, { hierarchy_level: 1 }),
      ],
      [trip("drive", "08:00", "08:30")],
      [point("08:10", 59.31, 18.02), point("08:20", 59.33, 18.05)],
    );

    expect(line.points).toEqual([
      [59.31, 18.02],
      [59.33, 18.05],
    ]);
  });

  it("draws through the phone's point just before a trip starts and just after it ends, as Google Maps does", () => {
    // Google calls the drive over at 17:09, but the phone's 17:10 point is
    // still out on the road.
    const [line] = tripLines(
      [
        stay("office", "08:30", "17:02", OFFICE),
        stay("home", "17:09", "20:00", HOME),
      ],
      [trip("home-again", "17:02", "17:09")],
      [
        point("16:57", 59.36, 18.1),
        {
          latitude: 59.338,
          longitude: 18.059,
          ts: at("17:00").getTime() / 1000 + 30,
        },
        {
          latitude: 59.337,
          longitude: 18.055,
          ts: at("17:01").getTime() / 1000 + 45,
        },
        point("17:07", 59.32, 18.03),
        point("17:10", 59.305, 18.01),
        point("17:13", 59.29, 17.98),
      ],
    );

    expect(line.points).toEqual([
      OFFICE,
      [59.337, 18.055],
      [59.32, 18.03],
      [59.305, 18.01],
      HOME,
    ]);
  });

  it("leaves out points more than 3 minutes either side of a trip", () => {
    const [line] = tripLines(
      [],
      [trip("drive", "08:00", "08:10")],
      [
        point("07:56", 59.2, 17.9),
        point("08:05", 59.31, 18.02),
        point("08:08", 59.33, 18.05),
        point("08:14", 59.4, 18.2),
      ],
    );

    expect(line.points).toEqual([
      [59.31, 18.02],
      [59.33, 18.05],
    ]);
  });

  it("skips a trip with nothing to draw", () => {
    const lines = tripLines(
      [],
      [
        trip("unknown", "08:00", "08:30", {
          start_latitude: null,
          start_longitude: null,
          end_latitude: null,
          end_longitude: null,
        }),
      ],
      [],
    );

    expect(lines).toEqual([]);
  });
});
