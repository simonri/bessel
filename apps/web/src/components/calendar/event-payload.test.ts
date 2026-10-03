import { describe, expect, it } from "vitest";
import {
  describeRecurrence,
  presetFor,
  repeatPresets,
  timingPayload,
  toggleAllDay,
  wallClock,
  withEnd,
  withStart,
} from "./event-payload";

// Wed 7 Oct 2026, local wall-clock.
const wed = (h: number, m = 0) => new Date(2026, 9, 7, h, m);

describe("timingPayload", () => {
  it("sends wall-clock times with the zone, never UTC instants", () => {
    expect(
      timingPayload(
        { allDay: false, start: wed(17), end: wed(18, 30) },
        "Asia/Tokyo",
      ),
    ).toEqual({
      start: { date_time: "2026-10-07T17:00" },
      end: { date_time: "2026-10-07T18:30" },
      time_zone: "Asia/Tokyo",
    });
  });

  it("sends dates for all-day events", () => {
    expect(
      timingPayload(
        {
          allDay: true,
          start: new Date(2026, 9, 7),
          end: new Date(2026, 9, 9),
        },
        "Europe/Stockholm",
      ),
    ).toEqual({
      start: { date: "2026-10-07" },
      end: { date: "2026-10-09" },
      time_zone: "Europe/Stockholm",
    });
  });

  it("wallClock ignores seconds", () => {
    expect(wallClock(new Date(2026, 0, 2, 3, 4, 59))).toBe("2026-01-02T03:04");
  });
});

describe("timing edits", () => {
  it("moving the start keeps the duration", () => {
    const moved = withStart(
      { allDay: false, start: wed(9), end: wed(10, 30) },
      wed(14),
    );
    expect([moved.start, moved.end]).toEqual([wed(14), wed(15, 30)]);
  });

  it("an end before the start is clamped", () => {
    expect(
      withEnd({ allDay: false, start: wed(9), end: wed(10) }, wed(8)).end,
    ).toEqual(wed(9, 15));
    const allDay = withEnd(
      { allDay: true, start: new Date(2026, 9, 7), end: new Date(2026, 9, 8) },
      new Date(2026, 9, 6),
    );
    expect(allDay.end).toEqual(new Date(2026, 9, 8));
  });

  it("toggling all-day keeps the day", () => {
    const allDay = toggleAllDay({ allDay: false, start: wed(9), end: wed(10) });
    expect(allDay).toEqual({
      allDay: true,
      start: new Date(2026, 9, 7),
      end: new Date(2026, 9, 8),
    });
    expect(toggleAllDay(allDay)).toEqual({
      allDay: false,
      start: wed(9),
      end: wed(10),
    });
  });

  it("a timed event ending at midnight becomes a single all-day day", () => {
    expect(
      toggleAllDay({ allDay: false, start: wed(22), end: new Date(2026, 9, 8) })
        .end,
    ).toEqual(new Date(2026, 9, 8));
  });
});

describe("repeat presets", () => {
  const presets = repeatPresets(wed(9));

  it("labels choices for the start date", () => {
    expect(presets.map((p) => p.label)).toEqual([
      "Does not repeat",
      "Every day",
      "Every weekday (Mon–Fri)",
      "Every week on Wednesday",
      "Every month on the 7th",
      "Every year on Oct 7",
    ]);
    expect(
      presets.find((p) => p.key === "weekly")?.recurrence?.by_weekday,
    ).toEqual(["WE"]);
  });

  it("ordinals", () => {
    const labels = [1, 2, 3, 11, 12, 13, 21, 22, 23].map(
      (d) =>
        repeatPresets(new Date(2026, 9, d)).find((p) => p.key === "monthly")
          ?.label,
    );
    expect(labels.map((l) => l?.split(" the ")[1])).toEqual([
      "1st",
      "2nd",
      "3rd",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
    ]);
  });

  it("matches existing rules back to presets", () => {
    for (const preset of presets) {
      expect(
        presetFor(preset.recurrence, preset.recurrence !== null, wed(9)),
      ).toBe(preset.key);
    }
    expect(
      presetFor(
        {
          frequency: "weekly",
          interval: 2,
          by_weekday: ["WE"],
          count: null,
          until: null,
        },
        true,
        wed(9),
      ),
    ).toBe("custom");
    expect(presetFor(null, true, wed(9))).toBe("custom");
    expect(
      presetFor(
        {
          frequency: "weekly",
          interval: 1,
          by_weekday: ["MO"],
          count: null,
          until: null,
        },
        true,
        wed(9),
      ),
    ).toBe("custom");
  });

  it("describes rules", () => {
    expect(
      describeRecurrence(
        {
          frequency: "weekly",
          interval: 2,
          by_weekday: ["MO", "TH"],
          count: null,
          until: "2026-12-31",
        },
        wed(9),
      ),
    ).toBe("Every 2 weeks on Mon, Thu, until Dec 31, 2026");
    expect(
      describeRecurrence(
        {
          frequency: "daily",
          interval: 1,
          by_weekday: [],
          count: 5,
          until: null,
        },
        wed(9),
      ),
    ).toBe("Daily, 5 times");
    expect(describeRecurrence(null, wed(9))).toBe("Repeats");
  });
});
