import { addDays, addMinutes } from "date-fns";
import { HOUR_HEIGHT } from "./calendar-layout";
import type { EventDraftTiming } from "./event-payload";

export const SNAP_MINUTES = 15;
export const MIN_DURATION_MINUTES = 15;
export const DEFAULT_DURATION_MINUTES = 60;
/** Pointer travel before a press on an event becomes a drag instead of a click. */
export const DRAG_THRESHOLD_PX = 4;
const DAY_MINUTES = 24 * 60;

/** Minutes since midnight under a y offset in the 24h column, snapped down. */
export function minutesAt(offsetY: number): number {
  const raw = (offsetY / HOUR_HEIGHT) * 60;
  const snapped = Math.floor(raw / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.min(Math.max(snapped, 0), DAY_MINUTES - SNAP_MINUTES);
}

/** Snapped minute change for a vertical drag distance. */
export function minuteDelta(dy: number): number {
  return Math.round(((dy / HOUR_HEIGHT) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
}

/** Which visible day an x offset falls in. */
export function dayIndexAt(
  offsetX: number,
  width: number,
  dayCount: number,
): number {
  if (width <= 0) return 0;
  return Math.min(
    Math.max(Math.floor((offsetX / width) * dayCount), 0),
    dayCount - 1,
  );
}

function atMinutes(day: Date, minutes: number): Date {
  return addMinutes(
    new Date(day.getFullYear(), day.getMonth(), day.getDate()),
    minutes,
  );
}

/** A new event from a drag in one day column. A double click (no drag) gives
 *  a default-length event starting at the slot. */
export function createRange(
  day: Date,
  fromMinutes: number,
  toMinutes: number,
): EventDraftTiming {
  const low = Math.min(fromMinutes, toMinutes);
  const high = Math.max(fromMinutes, toMinutes) + SNAP_MINUTES;
  const dragged = high - low > SNAP_MINUTES;
  const end = dragged
    ? high
    : Math.min(low + DEFAULT_DURATION_MINUTES, DAY_MINUTES);
  return {
    allDay: false,
    start: atMinutes(day, low),
    end: atMinutes(day, end),
  };
}

/** An all-day event spanning the pressed and released day columns. */
export function allDayRange(
  days: Date[],
  fromIndex: number,
  toIndex: number,
): EventDraftTiming {
  const low = Math.min(fromIndex, toIndex);
  const high = Math.max(fromIndex, toIndex);
  return { allDay: true, start: days[low], end: addDays(days[high], 1) };
}

/** An event moved by whole days and snapped minutes, keeping its duration. */
export function moveTiming(
  timing: EventDraftTiming,
  days: number,
  minutes: number,
): EventDraftTiming {
  if (timing.allDay) {
    return {
      ...timing,
      start: addDays(timing.start, days),
      end: addDays(timing.end, days),
    };
  }
  return {
    ...timing,
    start: addMinutes(addDays(timing.start, days), minutes),
    end: addMinutes(addDays(timing.end, days), minutes),
  };
}

/** An event whose start was dragged by `minutes`, never shorter than the minimum. */
export function resizeStartTiming(
  timing: EventDraftTiming,
  minutes: number,
): EventDraftTiming {
  const start = addMinutes(timing.start, minutes);
  const maximum = addMinutes(timing.end, -MIN_DURATION_MINUTES);
  return { ...timing, start: start > maximum ? maximum : start };
}

/** An event whose end was dragged by `minutes`, never shorter than the minimum. */
export function resizeTiming(
  timing: EventDraftTiming,
  minutes: number,
): EventDraftTiming {
  const end = addMinutes(timing.end, minutes);
  const minimum = addMinutes(timing.start, MIN_DURATION_MINUTES);
  return { ...timing, end: end < minimum ? minimum : end };
}

export function sameTiming(a: EventDraftTiming, b: EventDraftTiming): boolean {
  return (
    a.allDay === b.allDay &&
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime()
  );
}
