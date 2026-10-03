import {
  type CalendarEventListResponse,
  type CalendarEventSchema,
  createCalendarEventV1CalendarsCalendarIdEventsPostMutation,
  deleteCalendarEventV1CalendarsEventsEventIdDeleteMutation,
  type EditScope,
  type EventUpdate,
  type RecurrenceSchema,
  updateCalendarEventV1CalendarsEventsEventIdPatchMutation,
} from "@bessel/client";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { client } from "@/lib/client";
import { fromWallClock } from "./calendar-timezone";
import type { CalendarEvent } from "./calendar-types";
import { type EventDraftTiming, timingPayload } from "./event-payload";
import {
  accountsQueryKey,
  invalidateEvents,
  isEventsQuery,
  toCalendarEvent,
} from "./use-calendar-data";

/** Changes from the editor or a drag. Absent keys are left unchanged; for
 *  location/description `null` clears, for recurrence `null` stops repeating. */
export interface EventChangesInput {
  title?: string;
  timing?: EventDraftTiming;
  location?: string | null;
  description?: string | null;
  attendees?: string[];
  recurrence?: RecurrenceSchema | null;
  busy?: boolean;
  addConference?: boolean;
}

export interface WriteOptions {
  scope?: EditScope;
  calendarId?: string;
  notifyGuests?: boolean;
}

type FieldsBody = Omit<
  EventUpdate,
  "time_zone" | "notify_guests" | "scope" | "calendar_id"
>;

/** Request fields for exactly the keys present in `changes`. */
export function eventFieldsBody(
  changes: EventChangesInput,
  timeZone: string,
): FieldsBody {
  const body: FieldsBody = {};
  if ("title" in changes) body.title = changes.title ?? "";
  if (changes.timing) body.timing = timingPayload(changes.timing, timeZone);
  if ("location" in changes) body.location = changes.location || null;
  if ("description" in changes) body.description = changes.description || null;
  if ("attendees" in changes) body.attendees = changes.attendees ?? [];
  if ("recurrence" in changes) body.recurrence = changes.recurrence ?? null;
  if ("busy" in changes) body.busy = changes.busy;
  if (changes.addConference) body.add_conference = true;
  return body;
}

export function errorDetail(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

type EventCaches = [
  readonly unknown[],
  CalendarEventListResponse | undefined,
][];

function snapshotEvents(queryClient: QueryClient): EventCaches {
  return queryClient.getQueriesData<CalendarEventListResponse>({
    predicate: (query) => isEventsQuery(query.queryKey),
  });
}

function restoreEvents(queryClient: QueryClient, caches: EventCaches) {
  for (const [key, data] of caches) queryClient.setQueryData(key, data);
}

function updateCachedEvents(
  queryClient: QueryClient,
  update: (events: CalendarEventSchema[]) => CalendarEventSchema[],
) {
  queryClient.setQueriesData<CalendarEventListResponse>(
    { predicate: (query) => isEventsQuery(query.queryKey) },
    (data) => data && { events: update(data.events) },
  );
}

/** The cached API row with `changes` applied, for instant feedback. */
export function applyOptimistic(
  event: CalendarEventSchema,
  changes: EventChangesInput,
  timeZone: string,
  calendarId?: string,
): CalendarEventSchema {
  const next: CalendarEventSchema = { ...event };
  if (calendarId) next.calendar_id = calendarId;
  if ("title" in changes) next.title = changes.title ?? "";
  if ("location" in changes) next.location = changes.location || null;
  if ("description" in changes) next.description = changes.description || null;
  if ("busy" in changes && changes.busy !== undefined) next.busy = changes.busy;
  if (changes.timing) {
    const { allDay, start, end } = changes.timing;
    next.all_day = allDay;
    if (allDay) {
      // Matches how the client parses response dates: UTC midnight.
      next.start_date = new Date(`${format(start, "yyyy-MM-dd")}T00:00:00Z`);
      next.end_date = new Date(`${format(end, "yyyy-MM-dd")}T00:00:00Z`);
      next.start_at = null;
      next.end_at = null;
    } else {
      next.start_at = fromWallClock(start, timeZone);
      next.end_at = fromWallClock(end, timeZone);
      next.start_date = null;
      next.end_date = null;
    }
  }
  return next;
}

export function useEventMutations(timeZone: string) {
  const queryClient = useQueryClient();

  const settle = () => {
    invalidateEvents(queryClient);
    // A rejected write can change what the account may do (e.g. reconnect needed).
    void queryClient.invalidateQueries({ queryKey: accountsQueryKey() });
  };

  const create = useMutation({
    ...createCalendarEventV1CalendarsCalendarIdEventsPostMutation({ client }),
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't create the event")),
    onSettled: settle,
  });

  const update = useMutation({
    ...updateCalendarEventV1CalendarsEventsEventIdPatchMutation({ client }),
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't save the event")),
    onSettled: settle,
  });

  const remove = useMutation({
    ...deleteCalendarEventV1CalendarsEventsEventIdDeleteMutation({ client }),
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't delete the event")),
    onSettled: settle,
  });

  return {
    isSaving: create.isPending || update.isPending || remove.isPending,

    async createEvent(
      calendarId: string,
      changes: EventChangesInput,
      { notifyGuests = true }: WriteOptions = {},
    ): Promise<CalendarEvent | null> {
      const result = await create.mutateAsync({
        path: { calendar_id: calendarId },
        body: {
          ...eventFieldsBody(changes, timeZone),
          timing: timingPayload(changes.timing as EventDraftTiming, timeZone),
          time_zone: timeZone,
          notify_guests: notifyGuests,
        },
      });
      return result.event ? toCalendarEvent(result.event) : null;
    },

    async updateEvent(
      event: CalendarEvent,
      changes: EventChangesInput,
      { scope = "this", calendarId, notifyGuests = true }: WriteOptions = {},
    ): Promise<CalendarEvent | null> {
      const caches = snapshotEvents(queryClient);
      await queryClient.cancelQueries({
        predicate: (query) => isEventsQuery(query.queryKey),
      });
      // Only the occurrence being edited is updated in place; wider scopes
      // reshape the series, which the refetch brings in.
      updateCachedEvents(queryClient, (events) =>
        events.map((e) =>
          e.id === event.id
            ? applyOptimistic(e, changes, timeZone, calendarId)
            : e,
        ),
      );
      try {
        const result = await update.mutateAsync({
          path: { event_id: event.id },
          body: {
            ...eventFieldsBody(changes, timeZone),
            scope,
            calendar_id: calendarId ?? null,
            time_zone: timeZone,
            notify_guests: notifyGuests,
          },
        });
        return result.event ? toCalendarEvent(result.event) : null;
      } catch (error) {
        restoreEvents(queryClient, caches);
        throw error;
      }
    },

    async deleteEvent(
      event: CalendarEvent,
      { scope = "this", notifyGuests = true }: WriteOptions = {},
    ): Promise<void> {
      const caches = snapshotEvents(queryClient);
      await queryClient.cancelQueries({
        predicate: (query) => isEventsQuery(query.queryKey),
      });
      updateCachedEvents(queryClient, (events) =>
        events.filter((e) => e.id !== event.id),
      );
      try {
        await remove.mutateAsync({
          path: { event_id: event.id },
          query: { scope, time_zone: timeZone, notify_guests: notifyGuests },
        });
      } catch (error) {
        restoreEvents(queryClient, caches);
        throw error;
      }
    },
  };
}

export type EventMutations = ReturnType<typeof useEventMutations>;
