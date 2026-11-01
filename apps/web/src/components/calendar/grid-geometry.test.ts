import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HOUR_HEIGHT } from "./calendar-layout";
import {
  allDayRange,
  createRange,
  dayIndexAt,
  minuteDelta,
  minutesAt,
  moveTiming,
  resizeStartTiming,
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

  describe("on DST days", () => {
    beforeAll(() => {
      vi.stubEnv("TZ", "Europe/Stockholm");
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("starts at the hour row clicked, after the clocks spring forward", () => {
      const springForward = new Date(2026, 2, 29);
      const { start, end } = createRange(springForward, 10 * 60, 10 * 60);
      expect([start.getHours(), end.getHours()]).toEqual([10, 11]);
    });

    it("starts at the hour row clicked, after the clocks fall back", () => {
      const fallBack = new Date(2026, 9, 25);
      const { start, end } = createRange(fallBack, 9 * 60, 10 * 60 + 45);
      expect([start.getHours(), end.getHours()]).toEqual([9, 11]);
    });
  });

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

  it("resizes the start with a minimum length, keeping the end", () => {
    expect(resizeStartTiming(timing, -30)).toEqual({
      ...timing,
      start: wed(8, 30),
    });
    expect(resizeStartTiming(timing, 200)).toEqual({
      ...timing,
      start: wed(10, 15),
    });
  });

  describe("on DST days", () => {
    beforeAll(() => {
      vi.stubEnv("TZ", "Europe/Stockholm");
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    const springForward = (h: number) => new Date(2026, 2, 29, h);
    const fallBack = (h: number) => new Date(2026, 9, 25, h);

    it("moves to the hour row dropped on, after the clocks spring forward", () => {
      const moved = moveTiming(
        { allDay: false, start: springForward(1), end: springForward(4) },
        0,
        2 * 60,
      );
      expect([moved.start.getHours(), moved.end.getHours()]).toEqual([3, 6]);
    });

    it("moves to the hour row dropped on, after the clocks fall back", () => {
      const moved = moveTiming(
        { allDay: false, start: fallBack(1), end: fallBack(2) },
        0,
        3 * 60,
      );
      expect([moved.start.getHours(), moved.end.getHours()]).toEqual([4, 5]);
    });

    it("resizes to the hour row dropped on", () => {
      const timing = {
        allDay: false,
        start: springForward(1),
        end: springForward(6),
      };
      expect(resizeStartTiming(timing, 2 * 60).start.getHours()).toBe(3);
      expect(
        resizeTiming(
          { ...timing, end: springForward(1) },
          3 * 60,
        ).end.getHours(),
      ).toBe(4);
    });
  });

  it("detects no-op drags", () => {
    expect(sameTiming(timing, moveTiming(timing, 0, 0))).toBe(true);
    expect(sameTiming(timing, moveTiming(timing, 0, 15))).toBe(false);
  });
});
