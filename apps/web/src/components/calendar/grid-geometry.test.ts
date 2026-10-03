import { describe, expect, it } from "vitest";
import { HOUR_HEIGHT } from "./calendar-layout";
import {
  allDayRange,
  createRange,
  dayIndexAt,
  minuteDelta,
  minutesAt,
  moveTiming,
  resizeTiming,
  sameTiming,
} from "./grid-geometry";

const wed = (h: number, m = 0) => new Date(2026, 9, 7, h, m);

describe("minutesAt", () => {
  it("snaps down to 15 minutes", () => {
    expect(minutesAt(9 * HOUR_HEIGHT + HOUR_HEIGHT * (20 / 60))).toBe(
      9 * 60 + 15,
    );
  });

  it("clamps to the day", () => {
    expect(minutesAt(-30)).toBe(0);
    expect(minutesAt(25 * HOUR_HEIGHT)).toBe(23 * 60 + 45);
  });
});

describe("minuteDelta", () => {
  it("rounds drags to the nearest slot", () => {
    expect(minuteDelta(HOUR_HEIGHT)).toBe(60);
    expect(minuteDelta(HOUR_HEIGHT * (8 / 60))).toBe(15);
    expect(minuteDelta(HOUR_HEIGHT * (7 / 60))).toBe(0);
    expect(minuteDelta(-HOUR_HEIGHT / 2)).toBe(-30);
  });
});

describe("dayIndexAt", () => {
  it("maps x to a column and clamps", () => {
    expect(dayIndexAt(0, 700, 7)).toBe(0);
    expect(dayIndexAt(350, 700, 7)).toBe(3);
    expect(dayIndexAt(699, 700, 7)).toBe(6);
    expect(dayIndexAt(-10, 700, 7)).toBe(0);
    expect(dayIndexAt(900, 700, 7)).toBe(6);
    expect(dayIndexAt(10, 0, 7)).toBe(0);
  });
});

describe("createRange", () => {
  const day = new Date(2026, 9, 7);

  it("a click gives an hour from the slot", () => {
    expect(createRange(day, 9 * 60, 9 * 60)).toEqual({
      allDay: false,
      start: wed(9),
      end: wed(10),
    });
  });

  it("a drag covers the dragged slots, in either direction", () => {
    expect(createRange(day, 9 * 60, 10 * 60 + 15)).toEqual({
      allDay: false,
      start: wed(9),
      end: wed(10, 30),
    });
    expect(createRange(day, 10 * 60, 9 * 60)).toEqual({
      allDay: false,
      start: wed(9),
      end: wed(10, 15),
    });
  });

  it("a click late in the day stops at midnight", () => {
    expect(createRange(day, 23 * 60 + 30, 23 * 60 + 30).end).toEqual(
      new Date(2026, 9, 8),
    );
  });
});

describe("allDayRange", () => {
  const days = [5, 6, 7, 8, 9].map((d) => new Date(2026, 9, d));

  it("spans the pressed days with an exclusive end", () => {
    expect(allDayRange(days, 3, 1)).toEqual({
      allDay: true,
      start: days[1],
      end: new Date(2026, 9, 9),
    });
    expect(allDayRange(days, 2, 2).end).toEqual(new Date(2026, 9, 8));
  });
});

describe("moveTiming / resizeTiming", () => {
  const timing = { allDay: false, start: wed(9), end: wed(10, 30) };

  it("moves across days and time, keeping duration", () => {
    expect(moveTiming(timing, 1, 45)).toEqual({
      allDay: false,
      start: new Date(2026, 9, 8, 9, 45),
      end: new Date(2026, 9, 8, 11, 15),
    });
  });

  it("moves all-day events by days only", () => {
    const allDay = {
      allDay: true,
      start: new Date(2026, 9, 7),
      end: new Date(2026, 9, 9),
    };
    expect(moveTiming(allDay, -2, 120)).toEqual({
      allDay: true,
      start: new Date(2026, 9, 5),
      end: new Date(2026, 9, 7),
    });
  });

  it("resizes the end with a minimum length", () => {
    expect(resizeTiming(timing, 30).end).toEqual(wed(11));
    expect(resizeTiming(timing, -200).end).toEqual(wed(9, 15));
  });

  it("detects no-op drags", () => {
    expect(sameTiming(timing, moveTiming(timing, 0, 0))).toBe(true);
    expect(sameTiming(timing, moveTiming(timing, 0, 15))).toBe(false);
  });
});
