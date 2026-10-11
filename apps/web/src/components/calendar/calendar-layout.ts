import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { AllDayGridEvent, TimedGridEvent } from "./calendar-types";

export const HOUR_HEIGHT = 48;
export const MIN_EVENT_HEIGHT = 20;

export interface PositionedEvent {
  event: TimedGridEvent;
  top: number;
  height: number;
  /** Column index and count within the event's overlap cluster. */
  column: number;
  columns: number;
}

function minutesIntoDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Lays out one day column's timed events. Events are clipped to the day, then
 * grouped into clusters of transitively overlapping events; each cluster gets
 * its own column count so an isolated event keeps the full width.
 *
 * Positions come from local wall-clock minutes rather than elapsed time so
 * events stay aligned with the 24 hour rows on DST transition days.
 */
export function layoutDayEvents(
  events: TimedGridEvent[],
  day: Date,
): PositionedEvent[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = addDays(dayStart, 1);

  const clipped = events
    .filter((e) => e.start < dayEnd && e.end > dayStart)
    .map((event) => {
      const startMin =
        event.start <= dayStart ? 0 : minutesIntoDay(event.start);
      const endMin = event.end >= dayEnd ? 24 * 60 : minutesIntoDay(event.end);
      return { event, startMin, endMin: Math.max(endMin, startMin) };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const positioned: PositionedEvent[] = [];
  let cluster: { item: (typeof clipped)[number]; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const { item, column } of cluster) {
      const top = (item.startMin / 60) * HOUR_HEIGHT;
      const height = Math.max(
        ((item.endMin - item.startMin) / 60) * HOUR_HEIGHT,
        MIN_EVENT_HEIGHT,
      );
      positioned.push({
        event: item.event,
        top,
        height,
        column,
        columns: columnEnds.length,
      });
    }
    cluster = [];
    columnEnds = [];
  };

  for (const item of clipped) {
    if (item.startMin >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= item.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[column] = item.endMin;
    }
    cluster.push({ item, column });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();

  return positioned;
}

/** A shaded span behind the events, such as a night's sleep. */
export interface GridBackground {
  id: string;
  /** Wall-clock times, like the events. */
  start: Date;
  end: Date;
  label?: string;
}

/** One day column's backgrounds, clipped to the day. */
export function layoutDayBackgrounds(
  backgrounds: GridBackground[],
  day: Date,
): { background: GridBackground; top: number; height: number }[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = addDays(dayStart, 1);
  return backgrounds
    .filter((b) => b.start < dayEnd && b.end > dayStart)
    .map((background) => {
      const startMin =
        background.start <= dayStart ? 0 : minutesIntoDay(background.start);
      const endMin =
        background.end >= dayEnd ? 24 * 60 : minutesIntoDay(background.end);
      return {
        background,
        top: (startMin / 60) * HOUR_HEIGHT,
        height: (Math.max(endMin - startMin, 0) / 60) * HOUR_HEIGHT,
      };
    })
    .filter((b) => b.height > 0);
}

export interface PlacedAllDayEvent {
  event: AllDayGridEvent;
  /** Visible day index the chip starts at, and how many visible days it spans. */
  startCol: number;
  span: number;
  row: number;
}

/** Clips all-day events to the visible days and stacks overlapping ones into rows. */
export function layoutAllDayEvents(
  events: AllDayGridEvent[],
  firstDay: Date,
  dayCount: number,
): PlacedAllDayEvent[] {
  const visible = events
    .map((event) => {
      const start = differenceInCalendarDays(
        parseISO(event.startDate),
        firstDay,
      );
      const end = differenceInCalendarDays(parseISO(event.endDate), firstDay);
      const startCol = Math.max(start, 0);
      const endCol = Math.min(Math.max(end, start + 1), dayCount);
      return { event, startCol, span: endCol - startCol };
    })
    .filter((e) => e.span > 0)
    .sort((a, b) => a.startCol - b.startCol || b.span - a.span);

  const rowEnds: number[] = [];
  return visible.map((e) => {
    let row = rowEnds.findIndex((end) => end <= e.startCol);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = e.startCol + e.span;
    return { ...e, row };
  });
}
