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
import { useEffect } from "react";
import { toast } from "sonner";
import { client } from "@/lib/client";
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
      attendees: e.attendees,
      myResponse: e.my_response ?? null,
      conferenceUrl: e.conference_url,
      htmlLink: e.html_link,
      busy: e.busy,
      recurring: e.recurring,
      visibility: e.visibility,
      editable: e.editable,
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
      const pending = query.state.data?.accounts.some(
        (a) => a.last_synced_at === null && a.sync_error === null,
      );
      return pending || Date.now() < pollUntil ? CONNECT_POLL_MS : false;
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
    refetchInterval: EVENTS_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  // A finished sync shows up as a newer last_synced_at; pull fresh events then.
  const latestSync = Math.max(
    0,
    ...(accountsData?.accounts ?? []).map(
      (a) => a.last_synced_at?.getTime() ?? 0,
    ),
  );
  useEffect(() => {
    if (!latestSync) return;
    invalidateEvents(queryClient);
    pollUntil = 0;
  }, [latestSync, queryClient]);

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

  const authorizeGoogle = useMutation(
    authorizeGoogleV1CalendarsGoogleAuthorizePostMutation({ client }),
  );
  const connectICloud = useMutation({
    ...connectIcloudV1CalendarsIcloudPostMutation({ client }),
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
