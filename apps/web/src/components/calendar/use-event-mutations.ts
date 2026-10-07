import {
  type CalendarEventListResponse,
  type CalendarEventSchema,
  createCalendarEventV1CalendarsCalendarIdEventsPost,
  deleteCalendarEventV1CalendarsEventsEventIdDelete,
  type EditScope,
  type EventUpdate,
  type RecurrenceSchema,
  respondToCalendarEventV1CalendarsEventsEventIdResponsePut,
  updateCalendarEventV1CalendarsEventsEventIdPatch,
} from "@bessel/client";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { errorDetail, errorStatus } from "@/lib/api-error";
import { client, IDEMPOTENCY_HEADER } from "@/lib/client";
import { settleWhenIdle } from "@/lib/optimistic";
import { fromWallClock } from "./calendar-timezone";
import type { CalendarEvent, Reply } from "./calendar-types";
import { type EventDraftTiming, timingPayload } from "./event-payload";
import {
  accountsQueryKey,
  EVENT_WRITES,
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
  /** Google event colour id; null goes back to the calendar's colour. */
  colorId?: string | null;
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
  if ("colorId" in changes) body.color_id = changes.colorId ?? null;
  return body;
}

/** Where one event sat in each cached events list before an optimistic
 *  change, so a failure can put back just that event. */
type EventSnapshot = [
  readonly unknown[],
  { event: CalendarEventSchema; index: number } | undefined,
][];

function snapshotEvent(
  queryClient: QueryClient,
  eventId: string,
): EventSnapshot {
  return queryClient
    .getQueriesData<CalendarEventListResponse>({
      predicate: (query) => isEventsQuery(query.queryKey),
    })
    .map(([key, data]) => {
      const index = data?.events.findIndex((e) => e.id === eventId) ?? -1;
      return [
        key,
        data && index >= 0 ? { event: data.events[index], index } : undefined,
      ];
    });
}

/** Puts back the event as `snapshot` saw it, leaving other events (and their
 *  own in-flight optimistic changes) as they are. */
export function restoreEvent(
  queryClient: QueryClient,
  eventId: string,
  snapshot: EventSnapshot | undefined,
) {
  for (const [key, before] of snapshot ?? []) {
    if (!before) continue;
    queryClient.setQueryData<CalendarEventListResponse>(key, (data) => {
      if (!data) return data;
      const events = data.events.filter((e) => e.id !== eventId);
      events.splice(Math.min(before.index, events.length), 0, before.event);
      return { ...data, events };
    });
  }
}

function updateCachedEvents(
  queryClient: QueryClient,
  update: (events: CalendarEventSchema[]) => CalendarEventSchema[],
) {
  queryClient.setQueriesData<CalendarEventListResponse>(
    { predicate: (query) => isEventsQuery(query.queryKey) },
    (data) => data && { ...data, events: update(data.events) },
  );
}

/** Applies an optimistic change to one event, after stopping in-flight
 *  fetches that would overwrite it. */
