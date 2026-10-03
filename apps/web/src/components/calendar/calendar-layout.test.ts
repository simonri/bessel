import { describe, expect, it } from "vitest";
import {
  HOUR_HEIGHT,
  layoutAllDayEvents,
  layoutDayEvents,
  MIN_EVENT_HEIGHT,
} from "./calendar-layout";
import type { AllDayCalendarEvent, TimedCalendarEvent } from "./calendar-types";

const DAY = new Date(2026, 9, 7);

function timed(
  id: string,
  [sh, sm]: [number, number],
  [eh, em]: [number, number],
  dayOffset = 0,
  endDayOffset = dayOffset,
): TimedCalendarEvent {
  return {
    id,
    calendarId: "c",
    title: id,
    allDay: false,
    start: new Date(2026, 9, 7 + dayOffset, sh, sm),
    end: new Date(2026, 9, 7 + endDayOffset, eh, em),
  };
}

function allDay(
  id: string,
  startDate: string,
  endDate: string,
): AllDayCalendarEvent {
  return { id, calendarId: "c", title: id, allDay: true, startDate, endDate };
}

describe("layoutDayEvents", () => {
  it("positions an isolated event at full width", () => {
    const [p] = layoutDayEvents([timed("a", [17, 0], [18, 0])], DAY);
    expect(p).toMatchObject({
      top: 17 * HOUR_HEIGHT,
      height: HOUR_HEIGHT,
      column: 0,
      columns: 1,
    });
  });

  it("splits overlapping events into columns per cluster only", () => {
    const placed = layoutDayEvents(
      [
        timed("a", [9, 0], [10, 0]),
        timed("b", [9, 30], [11, 0]),
        timed("c", [14, 0], [15, 0]),
      ],
      DAY,
    );
    const byId = Object.fromEntries(placed.map((p) => [p.event.id, p]));
    expect(byId.a).toMatchObject({ column: 0, columns: 2 });
    expect(byId.b).toMatchObject({ column: 1, columns: 2 });
    expect(byId.c).toMatchObject({ column: 0, columns: 1 });
  });

  it("reuses a freed column within a cluster", () => {
    const placed = layoutDayEvents(
      [
        timed("a", [9, 0], [12, 0]),
        timed("b", [9, 0], [10, 0]),
        timed("c", [10, 0], [11, 0]),
      ],
      DAY,
    );
    const byId = Object.fromEntries(placed.map((p) => [p.event.id, p]));
    expect(byId.b.column).toBe(byId.c.column);
    expect(byId.a.columns).toBe(2);
  });

  it("clips events crossing midnight to the day", () => {
    const evening = timed("late", [23, 0], [1, 0], 0, 1);
    expect(layoutDayEvents([evening], DAY)[0]).toMatchObject({
      top: 23 * HOUR_HEIGHT,
      height: HOUR_HEIGHT,
    });
    expect(layoutDayEvents([evening], new Date(2026, 9, 8))[0]).toMatchObject({
      top: 0,
      height: HOUR_HEIGHT,
    });
  });

  it("gives very short events a minimum height", () => {
    const [p] = layoutDayEvents([timed("a", [9, 0], [9, 5])], DAY);
    expect(p.height).toBe(MIN_EVENT_HEIGHT);
  });

  it("ignores events on other days", () => {
    expect(layoutDayEvents([timed("a", [9, 0], [10, 0], 1)], DAY)).toEqual([]);
  });
});

describe("layoutAllDayEvents", () => {
  const monday = new Date(2026, 9, 5);

  it("treats the end date as exclusive", () => {
    const [p] = layoutAllDayEvents(
      [allDay("a", "2026-10-05", "2026-10-06")],
      monday,
      7,
    );
    expect(p).toMatchObject({ startCol: 0, span: 1, row: 0 });
  });

  it("clips spans to the visible days", () => {
    const [p] = layoutAllDayEvents(
      [allDay("a", "2026-10-01", "2026-10-07")],
      monday,
      7,
    );
    expect(p).toMatchObject({ startCol: 0, span: 2 });
    expect(
      layoutAllDayEvents([allDay("b", "2026-10-12", "2026-10-13")], monday, 7),
    ).toEqual([]);
  });

  it("stacks overlapping events into rows", () => {
    const placed = layoutAllDayEvents(
      [
        allDay("a", "2026-10-05", "2026-10-08"),
        allDay("b", "2026-10-06", "2026-10-07"),
        allDay("c", "2026-10-08", "2026-10-09"),
      ],
      monday,
      7,
    );
    const rows = Object.fromEntries(placed.map((p) => [p.event.id, p.row]));
    expect(rows).toEqual({ a: 0, b: 1, c: 0 });
  });
});
