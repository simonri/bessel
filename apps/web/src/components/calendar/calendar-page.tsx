import type { EditScope } from "@bessel/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { addDays, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { IconButton, SoftButton } from "@/components/ui-kit";
import { userStorage } from "@/lib/user-storage";
import { headerMonth, visibleDays } from "./calendar-dates";
import { CalendarSidebar } from "./calendar-sidebar";
import { toWallClock, useCalendarTimeZone } from "./calendar-timezone";
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarViewMode,
  Reply,
} from "./calendar-types";
import {
  DeletePrompt,
  EventContextMenu,
  type EventMenuOptions,
} from "./event-context-menu";
import { EventPopover, readOnlyReason } from "./event-details-popover";
import type { EditorSubject, SaveRequest } from "./event-editor";
import type { EventDraftTiming } from "./event-payload";
import { PeopleProvider } from "./people";
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
  | "isSaving"
  | "isReplying"
  | "createEvent"
  | "updateEvent"
  | "deleteEvent"
  | "respondToEvent"
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
  return userStorage.getItem(DEFAULT_CALENDAR_KEY);
}

function rememberCalendarId(id: string) {
  userStorage.setItem(DEFAULT_CALENDAR_KEY, id);
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
  const [pendingDelete, setPendingDelete] = useState<{
    event: CalendarEvent;
    anchor: HTMLElement | null;
  } | null>(null);
  // While the editor holds unsaved changes, other selections wait; the
  // popover asks whether to discard them.
  const [editorDirty, setEditorDirty] = useState(false);

  // Navigating away unmounts the anchor chip; drop the selection with it.
  const rangeKey = `${view}:${days[0].toDateString()}`;
  const [selectionRange, setSelectionRange] = useState(rangeKey);
  if (selectionRange !== rangeKey) {
    setSelectionRange(rangeKey);
    // A draft on the newly shown days survives.
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

  const menuOptions = (event: CalendarEvent): EventMenuOptions => {
    const calendar = calendarById.get(event.calendarId);
    const account = calendar && accountById.get(calendar.accountId);
    return {
      colors:
        account?.provider === "google" &&
        account.canWrite &&
        calendar?.writable === true,
      delete: editableIds.has(event.id),
    };
  };

  const setColor = (event: CalendarEvent, colorId: string | null) => {
    // A colour is the viewer's own: never email guests about it.
    mutations
      .updateEvent(event, { colorId }, { notifyGuests: false })
      .catch(() => {});
  };

  const renderMenu = (event: CalendarEvent, chip: () => HTMLElement | null) => {
    const options = menuOptions(event);
    if (!options.colors && !options.delete) return null;
    return (
      <EventContextMenu
        colorId={event.details.colorId}
        options={options}
        onColor={(colorId) => setColor(event, colorId)}
        onDelete={() => setPendingDelete({ event, anchor: chip() })}
      />
    );
  };

  const confirmDelete = async (scope: EditScope, notifyGuests: boolean) => {
    if (!pendingDelete) return;
    const { event } = pendingDelete;
    setPendingDelete(null);
    if (selection?.kind === "event" && selection.eventId === event.id) {
      setSelection(null);
    }
    // Reported by the mutation, which also puts the event back.
    await mutations.deleteEvent(event, { scope, notifyGuests }).catch(() => {});
  };

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

  // Delete (or Backspace) removes the selected event, after the same prompt
  // as the right-click menu; never while typing.
  const deleteKeyTarget =
    selectedEvent && !editorDirty && menuOptions(selectedEvent).delete
      ? selectedEvent
      : null;
  useEffect(() => {
    if (!deleteKeyTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      e.preventDefault();
      setSelection(null);
      setPendingDelete({ event: deleteKeyTarget, anchor });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteKeyTarget, anchor]);

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

  const reply = (answer: Reply, scope: EditScope) => {
    if (!selectedEvent) return;
    // Errors are reported and the answer is rolled back by the mutation.
    mutations.respondToEvent(selectedEvent, answer, scope).catch(() => {});
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

  const step = view === "week" ? 7 : 1;
  const title = headerMonth(days, today);

  return (
    <PeopleProvider events={events}>
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
              <SelectTrigger
                size="sm"
                aria-label="View"
                // Same soft look as the buttons beside it.
                className="w-24 min-w-0 border-transparent bg-white/[0.06] font-medium text-white/75 shadow-none hover:border-transparent hover:bg-white/[0.1] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
              >
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
            renderMenu={renderMenu}
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
            onReply={reply}
            replying={mutations.isReplying}
            onReconnect={actions.connectGoogle}
            onClose={() => setSelection(null)}
            onDirtyChange={setEditorDirty}
          />
          <DeletePrompt
            key={`delete:${pendingDelete?.event.id ?? ""}`}
            anchor={pendingDelete?.anchor ?? null}
            recurring={pendingDelete?.event.details.recurring ?? false}
            hasGuests={
              !!pendingDelete &&
              accountById.get(
                calendarById.get(pendingDelete.event.calendarId)?.accountId ??
                  "",
              )?.provider === "google" &&
              pendingDelete.event.details.attendees.length > 0
            }
            onConfirm={(scope, notifyGuests) =>
              void confirmDelete(scope, notifyGuests)
            }
            onCancel={() => setPendingDelete(null)}
          />
          <MovePrompt
            key={`move:${pendingMove?.eventId ?? ""}`}
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
    </PeopleProvider>
  );
}

const EMPTY_DETAILS: CalendarEvent["details"] = {
  location: null,
  description: null,
  creatorName: null,
  creatorEmail: null,
  attendees: [],
  myResponse: null,
  colorId: null,
  conferenceUrl: null,
  htmlLink: null,
  busy: true,
  recurring: false,
  visibility: null,
  editable: true,
  rule: null,
  recurrence: null,
};
