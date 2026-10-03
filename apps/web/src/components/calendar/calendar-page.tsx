import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { addDays, format, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { IconButton, SoftButton } from "@/components/ui-kit";
import { visibleDays } from "./calendar-dates";
import { CalendarSidebar } from "./calendar-sidebar";
import type { CalendarViewMode } from "./calendar-types";
import { TimeGrid } from "./time-grid";
import {
  type CalendarActions,
  type CalendarData,
  useCalendarActions,
  useCalendarData,
} from "./use-calendar-data";

const FALLBACK_COLOR = "#6b7280";
const SIDEBAR_MIN_WIDTH = 1024;

function useIsWide(ref: RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWide(entry.contentRect.width >= SIDEBAR_MIN_WIDTH),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return wide;
}

export interface CalendarNavigation {
  date: Date;
  view: CalendarViewMode;
  days: Date[];
  setDate: (date: Date | ((prev: Date) => Date)) => void;
  setView: (view: CalendarViewMode) => void;
}

export function useCalendarNavigation(): CalendarNavigation {
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<CalendarViewMode>("week");
  return { date, view, days: visibleDays(date, view), setDate, setView };
}

export function CalendarPage() {
  const nav = useCalendarNavigation();
  const data = useCalendarData({
    start: nav.days[0],
    end: addDays(nav.days[nav.days.length - 1], 1),
  });
  const actions = useCalendarActions();
  return <CalendarView nav={nav} data={data} actions={actions} />;
}

export function CalendarView({
  nav: { date, view, days, setDate, setView },
  data: { accounts, calendars, events },
  actions,
}: {
  nav: CalendarNavigation;
  data: CalendarData;
  actions: CalendarActions;
}) {
  const today = new Date();
  // null follows the container width; the toggle pins it open or closed.
  const [sidebarPinned, setSidebarPinned] = useState<boolean | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const wide = useIsWide(rootRef);
  const sidebarOpen = sidebarPinned ?? wide;
  const colorById = new Map(calendars.map((c) => [c.id, c.color]));
  const hiddenCalendarIds = new Set(
    calendars.filter((c) => c.hidden).map((c) => c.id),
  );
  const visibleEvents = events.filter(
    (e) => !hiddenCalendarIds.has(e.calendarId),
  );

  const step = view === "week" ? 7 : 1;
  const first = days[0];
  const last = days[days.length - 1];
  const title = isSameMonth(first, last)
    ? format(first, "MMMM yyyy")
    : `${format(first, "MMM")} – ${format(last, "MMM yyyy")}`;

  return (
    <div ref={rootRef} className="flex h-full min-h-0">
      {sidebarOpen && (
        <CalendarSidebar
          date={date}
          view={view}
          today={today}
          accounts={accounts}
          calendars={calendars}
          actions={actions}
          onSelectDate={setDate}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
          <IconButton
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            onClick={() => setSidebarPinned(!sidebarOpen)}
          >
            <PanelLeft />
          </IconButton>
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-white/90">
            {title}
          </h2>
          <Select
            value={view}
            onValueChange={(v) => setView(v as CalendarViewMode)}
          >
            <SelectTrigger className="h-7 w-24 min-w-0 rounded-md border-white/10 bg-white/[0.04] text-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="day">Day</SelectItem>
            </SelectContent>
          </Select>
          <SoftButton onClick={() => setDate(new Date())}>Today</SoftButton>
          <div className="flex">
            <IconButton
              title={view === "week" ? "Previous week" : "Previous day"}
              onClick={() => setDate((d) => addDays(d, -step))}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              title={view === "week" ? "Next week" : "Next day"}
              onClick={() => setDate((d) => addDays(d, step))}
            >
              <ChevronRight />
            </IconButton>
          </div>
        </header>

        <TimeGrid
          days={days}
          events={visibleEvents}
          colorOf={(id) => colorById.get(id) ?? FALLBACK_COLOR}
          onSelectDay={(day) => {
            setDate(day);
            setView("day");
          }}
        />
      </div>
    </div>
  );
}
