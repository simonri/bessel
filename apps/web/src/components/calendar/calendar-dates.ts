import { addDays, startOfWeek } from "date-fns";
import type { CalendarViewMode } from "./calendar-types";

export const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

export function visibleDays(date: Date, view: CalendarViewMode): Date[] {
  if (view === "day") {
    return [new Date(date.getFullYear(), date.getMonth(), date.getDate())];
  }
  const start = startOfWeek(date, WEEK_OPTIONS);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
