import { format, isSameDay, isWeekend } from "date-fns";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  HOUR_HEIGHT,
  layoutAllDayEvents,
  layoutDayEvents,
} from "./calendar-layout";
import { toWallClock } from "./calendar-timezone";
import type {
  AllDayCalendarEvent,
  CalendarEvent,
  TimedCalendarEvent,
} from "./calendar-types";
import { TimeZonePicker } from "./timezone-picker";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const ALL_DAY_ROW_HEIGHT = 22;
const COMPACT_EVENT_HEIGHT = 34;
const GUTTER = "3.5rem";
// Header and body scroll independently; a stable gutter on both keeps their
// columns aligned regardless of the body's scrollbar.
const COLUMNS_CLASS = "grid [scrollbar-gutter:stable]";

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TimeGrid({
  days,
  events,
  colorOf,
  selectedEventId,
  timeZone,
  onTimeZoneChange,
  onSelectDay,
  onSelectEvent,
}: {
  days: Date[];
  /** Timed events already converted to wall-clock time in `timeZone`. */
  events: CalendarEvent[];
  colorOf: (calendarId: string) => string;
  selectedEventId: string | null;
  timeZone: string;
  onTimeZoneChange: (timeZone: string) => void;
  onSelectDay: (day: Date) => void;
  onSelectEvent: (eventId: string, anchor: HTMLElement) => void;
}) {
  const now = toWallClock(useNow(), timeZone);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridTemplateColumns = `${GUTTER} repeat(${days.length}, minmax(0, 1fr))`;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const current = toWallClock(new Date(), timeZone);
    const minutes = current.getHours() * 60 + current.getMinutes() - 90;
    el.scrollTop = Math.max(0, (minutes / 60) * HOUR_HEIGHT);
  }, [timeZone]);

  const timed = events.filter((e): e is TimedCalendarEvent => !e.allDay);
  const allDay = layoutAllDayEvents(
    events.filter((e): e is AllDayCalendarEvent => e.allDay),
    days[0],
    days.length,
  );
  const allDayRows = Math.max(1, ...allDay.map((e) => e.row + 1));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;
  const todayIso = format(now, "yyyy-MM-dd");
  const todayIndex = days.findIndex((d) => isSameDay(d, now));
  const hourLabels = HOURS.slice(1).filter(
    (h) => todayIndex === -1 || Math.abs(h * 60 - nowMinutes) >= 20,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(COLUMNS_CLASS, "shrink-0 overflow-hidden")}
        style={{ gridTemplateColumns }}
      >
        <div className="flex items-center justify-end pr-1">
          <TimeZonePicker timeZone={timeZone} onChange={onTimeZoneChange} />
        </div>
        {days.map((day) => {
          const isToday = isSameDay(day, now);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(day)}
              className="flex h-8 items-center justify-center gap-1.5 text-12 outline-none"
            >
              <span
                className={cn(
                  isWeekend(day) ? "text-white/40" : "text-white/55",
                )}
              >
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-md px-1 tabular-nums",
                  isToday
                    ? "bg-red-500 font-semibold text-white"
                    : isWeekend(day)
                      ? "text-white/40"
                      : "text-white/75",
                )}
              >
                {format(day, "d")}
              </span>
            </button>
          );
        })}

        <div className="flex items-start justify-end border-y border-white/[0.06] pt-1.5 pr-2 text-10 text-white/35">
          All-day
        </div>
        <div
          className="relative border-y border-white/[0.06]"
          style={{
            gridColumn: `2 / span ${days.length}`,
            height: allDayRows * ALL_DAY_ROW_HEIGHT + 6,
          }}
        >
          <DayDividers days={days} />
          {allDay.map(({ event, startCol, span, row }) => (
            <div
              key={event.id}
              className="absolute px-0.5"
              style={{
                left: `${(startCol / days.length) * 100}%`,
                width: `${(span / days.length) * 100}%`,
                top: 3 + row * ALL_DAY_ROW_HEIGHT,
                height: ALL_DAY_ROW_HEIGHT - 2,
              }}
            >
              <EventChip
                title={event.title}
                color={colorOf(event.calendarId)}
                past={event.endDate <= todayIso}
                selected={event.id === selectedEventId}
                onSelect={(anchor) => onSelectEvent(event.id, anchor)}
                className="h-full items-center"
              />
            </div>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(COLUMNS_CLASS, "min-h-0 flex-1 overflow-y-auto")}
        style={{ gridTemplateColumns }}
      >
        <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
          {hourLabels.map((h) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 text-10 tabular-nums text-white/35"
              style={{ top: h * HOUR_HEIGHT }}
            >
              {format(new Date(2000, 0, 1, h), "h a")}
            </span>
          ))}
          {todayIndex !== -1 && (
            <span
              className="absolute right-1 z-10 -translate-y-1/2 rounded-[4px] bg-red-500 px-1 py-px text-10 font-medium tabular-nums text-white"
              style={{ top: nowTop }}
            >
              {format(now, "h:mma")}
            </span>
          )}
        </div>

        <div
          className="relative"
          style={{
            gridColumn: `2 / span ${days.length}`,
            height: 24 * HOUR_HEIGHT,
          }}
        >
          {HOURS.slice(1).map((h) => (
            <div
              key={h}
              className="absolute inset-x-0 h-px bg-white/[0.05]"
              style={{ top: h * HOUR_HEIGHT }}
            />
          ))}
          <DayDividers days={days} />
          {todayIndex !== -1 && days.length > 1 && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 h-px bg-red-400/50"
              style={{ top: nowTop }}
            />
          )}

          {days.map((day, i) => (
            <div
              key={day.toISOString()}
              className="absolute inset-y-0"
              style={{
                left: `${(i / days.length) * 100}%`,
                width: `${(1 / days.length) * 100}%`,
              }}
            >
              {layoutDayEvents(timed, day).map(
                ({ event, top, height, column, columns }) => (
                  <div
                    key={event.id}
                    className="absolute px-0.5 pb-px"
                    style={{
                      top,
                      height,
                      left: `${(column / columns) * 100}%`,
                      width: `${(1 / columns) * 100}%`,
                    }}
                  >
                    <EventChip
                      title={event.title}
                      past={event.end <= now}
                      subtitle={
                        height < COMPACT_EVENT_HEIGHT
                          ? format(event.start, "h:mm")
                          : `${format(event.start, "h:mm")}–${format(event.end, "h:mm a")}`
                      }
                      color={colorOf(event.calendarId)}
                      selected={event.id === selectedEventId}
                      onSelect={(anchor) => onSelectEvent(event.id, anchor)}
                      className={cn(
                        "h-full",
                        height < COMPACT_EVENT_HEIGHT
                          ? "items-center gap-1.5 py-0"
                          : "flex-col",
                      )}
                    />
                  </div>
                ),
              )}
              {i === todayIndex && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 h-px bg-red-500"
                  style={{ top: nowTop }}
                >
                  <span className="absolute -top-[3px] -left-[3px] size-[7px] rounded-full bg-red-500" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayDividers({ days }: { days: Date[] }) {
  return days.map((day, i) => (
    <div
      key={day.toISOString()}
      className="pointer-events-none absolute inset-y-0 w-px bg-white/[0.05]"
      style={{ left: `${(i / days.length) * 100}%` }}
    />
  ));
}

// Relative luminance (WCAG) decides whether a solid calendar-color fill needs
// dark text; pale provider colors like #9fe1e7 are unreadable under white.
function isLightColor(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return false;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(match[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}

function EventChip({
  title,
  subtitle,
  color,
  past,
  selected,
  onSelect,
  className,
}: {
  title: string;
  subtitle?: string;
  color: string;
  /** Already over; drawn faded like Notion so the rest of the day stands out. */
  past: boolean;
  selected: boolean;
  onSelect: (anchor: HTMLElement) => void;
  className?: string;
}) {
  const darkText = selected && isLightColor(color);
  return (
    <button
      type="button"
      onClick={(e) => onSelect(e.currentTarget)}
      aria-pressed={selected}
      className={cn(
        "flex w-full overflow-hidden rounded-[5px] border-l-[3px] px-1.5 py-0.5 text-left text-11 leading-tight outline-none transition-[filter,opacity] duration-150 hover:brightness-125 focus-visible:ring-1 focus-visible:ring-white/40",
        past && !selected && "opacity-50 hover:opacity-75",
        className,
      )}
      style={{
        borderLeftColor: color,
        background: selected
          ? color
          : `color-mix(in oklab, ${color} 28%, transparent)`,
      }}
    >
      <span
        className={cn(
          "truncate font-medium",
          darkText ? "text-black/85" : "text-white/90",
        )}
      >
        {title}
      </span>
      {subtitle && (
        <span
          className={cn(
            "shrink-0 truncate text-10",
            darkText
              ? "text-black/60"
              : selected
                ? "text-white/80"
                : "text-white/55",
          )}
        >
          {subtitle}
        </span>
      )}
    </button>
  );
}