async function beginOptimistic(
  queryClient: QueryClient,
  eventId: string,
  update: (events: CalendarEventSchema[]) => CalendarEventSchema[],
) {
  await queryClient.cancelQueries({
    predicate: (query) => isEventsQuery(query.queryKey),
  });
  const snapshot = snapshotEvent(queryClient, eventId);
  updateCachedEvents(queryClient, update);
  return { snapshot };
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
  if ("colorId" in changes) next.color_id = changes.colorId ?? null;
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

/** The cached API row with this account's answer changed. */
export function applyReply(
  event: CalendarEventSchema,
  reply: Reply,
): CalendarEventSchema {
  return {
    ...event,
    my_response: reply,
    attendees: event.attendees.map((a) =>
      a.is_self ? { ...a, response: reply } : a,
    ),
  };
}

interface ReplyVariables {
  event: CalendarEvent;
  answer: Reply;
  scope: EditScope;
}

interface CreateVariables {
  calendarId: string;
  changes: EventChangesInput;
  notifyGuests: boolean;
  /** Lets the API recognise a retried request instead of creating a second event. */
  idempotencyKey: string;
}

interface UpdateVariables {
  event: CalendarEvent;
  changes: EventChangesInput;
  options: WriteOptions;
}

interface DeleteVariables {
  event: CalendarEvent;
  options: WriteOptions;
}

const MAX_CREATE_RETRIES = 2;

/** A create whose response was lost may have been applied; retrying it with
 *  the same Idempotency-Key is safe, and replays the first response once that
 *  request finishes. Retrying one the API rejected is not useful. */
export function shouldRetryCreate(failureCount: number, error: unknown) {
  const status = errorStatus(error);
  const stillProcessing =
    status === 409 &&
    (error as { error?: unknown }).error === "IdempotencyError";
  return (
    (status === undefined || stillProcessing) &&
    failureCount < MAX_CREATE_RETRIES
  );
}

export function useEventMutations(timeZone: string) {
  const queryClient = useQueryClient();

  const settle = () =>
    settleWhenIdle(queryClient, EVENT_WRITES.mutationKey, () => {
      invalidateEvents(queryClient);
      // A rejected write can change what the account may do (e.g. reconnect needed).
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey() });
    });

  const create = useMutation({
    ...EVENT_WRITES,
    mutationFn: async ({
      calendarId,
      changes,
      notifyGuests,
      idempotencyKey,
    }: CreateVariables) => {
      const { data } = await createCalendarEventV1CalendarsCalendarIdEventsPost(
        {
          client,
          path: { calendar_id: calendarId },
          body: {
            ...eventFieldsBody(changes, timeZone),
            timing: timingPayload(changes.timing as EventDraftTiming, timeZone),
            time_zone: timeZone,
            notify_guests: notifyGuests,
          },
          headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
          throwOnError: true,
        },
      );
      return data;
    },
    retry: shouldRetryCreate,
    onError: (error) =>
      toast.error(errorDetail(error, "Couldn't create the event")),
    onSettled: settle,
  });

  const update = useMutation({
    ...EVENT_WRITES,
    mutationFn: async ({
      event,
      changes,
      options: { scope = "this", calendarId, notifyGuests = true },
    }: UpdateVariables) => {
      const { data } = await updateCalendarEventV1CalendarsEventsEventIdPatch({
        client,
        path: { event_id: event.id },
        body: {
          ...eventFieldsBody(changes, timeZone),
          scope,
          calendar_id: calendarId ?? null,
          time_zone: timeZone,
          notify_guests: notifyGuests,
        },
        throwOnError: true,
      });
      return data;
    },
    // Only the occurrence being edited is updated in place; wider scopes
    // reshape the series, which the refetch brings in.
    onMutate: ({ event, changes, options }) =>
      beginOptimistic(queryClient, event.id, (events) =>
        events.map((e) =>
          e.id === event.id
            ? applyOptimistic(e, changes, timeZone, options.calendarId)
            : e,
        ),
      ),
    onError: (error, { event }, context) => {
      restoreEvent(queryClient, event.id, context?.snapshot);
      toast.error(errorDetail(error, "Couldn't save the event"));
    },
    onSettled: settle,
  });

  const reply = useMutation({
    ...EVENT_WRITES,
    mutationFn: async ({ event, answer, scope }: ReplyVariables) => {
      const { data } =
        await respondToCalendarEventV1CalendarsEventsEventIdResponsePut({
          client,
          path: { event_id: event.id },
          body: { response: answer, scope },
          throwOnError: true,
        });
      return data;
    },
    onMutate: ({ event, answer }) =>
      beginOptimistic(queryClient, event.id, (events) =>
        events.map((e) => (e.id === event.id ? applyReply(e, answer) : e)),
      ),
    onError: (error, { event }, context) => {
      restoreEvent(queryClient, event.id, context?.snapshot);
      toast.error(errorDetail(error, "Couldn't send your answer"));
    },
    onSettled: settle,
  });

  const remove = useMutation({
    ...EVENT_WRITES,
    mutationFn: async ({
      event,
      options: { scope = "this", notifyGuests = true },
    }: DeleteVariables) => {
      await deleteCalendarEventV1CalendarsEventsEventIdDelete({
        client,
        path: { event_id: event.id },
        query: { scope, time_zone: timeZone, notify_guests: notifyGuests },
        throwOnError: true,
      });
    },
    onMutate: ({ event }) =>
      beginOptimistic(queryClient, event.id, (events) =>
        events.filter((e) => e.id !== event.id),
      ),
    onError: (error, { event }, context) => {
      restoreEvent(queryClient, event.id, context?.snapshot);
      toast.error(errorDetail(error, "Couldn't delete the event"));
    },
    onSettled: settle,
  });

  return {
    isSaving: create.isPending || update.isPending || remove.isPending,
    isReplying: reply.isPending,

    async respondToEvent(
      event: CalendarEvent,
      answer: Reply,
      scope: EditScope = "this",
    ): Promise<void> {
      await reply.mutateAsync({ event, answer, scope });
    },

    async createEvent(
      calendarId: string,
      changes: EventChangesInput,
      { notifyGuests = true }: WriteOptions = {},
    ): Promise<CalendarEvent | null> {
      const result = await create.mutateAsync({
        calendarId,
        changes,
        notifyGuests,
        idempotencyKey: crypto.randomUUID(),
      });
      return result.event ? toCalendarEvent(result.event) : null;
    },

    async updateEvent(
      event: CalendarEvent,
      changes: EventChangesInput,
      options: WriteOptions = {},
    ): Promise<CalendarEvent | null> {
      const result = await update.mutateAsync({ event, changes, options });
      return result.event ? toCalendarEvent(result.event) : null;
    },

    async deleteEvent(
      event: CalendarEvent,
      options: WriteOptions = {},
    ): Promise<void> {
      await remove.mutateAsync({ event, options });
    },
  };
}

export type EventMutations = ReturnType<typeof useEventMutations>;
