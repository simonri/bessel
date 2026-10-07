import {
  authorizeGoogleV1CalendarsGoogleAuthorizePostMutation,
  type CalendarAccountListResponse,
  type CalendarEventSchema,
  connectIcloudV1CalendarsIcloudPostMutation,
  disconnectCalendarAccountV1CalendarsAccountsAccountIdDeleteMutation,
  listCalendarAccountsV1CalendarsAccountsGetOptions,
  listCalendarAccountsV1CalendarsAccountsGetQueryKey,
  listCalendarEventsV1CalendarsEventsGetOptions,
  syncCalendarAccountV1CalendarsAccountsAccountIdSyncPostMutation,
  updateCalendarV1CalendarsCalendarIdPatchMutation,
} from "@bessel/client";
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { client } from "@/lib/client";
import { mutationFamily } from "@/lib/optimistic";
import type {
  CalendarAccount,
  CalendarEvent,
  CalendarInfo,
} from "./calendar-types";

export interface CalendarData {
  accounts: CalendarAccount[];
  calendars: CalendarInfo[];
  events: CalendarEvent[];
}

export interface CalendarActions {
  setCalendarHidden: (calendarId: string, hidden: boolean) => void;
  connectGoogle: () => void;
  connectICloud: (appleId: string, appPassword: string) => Promise<void>;
  syncAccount: (accountId: string) => void;
  disconnectAccount: (accountId: string) => void;
}

// After starting a connection the account appears (and then finishes its first
// sync) in the background, so poll until the user has something to look at.
const CONNECT_POLL_MS = 3_000;
const CONNECT_POLL_WINDOW_MS = 3 * 60_000;
const EVENTS_REFRESH_MS = 5 * 60_000;

// Module-level so connect/sync actions can extend the window the accounts query
// polls in; the query's refetchInterval re-reads it after every fetch.
let pollUntil = 0;
// When an account was first seen still waiting on its first sync.
let firstPendingAt: number | null = null;

/** How often to poll accounts: while one has been waiting on its first sync
 *  since `pendingSince` (for at most a window, in case the job died without
 *  recording an error), or until `connectPollUntil` after a connect or sync. */
export function accountsPollInterval(
  pendingSince: number | null,
  connectPollUntil: number,
  now: number,
): number | false {
  const awaitingFirstSync =
    pendingSince !== null && now - pendingSince < CONNECT_POLL_WINDOW_MS;
  return awaitingFirstSync || now < connectPollUntil ? CONNECT_POLL_MS : false;
}

function startConnectPolling(queryClient: QueryClient) {
  pollUntil = Date.now() + CONNECT_POLL_WINDOW_MS;
  void queryClient.invalidateQueries({ queryKey: accountsQueryKey() });
}

// The client parses `YYYY-MM-DD` as UTC midnight; read it back the same way.
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const EVENTS_QUERY_ID = "listCalendarEventsV1CalendarsEventsGet";

export function isEventsQuery(queryKey: readonly unknown[]): boolean {
  return (queryKey[0] as { _id?: string } | undefined)?._id === EVENTS_QUERY_ID;
}

export function invalidateEvents(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    predicate: (query) => isEventsQuery(query.queryKey),
  });
}

/** Every event write shares these, so background refreshes can hold off
 *  while one is in flight; see useEventMutations. */
export const EVENT_WRITES = mutationFamily("calendar-events");

export function eventWritesInFlight(queryClient: QueryClient): boolean {
  return queryClient.isMutating({ mutationKey: EVENT_WRITES.mutationKey }) > 0;
}

/** A background refresh of events. Skipped while an event write is in flight:
 *  the fetch could return the server's state before the write and overwrite
 *  its optimistic change, and the write refetches once it settles anyway. */
export function refreshEvents(queryClient: QueryClient) {
  if (!eventWritesInFlight(queryClient)) invalidateEvents(queryClient);
}

export const accountsQueryKey = () =>
  listCalendarAccountsV1CalendarsAccountsGetQueryKey({ client });

