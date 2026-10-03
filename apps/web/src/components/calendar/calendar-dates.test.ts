import { describe, expect, it } from "vitest";
import { headerMonth, visibleDays } from "./calendar-dates";

const week = (y: number, m: number, d: number) =>
  visibleDays(new Date(y, m, d), "week");

describe("headerMonth", () => {
  it("names today's month while today is shown", () => {
    // Mon Sep 28 – Sun Oct 4, today Sat Oct 3.
    expect(headerMonth(week(2026, 9, 3), new Date(2026, 9, 3, 15))).toBe(
      "October 2026",
    );
    // Mon Sep 28 – Sun Oct 4, today Tue Sep 29: October hasn't started.
    expect(headerMonth(week(2026, 8, 29), new Date(2026, 8, 29))).toBe(
      "September 2026",
    );
  });

  it("otherwise names the month most of the days are in", () => {
    const today = new Date(2026, 5, 1);
    // Mon Sep 28 – Sun Oct 4: four October days.
    expect(headerMonth(week(2026, 8, 28), today)).toBe("October 2026");
    // Mon Oct 26 – Sun Nov 1: six October days.
    expect(headerMonth(week(2026, 9, 26), today)).toBe("October 2026");
    // Mon Dec 28 – Sun Jan 3 crosses the year; four December days.
    expect(headerMonth(week(2026, 11, 28), today)).toBe("December 2026");
  });

  it("names a single day's month", () => {
    expect(
      headerMonth(visibleDays(new Date(2026, 8, 30), "day"), new Date()),
    ).toBe("September 2026");
  });
});

describe("visibleDays", () => {
  it("centers the selected day with three days either side", () => {
    const days = visibleDays(new Date(2026, 9, 4, 15), "centered");
    expect(days.map((d) => d.getDate())).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(days[0].getHours()).toBe(0);
  });
});
