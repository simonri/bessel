import type { LocationVisit, TimelineLane } from "@bessel/client";
import { describe, expect, it } from "vitest";
import {
  activityLane,
  dayMoments,
  daySentence,
  nightOf,
  placesLane,
} from "./day-summary";

const DAY = Date.UTC(2026, 9, 3) / 1000;
const at = (h: number, m = 0) => DAY + h * 3600 + m * 60;
const dur = (secs: number) => `${Math.round(secs / 60)}m`;

function lane(
  key: TimelineLane["key"],
  spans: [number, number][],
  total = 0,
): TimelineLane {
  return {
    key,
    total_secs: total,
    segments: spans.map(([start_ts, end_ts]) => ({
      start_ts,
      end_ts,
      label: "x",
    })),
  };
}

function visit(
  name: string | null,
  start: number,
  end: number,
  semantic: string | null = null,
): LocationVisit {
  return {
    id: name ?? "v",
    start_at: new Date(start * 1000),
    end_at: new Date(end * 1000),
    utc_offset_minutes: 0,
    place_id: null,
    name,
    address: null,
    semantic_type: semantic,
  } as LocationVisit;
}

describe("activityLane", () => {
  it("merges segments less than a minute apart into one session", () => {
    const view = activityLane(
      lane(
        "pc",
        [
          [at(9), at(10)],
          [at(10, 0) + 30, at(11)],
          [at(13), at(14)],
        ],
        3600 * 3,
      ),
    );
    expect(view.blocks.map((b) => [b.startTs, b.endTs])).toEqual([
      [at(9), at(11)],
      [at(13), at(14)],
    ]);
    expect(view.title).toBe("Screen time");
  });
});

describe("placesLane", () => {
  it("clips visits to the day and names unnamed homes", () => {
    const view = placesLane(
      [visit(null, at(-2), at(8), "HOME"), visit("Café", at(12), at(13))],
      DAY,
      DAY + 86400,
    );
    expect(view.blocks.map((b) => [b.name, b.startTs, b.endTs])).toEqual([
      ["Home", DAY, at(8)],
      ["Café", at(12), at(13)],
    ]);
  });
});

describe("dayMoments", () => {
  it("tells the day in order, skipping a night that began yesterday", () => {
    const lanes = [
      activityLane(lane("sleep", [[DAY, at(7)]])),
      activityLane(lane("pc", [[at(9), at(10)]])),
      placesLane([visit("Uni", at(8, 30), at(12))], DAY, DAY + 86400),
    ];
    const moments = dayMoments(lanes, DAY, DAY + 86400, dur);
    expect(moments.map((m) => [m.kind, m.text, m.detail])).toEqual([
      ["wake", "Woke up", "after 420m"],
      ["place", "Uni", "210m"],
      ["screen", "At the computer", "60m"],
    ]);
  });
});

describe("daySentence", () => {
  it("joins what happened into one friendly sentence", () => {
    const lanes = [
      activityLane(lane("sleep", [[at(0), at(7)]], 7 * 3600)),
      activityLane(lane("pc", [[at(9), at(10)]], 3600)),
      placesLane(
        [visit("Uni", at(8), at(9)), visit("Home", at(18), at(20))],
        DAY,
        DAY + 86400,
      ),
    ];
    expect(daySentence(lanes, dur)).toBe(
      "You slept 420m, spent 60m at the computer and visited 2 places.",
    );
    expect(
      daySentence([activityLane(lane("pc", [[at(9), at(10)]], 3600))], dur),
    ).toBe("You spent 60m at the computer.");
    expect(daySentence([], dur)).toBeNull();
  });
});

it("nightOf picks the longest sleep", () => {
  const sleep = activityLane(
    lane("sleep", [
      [at(0), at(7)],
      [at(15), at(15, 30)],
    ]),
  );
  expect(nightOf(sleep)).toEqual({ bedTs: at(0), wakeTs: at(7) });
  expect(nightOf(undefined)).toBeNull();
});
