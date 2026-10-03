import type { SleepDailyEntry } from "@bessel/client";
import { describe, expect, it } from "vitest";
import {
  compareToUsual,
  consistencyLabel,
  eveningMinutes,
  formatEveningClock,
  nightMood,
  rhythmStats,
} from "./sleep-summary";

const night = (
  date: string,
  hours: number,
  onset: string,
  wake: string,
): SleepDailyEntry => ({
  date,
  asleep_secs: hours * 3600,
  sleep_onset: `${date}T${onset}:00+02:00`,
  wake_time: `${date}T${wake}:00+02:00`,
});

describe("sleep summary", () => {
  it("puts bedtimes either side of midnight on one axis", () => {
    expect(eveningMinutes("2026-10-02T23:40:00+02:00")).toBe(340);
    expect(eveningMinutes("2026-10-03T00:30:00+02:00")).toBe(390);
    expect(eveningMinutes("2026-10-03T07:10:00+02:00")).toBe(790);
    expect(formatEveningClock(340)).toBe("11:40pm");
    expect(formatEveningClock(390)).toBe("12:30am");
    expect(formatEveningClock(790)).toBe("7:10am");
  });

  it("describes a night warmly", () => {
    expect(nightMood(8 * 3600)).toBe("a cosy night ✨");
    expect(nightMood(7 * 3600)).toBe("a solid night");
    expect(nightMood(4 * 3600)).toContain("short night");
  });

  it("averages the rhythm and how steady bedtimes are", () => {
    const stats = rhythmStats([
      night("2026-10-01", 7, "23:00", "06:00"),
      night("2026-10-02", 8, "00:00", "08:00"),
      {
        date: "2026-10-03",
        asleep_secs: 0,
        sleep_onset: null,
        wake_time: null,
      },
    ]);
    expect(stats.nights).toBe(2);
    expect(stats.avgAsleepSecs).toBe(7.5 * 3600);
    expect(stats.avgBedtime).toBe(330);
    expect(stats.avgWake).toBe(780);
    expect(stats.bedtimeSpread).toBe(30);
    expect(consistencyLabel(stats.bedtimeSpread)).toBe(
      "Fairly steady bedtimes",
    );
  });

  it("compares a night with the usual", () => {
    expect(compareToUsual(7 * 3600 + 25 * 60, 7 * 3600)).toBe(
      "+25m vs your usual",
    );
    expect(compareToUsual(6 * 3600, 7 * 3600 + 10 * 60)).toBe(
      "-1h 10m vs your usual",
    );
    expect(compareToUsual(7 * 3600, 7 * 3600 + 5 * 60)).toBe(
      "about your usual",
    );
    expect(compareToUsual(7 * 3600, null)).toBeNull();
  });
});
