import { describe, expect, it } from "vitest";
import {
  activitySentence,
  comparedToUsual,
  longestSession,
  prettyAppName,
  sessionsFromBuckets,
  usualSecs,
  weekEndingOn,
} from "./activity-insights";

const DAY = 1_000_000;

describe("sessionsFromBuckets", () => {
  it("joins consecutive buckets and splits at gaps, whatever their order", () => {
    const buckets = [5, 1, 2, 3].map((bucket) => ({
      bucket,
      active_secs: 600,
    }));
    expect(sessionsFromBuckets(buckets, 15, DAY)).toEqual([
      { startTs: DAY + 900, endTs: DAY + 3600 },
      { startTs: DAY + 4500, endTs: DAY + 5400 },
    ]);
  });

  it("finds the longest one", () => {
    const sessions = [
      { startTs: 0, endTs: 100 },
      { startTs: 200, endTs: 500 },
    ];
    expect(longestSession(sessions)).toEqual({ startTs: 200, endTs: 500 });
    expect(longestSession([])).toBeNull();
  });
});

describe("usual and the week", () => {
  const date = new Date(2026, 9, 3);
  const days = [
    { date: "2026-10-02", active_secs: 3600 },
    { date: "2026-10-01", active_secs: 7200 },
    { date: "2026-09-30", active_secs: 0 },
    { date: "2026-09-29", active_secs: 5400 },
    { date: "2026-10-03", active_secs: 99999 },
  ];

  it("averages the past week's active days, not the day itself", () => {
    expect(usualSecs(days, date)).toBe(5400);
  });

  it("needs a few days before comparing", () => {
    expect(usualSecs(days.slice(0, 2), date)).toBeNull();
  });

  it("lists the seven days ending on the date", () => {
    const week = weekEndingOn(days, date, date);
    expect(week).toHaveLength(7);
    expect(week[6]).toMatchObject({
      secs: 99999,
      isSelected: true,
      isToday: true,
    });
    expect(week[5].secs).toBe(3600);
  });
});

describe("words", () => {
  it("compares kindly to the usual", () => {
    expect(comparedToUsual(3600, 3500)).toEqual({
      label: "about your usual",
      tone: "same",
    });
    expect(comparedToUsual(1800, 3600)?.tone).toBe("less");
    expect(comparedToUsual(7200, 3600)).toEqual({
      label: "1h 00m more than usual",
      tone: "more",
    });
    expect(comparedToUsual(3600, null)).toBeNull();
  });

  it("summarises the day in one line", () => {
    expect(
      activitySentence({
        totalSecs: 7200,
        usual: 7000,
        topApp: "Chromium",
        isToday: true,
      }),
    ).toBe(
      "2h 00m at the computer so far today - about your usual. Mostly Chromium.",
    );
    expect(
      activitySentence({
        totalSecs: 0,
        usual: null,
        topApp: null,
        isToday: false,
      }),
    ).toBe("No screen time this day.");
  });

  it("capitalises lowercase app classes only", () => {
    expect(prettyAppName("chromium")).toBe("Chromium");
    expect(prettyAppName("Alacritty")).toBe("Alacritty");
    expect(prettyAppName("VSCodium")).toBe("VSCodium");
  });
});
