import type { EditScope } from "@bessel/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { addDays, format, isSameDay, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight, PanelLeft, Plus } from "lucide-react";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { IconButton, SoftButton } from "@/components/ui-kit";
import { visibleDays } from "./calendar-dates";
import { CalendarSidebar } from "./calendar-sidebar";
import { toWallClock, useCalendarTimeZone } from "./calendar-timezone";
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarViewMode,
} from "./calendar-types";
import { EventPopover, readOnlyReason } from "./event-details-popover";
import type { EditorSubject, SaveRequest } from "./event-editor";
import type { EventDraftTiming } from "./event-payload";
import { MovePrompt, moveNeedsPrompt } from "./scope-menu";
import { DRAFT_ID, TimeGrid, timingOf, withTiming } from "./time-grid";
import { useCalendarChanges } from "./use-calendar-changes";
import {
  type CalendarActions,
  type CalendarData,
  useCalendarActions,
  useCalendarData,
} from "./use-calendar-data";
import { type EventMutations, useEventMutations } from "./use-event-mutations";

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

export function useCalendarNavigation(timeZone: string): CalendarNavigation {
  const [date, setDate] = useState(() => toWallClock(new Date(), timeZone));
  const [view, setView] = useState<CalendarViewMode>("week");
  return { date, view, days: visibleDays(date, view), setDate, setView };
}

/** Event writes the view performs; the real implementation is useEventMutations. */
export type EventWriter = Pick<
  EventMutations,
  "isSaving" | "createEvent" | "updateEvent" | "deleteEvent"
>;

export function CalendarPage() {
  const [timeZone, setTimeZone] = useCalendarTimeZone();
  const nav = useCalendarNavigation(timeZone);
  // Visible days are wall-clock dates in `timeZone`, which can sit up to a day
  // away from the same dates locally; pad the fetch so edge events still load.
  const data = useCalendarData({
    start: addDays(nav.days[0], -1),
    end: addDays(nav.days[nav.days.length - 1], 2),
  });
  useCalendarChanges(data.accounts.length > 0);
  const actions = useCalendarActions();
  const mutations = useEventMutations(timeZone);
  return (
    <CalendarView
      nav={nav}
      data={data}
      actions={actions}
      mutations={mutations}
      timeZone={timeZone}
      onTimeZoneChange={setTimeZone}
    />
  );
}

const DEFAULT_CALENDAR_KEY = "bessel:calendar-default";

function rememberedCalendarId(): string | null {
  try {
    return localStorage.getItem(DEFAULT_CALENDAR_KEY);
  } catch {
    return null;
  }
}

function rememberCalendarId(id: string) {
  try {
    localStorage.setItem(DEFAULT_CALENDAR_KEY, id);
  } catch {
    // Storage unavailable; the default just isn't remembered.
  }
}

/** Where a new event goes: the last calendar used, else a primary one. */
export function defaultCalendarId(
  writable: CalendarInfo[],
  remembered: string | null,
): string | null {
  return (
    writable.find((c) => c.id === remembered)?.id ??
    writable.find((c) => c.primary)?.id ??
    writable[0]?.id ??
    null
  );
}

type Selection =
  | { kind: "event"; eventId: string }
  | { kind: "draft"; timing: EventDraftTiming; calendarId: string };