function toAccounts(data: CalendarAccountListResponse | undefined) {
  const accounts: CalendarAccount[] = [];
  const calendars: CalendarInfo[] = [];
  for (const a of data?.accounts ?? []) {
    accounts.push({
      id: a.id,
      provider: a.provider,
      email: a.email,
      lastSyncedAt: a.last_synced_at,
      syncError: a.sync_error,
      canWrite: a.can_write,
      canReadPeople: a.can_read_people ?? false,
    });
    for (const c of a.calendars) {
      calendars.push({
        id: c.id,
        accountId: a.id,
        name: c.name,
        color: c.color,
        hidden: c.hidden,
        writable: c.writable,
        primary: c.primary,
      });
    }
  }
  return { accounts, calendars };
}

export function toCalendarEvent(e: CalendarEventSchema): CalendarEvent | null {
  const base = {
    id: e.id,
    calendarId: e.calendar_id,
    title: e.title,
    details: {
      location: e.location,
      description: e.description,
      creatorName: e.creator_name,
      creatorEmail: e.creator_email,
      attendees: e.attendees.map((a) => ({
        email: a.email,
        name: a.name,
        response: a.response,
        isSelf: a.is_self ?? false,
        isOrganizer: a.is_organizer ?? false,
        photoUrl: a.photo_url ?? null,
      })),
      myResponse: e.my_response ?? null,
      conferenceUrl: e.conference_url,
      htmlLink: e.html_link,
      busy: e.busy,
      recurring: e.recurring,
      visibility: e.visibility,
      editable: e.editable,
      colorId: e.color_id ?? null,
      rule: e.rule ?? null,
      recurrence: e.recurrence ?? null,
    },
  };
  if (e.all_day && e.start_date && e.end_date) {
    return {
      ...base,
      allDay: true,
      startDate: isoDate(e.start_date),
      endDate: isoDate(e.end_date),
    };
  }
  if (!e.all_day && e.start_at && e.end_at) {
    return { ...base, allDay: false, start: e.start_at, end: e.end_at };
  }
  return null;
}

/** Accounts, calendars and the events overlapping [start, end). */
export function useCalendarData(range: {
  start: Date;
  end: Date;
}): CalendarData {
  const queryClient = useQueryClient();

  const { data: accountsData } = useQuery({
    ...listCalendarAccountsV1CalendarsAccountsGetOptions({ client }),
    refetchInterval: (query) => {
      const pending =
        query.state.data?.accounts.some(
          (a) => a.last_synced_at === null && a.sync_error === null,
        ) ?? false;
      const now = Date.now();
      firstPendingAt = pending ? (firstPendingAt ?? now) : null;
      return accountsPollInterval(firstPendingAt, pollUntil, now);
    },
    refetchOnWindowFocus: true,
  });

  const startTs = Math.floor(range.start.getTime() / 1000);
  const endTs = Math.floor(range.end.getTime() / 1000);
  const { data: eventsData } = useQuery({
    ...listCalendarEventsV1CalendarsEventsGetOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs },
    }),
    enabled: (accountsData?.accounts.length ?? 0) > 0,
    placeholderData: keepPreviousData,
    // Re-read after every cache update, so an optimistic write pauses these
    // and the refetch that settles it resumes them.
    refetchInterval: () =>
      eventWritesInFlight(queryClient) ? false : EVENTS_REFRESH_MS,
    refetchOnWindowFocus: () => !eventWritesInFlight(queryClient),
  });

  // A finished sync shows up as a newer last_synced_at; pull fresh events then.
  const latestSync = Math.max(
    0,
    ...(accountsData?.accounts ?? []).map(
      (a) => a.last_synced_at?.getTime() ?? 0,
    ),
  );
  // The first value seen is what the events query just loaded with.
  const seenSync = useRef<number | null>(null);
  useEffect(() => {
    if (!accountsData) return;
    const previous = seenSync.current;
    seenSync.current = latestSync;
    if (previous === null || latestSync <= previous) return;
    refreshEvents(queryClient);
    pollUntil = 0;
  }, [accountsData, latestSync, queryClient]);

  // A sync that failed records an error instead of a newer last_synced_at.
  const syncErrors = (accountsData?.accounts ?? [])
    .filter((a) => a.sync_error)
    .map((a) => `${a.id}:${a.sync_error}`)
    .join("|");
  const seenErrors = useRef<string | null>(null);
  useEffect(() => {
    if (!accountsData) return;
    const previous = seenErrors.current;
    seenErrors.current = syncErrors;
    if (previous !== null && syncErrors !== previous && syncErrors) {
      pollUntil = 0;
    }
  }, [accountsData, syncErrors]);

  const { accounts, calendars } = toAccounts(accountsData);
  const events = (eventsData?.events ?? []).flatMap((e) => {
    const event = toCalendarEvent(e);
    return event ? [event] : [];
  });

  return { accounts, calendars, events };
}

