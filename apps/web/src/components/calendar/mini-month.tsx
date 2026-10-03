import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { WEEK_OPTIONS } from "./calendar-dates";
import type { CalendarViewMode } from "./calendar-types";

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function MiniMonth({
  selected,
  view,
  today,
  onSelect,
}: {
  selected: Date;
  view: CalendarViewMode;
  today: Date;
  onSelect: (date: Date) => void;
}) {
  // Paging the mini month browses without moving the main view; it snaps back
  // whenever the selection lands in a different month.
  const [shownMonth, setShownMonth] = useState(() => startOfMonth(selected));
  const [lastSelected, setLastSelected] = useState(selected);
  if (!isSameDay(lastSelected, selected)) {
    setLastSelected(selected);
    if (!isSameMonth(selected, shownMonth)) {
      setShownMonth(startOfMonth(selected));
    }
  }

  const gridStart = startOfWeek(shownMonth, WEEK_OPTIONS);
  const weeks = Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  );

  const isHighlighted = (day: Date) =>
    view === "week"
      ? isSameWeek(day, selected, WEEK_OPTIONS)
      : isSameDay(day, selected);

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between pl-2">
        <span className="text-12 font-medium text-white/80">
          {format(shownMonth, "MMMM yyyy")}
        </span>
        <div className="flex">
          <IconButton
            title="Previous month"
            onClick={() => setShownMonth((m) => addMonths(m, -1))}
          >
            <ChevronUp />
          </IconButton>
          <IconButton
            title="Next month"
            onClick={() => setShownMonth((m) => addMonths(m, 1))}
          >
            <ChevronDown />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1 text-10 text-white/40">
            {label}
          </span>
        ))}
      </div>

      {weeks.map((week) => {
        const weekHighlighted = view === "week" && isHighlighted(week[0]);
        return (
          <div
            key={week[0].toISOString()}
            className={cn(
              "grid grid-cols-7 rounded-md",
              weekHighlighted && "bg-white/[0.07]",
            )}
          >
            {week.map((day) => {
              const isToday = isSameDay(day, today);
              const dayHighlighted = view === "day" && isHighlighted(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => onSelect(day)}
                  className="flex h-7 items-center justify-center outline-none"
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-md text-11 tabular-nums transition-colors duration-150",
                      isSameMonth(day, shownMonth)
                        ? "text-white/80"
                        : "text-white/30",
                      isToday
                        ? "bg-red-500 font-semibold text-white"
                        : dayHighlighted
                          ? "bg-white/[0.1] text-white"
                          : "hover:bg-white/[0.08]",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