export function CalendarView({
  nav: { date, view, days, setDate, setView },
  data: { accounts, calendars, events },
  actions,
  mutations,
  timeZone,
  onTimeZoneChange,
}: {
  nav: CalendarNavigation;
  data: CalendarData;
  actions: CalendarActions;
  mutations: EventWriter;
  timeZone: string;
  onTimeZoneChange: (timeZone: string) => void;
}) {
  const today = toWallClock(new Date(), timeZone);
  // null follows the container width; the toggle pins it open or closed.
  const [sidebarPinned, setSidebarPinned] = useState<boolean | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const wide = useIsWide(rootRef);
  const sidebarOpen = sidebarPinned ?? wide;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // A dropped event that needs a scope or guest choice waits here, shown at
  // its new time, until the user answers.
  const [pendingMove, setPendingMove] = useState<{
    eventId: string;
    timing: EventDraftTiming;
    anchor: HTMLElement | null;
    recurring: boolean;
    hasGuests: boolean;
  } | null>(null);
  // While the editor holds unsaved changes, other selections wait; the
  // popover asks whether to discard them.
  const [editorDirty, setEditorDirty] = useState(false);

  // Navigating away unmounts the anchor chip; drop the selection with it.
  const rangeKey = `${view}:${days[0].toDateString()}`;
  const [selectionRange, setSelectionRange] = useState(rangeKey);
  if (selectionRange !== rangeKey) {
    setSelectionRange(rangeKey);
    // A draft made for the newly shown days (e.g. "New event") survives.
    setSelection((current) =>
      current?.kind === "draft" &&
      days.some((d) => isSameDay(d, current.timing.start))
        ? current
        : null,
    );
    setPendingMove(null);
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const calendarById = new Map(calendars.map((c) => [c.id, c]));
  const writableCalendars = calendars.filter(
    (c) => c.writable && !c.hidden && accountById.get(c.accountId)?.canWrite,
  );
  const hiddenCalendarIds = new Set(
    calendars.filter((c) => c.hidden).map((c) => c.id),
  );
  const visibleEvents: CalendarEvent[] = events
    .filter((e) => !hiddenCalendarIds.has(e.calendarId))
    .map((e) =>
      e.allDay
        ? e
        : {
            ...e,
            start: toWallClock(e.start, timeZone),
            end: toWallClock(e.end, timeZone),
          },
    );
  const editableIds = new Set(
    visibleEvents
      .filter((e) => {
        const calendar = calendarById.get(e.calendarId);
        const account = calendar && accountById.get(calendar.accountId);
        return readOnlyReason(e, calendar, account) === null;
      })
      .map((e) => e.id),
  );

  const displayEvents = visibleEvents.map((e) =>
    pendingMove?.eventId === e.id ? withTiming(e, pendingMove.timing) : e,
  );
  if (selection?.kind === "draft") {
    displayEvents.push(
      withTiming(
        {
          id: DRAFT_ID,
          calendarId: selection.calendarId,
          title: "",
          details: EMPTY_DETAILS,
          allDay: false,
          start: selection.timing.start,
          end: selection.timing.end,
        },
        selection.timing,
      ),
    );
  }

  // Looked up every render so a refetch updates the open popover, and an event
  // that disappeared on resync closes it.
  const selectedEvent =
    selection?.kind === "event"
      ? (visibleEvents.find((e) => e.id === selection.eventId) ?? null)
      : null;
  const subject: EditorSubject | null =
    selection?.kind === "draft"
      ? {
          event: null,
          timing: selection.timing,
          calendarId: selection.calendarId,
        }
      : selectedEvent
        ? {
            event: selectedEvent,
            timing: timingOf(selectedEvent),
            calendarId: selectedEvent.calendarId,
          }
        : null;
  const selectedId =
    selection?.kind === "draft" ? DRAFT_ID : (selectedEvent?.id ?? null);

  const startCreating = (timing: EventDraftTiming) => {
    if (editorDirty) return;
    const calendarId = defaultCalendarId(
      writableCalendars,
      rememberedCalendarId(),
    );
    if (!calendarId) {
      toast.info(
        "Connect a calendar account that allows editing to add events",
      );
      return;
    }
    setPendingMove(null);
    setSelection({ kind: "draft", timing, calendarId });
  };

  const save = async (request: SaveRequest) => {
    try {
      if (selection?.kind === "draft") {
        await mutations.createEvent(request.calendarId, request.changes, {
          notifyGuests: request.notifyGuests,
        });
        rememberCalendarId(request.calendarId);
      } else if (selectedEvent) {
        await mutations.updateEvent(selectedEvent, request.changes, {
          scope: request.scope,
          calendarId:
            request.calendarId !== selectedEvent.calendarId
              ? request.calendarId
              : undefined,
          notifyGuests: request.notifyGuests,
        });
      }
      setSelection(null);
    } catch {
      // The mutation already showed why; keep the editor open to retry.
    }
  };

  const remove = async (
    scope: EditScope | undefined,
    notifyGuests: boolean,
  ) => {
    if (!selectedEvent) return;
    try {
      await mutations.deleteEvent(selectedEvent, {
        scope: scope ?? "this",
        notifyGuests,
      });
      setSelection(null);
    } catch {
      // Already reported; the event is restored in place.
    }
  };

  const commitMove = (
    eventId: string,
    timing: EventDraftTiming,
    scope: EditScope,
    notifyGuests: boolean,
  ) => {
    const event = visibleEvents.find((e) => e.id === eventId);
    setPendingMove(null);
    if (!event) return;
    mutations
      .updateEvent(event, { timing }, { scope, notifyGuests })
      .catch(() => {});
  };

  const handleMove = (
    eventId: string,
    timing: EventDraftTiming,
    chip: HTMLElement | null,
  ) => {
    if (editorDirty) return;
    const event = visibleEvents.find((e) => e.id === eventId);
    if (!event) return;
    const account = accountById.get(
      calendarById.get(event.calendarId)?.accountId ?? "",
    );
    // Only Google lets Bessel choose; iCloud emails its guests itself.
    const hasGuests =
      account?.provider === "google" && event.details.attendees.length > 0;
    const recurring = event.details.recurring;
    if (moveNeedsPrompt({ recurring, notifiesGuests: hasGuests })) {
      setPendingMove({ eventId, timing, anchor: chip, recurring, hasGuests });
    } else {
      commitMove(eventId, timing, "this", false);
    }
  };

  const newEvent = () => {
    if (editorDirty) return;
    const now = toWallClock(new Date(), timeZone);
    const start = new Date(now);
    start.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
    if (!days.some((d) => isSameDay(d, start))) setDate(start);
    startCreating({
      allDay: false,
      start,
      end: new Date(start.getTime() + 3600_000),
    });
  };

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
          {writableCalendars.length > 0 && (
            <SoftButton onClick={newEvent} aria-label="New event">
              <Plus />
              New
            </SoftButton>
          )}
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
          <SoftButton
            onClick={() => setDate(toWallClock(new Date(), timeZone))}
          >
            Today
          </SoftButton>
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
          events={displayEvents}
          colorOf={(id) => calendarById.get(id)?.color ?? FALLBACK_COLOR}
          selectedEventId={selectedId}
          editableIds={editableIds}
          canCreate={writableCalendars.length > 0}
          timeZone={timeZone}
          onTimeZoneChange={onTimeZoneChange}
          onSelectDay={(day) => {
            setDate(day);
            setView("day");
          }}
          onSelectEvent={(eventId) =>
            !editorDirty &&
            setSelection((current) =>
              current?.kind === "event" && current.eventId === eventId
                ? null
                : { kind: "event", eventId },
            )
          }
          onSelectedAnchor={setAnchor}
          onCreate={startCreating}
          onMove={handleMove}
        />
        <EventPopover
          subject={subject}
          anchor={anchor}
          calendars={calendars}
          writableCalendars={writableCalendars}
          accounts={accounts}
          timeZone={timeZone}
          saving={mutations.isSaving}
          onSave={(request) => void save(request)}
          onDelete={(scope, notifyGuests) => void remove(scope, notifyGuests)}
          onReconnect={actions.connectGoogle}
          onClose={() => setSelection(null)}
          onDirtyChange={setEditorDirty}
        />
        <MovePrompt
          key={pendingMove?.eventId ?? "none"}
          anchor={pendingMove?.anchor ?? null}
          recurring={pendingMove?.recurring ?? false}
          hasGuests={pendingMove?.hasGuests ?? false}
          onConfirm={(scope, notifyGuests) =>
            pendingMove &&
            commitMove(
              pendingMove.eventId,
              pendingMove.timing,
              scope,
              notifyGuests,
            )
          }
          onCancel={() => setPendingMove(null)}
        />
      </div>
    </div>
  );
}

const EMPTY_DETAILS: CalendarEvent["details"] = {
  location: null,
  description: null,
  creatorName: null,
  creatorEmail: null,
  attendees: [],
  myResponse: null,
  conferenceUrl: null,
  htmlLink: null,
  busy: true,
  recurring: false,
  visibility: null,
  editable: true,
  rule: null,
  recurrence: null,
};