export function useCalendarActions(): CalendarActions {
  const queryClient = useQueryClient();
  const invalidateAccounts = () =>
    queryClient.invalidateQueries({ queryKey: accountsQueryKey() });

  const updateCalendar = useMutation({
    ...updateCalendarV1CalendarsCalendarIdPatchMutation({ client }),
    onMutate: async ({ path, body }) => {
      await queryClient.cancelQueries({ queryKey: accountsQueryKey() });
      const previous = queryClient.getQueryData<CalendarAccountListResponse>(
        accountsQueryKey(),
      );
      queryClient.setQueryData<CalendarAccountListResponse>(
        accountsQueryKey(),
        (data) =>
          data && {
            accounts: data.accounts.map((a) => ({
              ...a,
              calendars: a.calendars.map((c) =>
                c.id === path.calendar_id ? { ...c, hidden: body.hidden } : c,
              ),
            })),
          },
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(accountsQueryKey(), context?.previous);
      toast.error("Couldn't update the calendar");
    },
    onSettled: invalidateAccounts,
  });

  // Both report failures where they're called.
  const authorizeGoogle = useMutation({
    ...authorizeGoogleV1CalendarsGoogleAuthorizePostMutation({ client }),
    meta: { errorToast: false },
  });
  const connectICloud = useMutation({
    ...connectIcloudV1CalendarsIcloudPostMutation({ client }),
    meta: { errorToast: false },
    onSuccess: () => {
      startConnectPolling(queryClient);
    },
  });
  const syncAccount = useMutation({
    ...syncCalendarAccountV1CalendarsAccountsAccountIdSyncPostMutation({
      client,
    }),
    onSuccess: () => {
      startConnectPolling(queryClient);
      toast.success("Syncing…");
    },
    onError: () => toast.error("Couldn't start a sync"),
  });
  const disconnect = useMutation({
    ...disconnectCalendarAccountV1CalendarsAccountsAccountIdDeleteMutation({
      client,
    }),
    onSuccess: () => {
      void invalidateAccounts();
      invalidateEvents(queryClient);
    },
    onError: () => toast.error("Couldn't disconnect the account"),
  });

  return {
    setCalendarHidden: (calendarId, hidden) =>
      updateCalendar.mutate({
        path: { calendar_id: calendarId },
        body: { hidden },
      }),
    connectGoogle: () => {
      // Browsers only allow popups opened synchronously from the click, so
      // open the tab now and point it at Google once the URL arrives.
      const popup = window.electron ? null : window.open("", "_blank");
      authorizeGoogle.mutate(
        {},
        {
          onSuccess: ({ url }) => {
            startConnectPolling(queryClient);
            if (window.electron) void window.electron.shell.openExternal(url);
            else if (popup) popup.location.href = url;
            else window.location.assign(url);
          },
          onError: () => {
            popup?.close();
            toast.error("Google Calendar isn't available right now");
          },
        },
      );
    },
    connectICloud: async (appleId, appPassword) => {
      await connectICloud.mutateAsync({
        body: { apple_id: appleId, app_password: appPassword },
      });
    },
    syncAccount: (accountId) =>
      syncAccount.mutate({ path: { account_id: accountId } }),
    disconnectAccount: (accountId) =>
      disconnect.mutate({ path: { account_id: accountId } }),
  };
}
