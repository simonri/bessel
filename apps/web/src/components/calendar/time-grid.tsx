import {
  ContextMenu,
  ContextMenuTrigger,
} from "@bessel/ui/components/context-menu";
import { format, isSameDay, parseISO } from "date-fns";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import { eventColor } from "./event-colors";
import type { EventDraftTiming } from "./event-payload";
import {
  allDayRange,
  createRange,
  DRAG_THRESHOLD_PX,
  dayIndexAt,
  minuteDelta,
  minutesAt,
  moveTiming,
  resizeStartTiming,
  resizeTiming,
  sameTiming,
} from "./grid-geometry";
import { TimeZonePicker } from "./timezone-picker";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const ALL_DAY_ROW_HEIGHT = 22;
const COMPACT_EVENT_HEIGHT = 34;
const GUTTER = "3.5rem";
// Header and body scroll independently; a stable gutter on both keeps their
// columns aligned regardless of the body's scrollbar.
const COLUMNS_CLASS = "grid [scrollbar-gutter:stable]";
/** Id of the not-yet-saved event shown while creating one. */
export const DRAFT_ID = "__draft__";

type Interaction =
  | { kind: "create"; dayIndex: number; from: number; to: number }
  | { kind: "create-all-day"; from: number; to: number }
  | {
      kind: "move" | "resize-start" | "resize-end";
      eventId: string;
      timing: EventDraftTiming;
      originX: number;
      originY: number;
      originDay: number;
      days: number;
      minutes: number;
      started: boolean;
    };

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function timingOf(event: CalendarEvent): EventDraftTiming {
  return event.allDay
    ? {
        allDay: true,
        start: parseISO(event.startDate),
        end: parseISO(event.endDate),
      }
    : { allDay: false, start: event.start, end: event.end };
}

export function withTiming(
  event: CalendarEvent,
  timing: EventDraftTiming,
): CalendarEvent {
  if (timing.allDay) {
    return {
      ...event,
      allDay: true,
      startDate: format(timing.start, "yyyy-MM-dd"),
      endDate: format(timing.end, "yyyy-MM-dd"),
    } as AllDayCalendarEvent;
  }
  return {
    ...event,
    allDay: false,
    start: timing.start,
    end: timing.end,
  } as TimedCalendarEvent;
}

function point(e: { clientX: number; clientY: number }, el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    width: rect.width,
  };
}

/** React bubbles events out of portals (an event's right-click menu) into
 *  their owner's handlers; the grid only reacts to presses on its own DOM. */
function fromPortal(e: { currentTarget: EventTarget; target: EventTarget }) {
  return !(
    e.target instanceof Node && (e.currentTarget as Node).contains(e.target)
  );
}

function onEventChip(target: EventTarget): boolean {
  return (
    target instanceof Element && target.closest("[data-event-chip]") !== null
  );
}

