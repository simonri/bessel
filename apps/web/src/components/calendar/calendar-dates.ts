import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import type { CalendarViewMode } from "./calendar-types";

export const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

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
  if (view === "day") {
    return [new Date(date.getFullYear(), date.getMonth(), date.getDate())];
  }
  const start = startOfWeek(date, WEEK_OPTIONS);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
