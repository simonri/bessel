import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import type { CalendarViewMode } from "./calendar-types";

export const WEEK_OPTIONS = { weekStartsOn: 1 } as const;
/** Days shown either side of the selected day in the "centered" view. */
export const CENTERED_RADIUS = 3;

/** The month a range of days is "in": today's month while today is shown,
 *  otherwise the month most of the days fall in (the later one on a tie). */
export function headerMonth(days: Date[], today: Date): string {
  if (days.some((d) => isSameDay(d, today))) return format(today, "MMMM yyyy");
  const counts = new Map<string, number>();
  for (const day of days) {
    const key = format(day, "MMMM yyyy");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = format(days[0], "MMMM yyyy");
  for (const [month, count] of counts) {
    if (count >= (counts.get(best) ?? 0)) best = month;
  }
  return best;
}

export function visibleDays(date: Date, view: CalendarViewMode): Date[] {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (view === "day") return [day];
  const start =
    view === "centered"
      ? addDays(day, -CENTERED_RADIUS)
      : startOfWeek(date, WEEK_OPTIONS);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