export function TimeGrid({
  days,
  events,
  colorOf,
  selectedEventId,
  editableIds,
  renderMenu,
  canCreate,
  timeZone,
  onTimeZoneChange,
  onSelectDay,
  onSelectEvent,
  onSelectedAnchor,
  onCreate,
  onMove,
}: {
  days: Date[];
  /** Timed events already converted to wall-clock time in `timeZone`. */
  events: CalendarEvent[];
  colorOf: (calendarId: string) => string;
  selectedEventId: string | null;
  /** Events the user may drag and resize. */
  editableIds: ReadonlySet<string>;
  /** The right-click menu for an event (given its chip), if it has one. */
  renderMenu?: (
    event: CalendarEvent,
    chip: () => HTMLElement | null,
  ) => ReactNode;
  canCreate: boolean;
  timeZone: string;
  onTimeZoneChange: (timeZone: string) => void;
  onSelectDay: (day: Date) => void;
  onSelectEvent: (eventId: string) => void;
  /** Reports the selected event's chip, which anchors its popover. */
  onSelectedAnchor: (element: HTMLElement | null) => void;
  onCreate: (timing: EventDraftTiming) => void;
  onMove: (
    eventId: string,
    timing: EventDraftTiming,
    anchor: HTMLElement | null,
  ) => void;
}) {
  const now = toWallClock(useNow(), timeZone);
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const allDayRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<string, HTMLElement>());
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  // A drag ends with a click on whatever is under the pointer; ignore it.
  const suppressClick = useRef(false);
  // Pointer capture retargets a double click on a chip to the grid, so
  // remember whether the press that led to it was on empty space. Set while
  // capturing: a chip's own press handler stops the event from bubbling.
  const pressedEmpty = useRef(false);
  const gridTemplateColumns = `${GUTTER} repeat(${days.length}, minmax(0, 1fr))`;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const current = toWallClock(new Date(), timeZone);
    const minutes = current.getHours() * 60 + current.getMinutes() - 90;
    el.scrollTop = Math.max(0, (minutes / 60) * HOUR_HEIGHT);
  }, [timeZone]);

  // Bring a newly selected chip into view (e.g. a draft from "New" at a time
  // that's scrolled away); visible chips don't move.
  const scrolledTo = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (selectedEventId === scrolledTo.current) return;
    scrolledTo.current = selectedEventId;
    const chip = selectedEventId ? chipRefs.current.get(selectedEventId) : null;
    chip?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  });

  // The popover anchors to the selected chip, which can be replaced when the
  // grid re-lays out; report it after every commit (unchanged ones are no-ops).
  useLayoutEffect(() => {
    onSelectedAnchor(
      selectedEventId ? (chipRefs.current.get(selectedEventId) ?? null) : null,
    );
  });

  useEffect(() => {
    if (!interaction) return;
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInteraction(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [interaction]);

  const previewTiming = (current: Interaction): EventDraftTiming | null => {
    if (current.kind !== "create" && current.kind !== "create-all-day") {
      if (!current.started) return null;
      return current.kind === "move"
        ? moveTiming(current.timing, current.days, current.minutes)
        : current.kind === "resize-start"
          ? resizeStartTiming(current.timing, current.minutes)
          : resizeTiming(current.timing, current.minutes);
    }
    return null;
  };

  const preview = interaction ? previewTiming(interaction) : null;
  const draggedId =
    interaction &&
    interaction.kind !== "create" &&
    interaction.kind !== "create-all-day"
      ? interaction.eventId
      : null;
  const shown = events.map((event) =>
    preview && event.id === draggedId ? withTiming(event, preview) : event,
  );
  if (
    (interaction?.kind === "create" ||
      interaction?.kind === "create-all-day") &&
    interaction.from !== interaction.to
  ) {
    const timing =
      interaction.kind === "create"
        ? createRange(
            days[interaction.dayIndex],
            interaction.from,
            interaction.to,
          )
        : allDayRange(days, interaction.from, interaction.to);
    shown.push(
      withTiming(
        {
          id: DRAFT_ID,
          calendarId: "",
          title: "",
          details: {} as CalendarEvent["details"],
          allDay: false,
          start: timing.start,
          end: timing.end,
        },
        timing,
      ),
    );
  }

  const startEventDrag = (
    e: ReactPointerEvent,
    event: CalendarEvent,
    kind: "move" | "resize-start" | "resize-end",
    container: HTMLElement | null,
  ) => {
    if (e.button !== 0 || !container || !editableIds.has(event.id)) return;
    e.stopPropagation();
    container.setPointerCapture(e.pointerId);
    const p = point(e, container);
    setInteraction({
      kind,
      eventId: event.id,
      timing: timingOf(event),
      originX: p.x,
      originY: p.y,
      originDay: dayIndexAt(p.x, p.width, days.length),
      days: 0,
      minutes: 0,
      started: false,
    });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!interaction) return;
    const p = point(e, e.currentTarget);
    if (interaction.kind === "create") {
      setInteraction({ ...interaction, to: minutesAt(p.y) });
    } else if (interaction.kind === "create-all-day") {
      setInteraction({
        ...interaction,
        to: dayIndexAt(p.x, p.width, days.length),
      });
    } else {
      const moved = Math.hypot(
        p.x - interaction.originX,
        p.y - interaction.originY,
      );
      if (!interaction.started && moved < DRAG_THRESHOLD_PX) return;
      setInteraction({
        ...interaction,
        started: true,
        days:
          interaction.kind === "move"
            ? dayIndexAt(p.x, p.width, days.length) - interaction.originDay
            : 0,
        minutes: interaction.timing.allDay
          ? 0
          : minuteDelta(p.y - interaction.originY),
      });
    }
  };

  const onPointerUp = () => {
    const current = interaction;
    setInteraction(null);
    if (!current) return;
    if (current.kind === "create" || current.kind === "create-all-day") {
      // A click alone doesn't create; that takes a drag or a double click.
      if (current.from === current.to) return;
      onCreate(
        current.kind === "create"
          ? createRange(days[current.dayIndex], current.from, current.to)
          : allDayRange(days, current.from, current.to),
      );
    } else {
      // Pointer capture sends the click to the grid instead of the chip, so a
      // press that never became a drag is the click; swallow the duplicate.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      });
      if (!current.started) {
        onSelectEvent(current.eventId);
        return;
      }
      const timing = previewTiming(current);
      if (timing && !sameTiming(timing, current.timing)) {
        onMove(
          current.eventId,
          timing,
          chipRefs.current.get(current.eventId) ?? null,
        );
      }
    }
  };

  const draftOr = (event: CalendarEvent, color: string) =>
    event.id === DRAFT_ID ? undefined : color;
  const chipColor = (event: CalendarEvent) =>
    eventColor(event.details.colorId) ?? colorOf(event.calendarId);

  const chipProps = (event: CalendarEvent) => ({
    menu:
      event.id === DRAFT_ID
        ? undefined
        : renderMenu?.(event, () => chipRefs.current.get(event.id) ?? null),
    selected: event.id === selectedEventId,
    draft: event.id === DRAFT_ID,
    dragging: event.id === draggedId && preview !== null,
    editable: editableIds.has(event.id),
    unconfirmed: event.details.myResponse === "needs_action",
    chipRef: (el: HTMLElement | null) => {
      if (el) chipRefs.current.set(event.id, el);
      else chipRefs.current.delete(event.id);
    },
    onSelect: () => {
      if (!suppressClick.current && event.id !== DRAFT_ID)
        onSelectEvent(event.id);
    },
  });

  const timed = shown.filter((e): e is TimedCalendarEvent => !e.allDay);
  const allDay = layoutAllDayEvents(
    shown.filter((e): e is AllDayCalendarEvent => e.allDay),
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
              title="Double-click to show this day"
              onDoubleClick={() => onSelectDay(day)}
              className="flex h-8 items-center justify-center gap-1.5 text-12 text-white/40 outline-none"
            >
              <span>{format(day, "EEE")}</span>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-md px-1 tabular-nums",
                  isToday && "bg-red-500 font-semibold text-white",
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
          ref={allDayRef}
          className="relative touch-none border-y border-white/[0.06]"
          style={{
            gridColumn: `2 / span ${days.length}`,
            height: allDayRows * ALL_DAY_ROW_HEIGHT + 6,
          }}
          onPointerDownCapture={(e) => {
            pressedEmpty.current = !fromPortal(e) && !onEventChip(e.target);
          }}
          onPointerDown={(e) => {
            if (!canCreate || e.button !== 0 || !pressedEmpty.current) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = point(e, e.currentTarget);
            const index = dayIndexAt(p.x, p.width, days.length);
            setInteraction({ kind: "create-all-day", from: index, to: index });
          }}
          onDoubleClick={(e) => {
            if (!canCreate || !pressedEmpty.current || fromPortal(e)) return;
            const p = point(e, e.currentTarget);
            const index = dayIndexAt(p.x, p.width, days.length);
            onCreate(allDayRange(days, index, index));
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setInteraction(null)}
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
                color={chipColor(event)}
                accent={draftOr(event, colorOf(event.calendarId))}
                past={event.endDate <= todayIso}
                onDragStart={(e) =>
                  startEventDrag(e, event, "move", allDayRef.current)
                }
                className="h-full items-center"
                {...chipProps(event)}
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
          ref={columnsRef}
          className="relative touch-none select-none"
          style={{
            gridColumn: `2 / span ${days.length}`,
            height: 24 * HOUR_HEIGHT,
          }}
          onPointerDownCapture={(e) => {
            pressedEmpty.current = !fromPortal(e) && !onEventChip(e.target);
          }}
          onPointerDown={(e) => {
            if (!canCreate || e.button !== 0 || !pressedEmpty.current) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = point(e, e.currentTarget);
            const minutes = minutesAt(p.y);
            setInteraction({
              kind: "create",
              dayIndex: dayIndexAt(p.x, p.width, days.length),
              from: minutes,
              to: minutes,
            });
          }}
          onDoubleClick={(e) => {
            if (!canCreate || !pressedEmpty.current || fromPortal(e)) return;
            const p = point(e, e.currentTarget);
            const minutes = minutesAt(p.y);
            onCreate(
              createRange(
                days[dayIndexAt(p.x, p.width, days.length)],
                minutes,
                minutes,
              ),
            );
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setInteraction(null)}
        >
          {HOURS.slice(1).map((h) => (
            <div
              key={h}
              className="pointer-events-none absolute inset-x-0 h-px bg-white/[0.05]"
              style={{ top: h * HOUR_HEIGHT }}
            />
          ))}
          <DayDividers days={days} />
          {todayIndex !== -1 && days.length > 1 && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 h-px bg-red-400/25"
              style={{ top: nowTop }}
            />
          )}

          {days.map((day, i) => (
            <div
              key={day.toISOString()}
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `${(i / days.length) * 100}%`,
                width: `${(1 / days.length) * 100}%`,
              }}
            >
              {layoutDayEvents(timed, day).map(
                ({ event, top, height, column, columns }) => (
                  <div
                    key={event.id}
                    className="pointer-events-auto absolute px-0.5 pb-px"
                    style={{
                      top,
                      height,
                      left: `${(column / columns) * 100}%`,
                      width: `${(1 / columns) * 100}%`,
                    }}
                  >
                    <EventChip
                      title={event.title}
                      past={event.end <= now && event.id !== DRAFT_ID}
                      subtitle={
                        height < COMPACT_EVENT_HEIGHT
                          ? format(event.start, "h:mm")
                          : `${format(event.start, "h:mm")}–${format(event.end, "h:mm a")}`
                      }
                      color={chipColor(event)}
                      accent={draftOr(event, colorOf(event.calendarId))}
                      onDragStart={(e) =>
                        startEventDrag(e, event, "move", columnsRef.current)
                      }
                      onResizeStart={(edge, e) =>
                        startEventDrag(
                          e,
                          event,
                          edge === "start" ? "resize-start" : "resize-end",
                          columnsRef.current,
                        )
                      }
                      className={cn(
                        "h-full",
                        height < COMPACT_EVENT_HEIGHT
                          ? "items-center gap-1.5 py-0"
                          : "flex-col",
                      )}
                      {...chipProps(event)}
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
/** `color` blended into the app background: a solid tint, not a transparent one. */
function onBackground(color: string, percent: number): string {
  return `color-mix(in oklab, ${color} ${percent}%, var(--background))`;
}

function isLightColor(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return false;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(match[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}

const DRAFT_COLOR = "#8b8b96";

function EventChip({
  title,
  subtitle,
  color,
  accent,
  past,
  selected,
  draft,
  dragging,
  editable,
  unconfirmed,
  menu,
  chipRef,
  onSelect,
  onDragStart,
  onResizeStart,
  className,
}: {
  title: string;
  subtitle?: string;
  color: string;
  /** The left bar: the calendar's colour, so a recoloured event still shows
   *  which calendar (and account) it belongs to. Defaults to `color`. */
  accent?: string;
  /** Already over; drawn faded like Notion so the rest of the day stands out. */
  past: boolean;
  selected: boolean;
  /** The unsaved event being created. */
  draft: boolean;
  dragging: boolean;
  editable: boolean;
  /** An invitation not yet answered: outlined with dashes, like Notion. */
  unconfirmed: boolean;
  /** Right-click menu content. */
  menu?: ReactNode;
  chipRef: (element: HTMLElement | null) => void;
  onSelect: () => void;
  onDragStart: (e: ReactPointerEvent) => void;
  /** Timed events: a drag on the top or bottom edge moves that end. */
  onResizeStart?: (edge: "start" | "end", e: ReactPointerEvent) => void;
  className?: string;
}) {
  const fill = draft ? DRAFT_COLOR : color;
  const solid = selected && !draft;
  const dashed = unconfirmed && !draft;
  const darkText = solid && isLightColor(fill);
  const bar = draft ? fill : (accent ?? fill);
  // Past events are drawn in quieter colours rather than see-through.
  const muted = past && !selected;
  const chip = (
    <button
      ref={chipRef}
      type="button"
      data-event-chip
      onClick={onSelect}
      onPointerDown={editable ? onDragStart : undefined}
      aria-pressed={selected}
      className={cn(
        "group/chip relative flex w-full overflow-hidden rounded-[5px] border-l-[3px] px-1.5 py-0.5 text-left text-11 leading-tight outline-none transition-[filter] duration-150 focus-visible:ring-1 focus-visible:ring-white/40",
        !selected && "hover:brightness-125",
        editable && "cursor-grab active:cursor-grabbing",
        draft && "border border-dashed border-white/40",
        dashed && !solid && "border border-l border-dashed",
        dragging && "z-20 shadow-lg ring-1 ring-white/30",
        className,
      )}
      style={{
        ...(dashed && !solid
          ? { borderColor: onBackground(fill, 55) }
          : {
              borderLeftColor: muted ? onBackground(bar, 45) : bar,
            }),
        // Opaque, so the grid lines never show through an event.
        background: solid
          ? fill
          : onBackground(fill, dashed ? 10 : muted ? 13 : 28),
      }}
    >
      <span
        className={cn(
          "truncate font-medium",
          darkText
            ? "text-black/85"
            : (draft && !title) || muted
              ? "text-white/45"
              : "text-white/90",
        )}
      >
        {title || (draft ? "New event" : "(No title)")}
      </span>
      {subtitle && (
        <span
          className={cn(
            "shrink-0 truncate text-10",
            darkText
              ? "text-black/60"
              : solid
                ? "text-white/80"
                : muted
                  ? "text-white/35"
                  : "text-white/55",
          )}
        >
          {subtitle}
        </span>
      )}
      {editable &&
        onResizeStart &&
        (["start", "end"] as const).map((edge) => (
          // Invisible strip along the edge; only the cursor gives it away.
          <span
            key={edge}
            aria-hidden
            data-resize-edge={edge}
            onPointerDown={(e) => onResizeStart(edge, e)}
            className={cn(
              "absolute inset-x-0 h-1.5 cursor-ns-resize",
              edge === "start" ? "top-0" : "bottom-0",
            )}
          />
        ))}
    </button>
  );
  if (!menu) return chip;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{chip}</ContextMenuTrigger>
      {menu}
    </ContextMenu>
  );
}
