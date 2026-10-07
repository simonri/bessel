import {
  listCalendarAccountsV1CalendarsAccountsGetOptions,
  listCalendarEventsV1CalendarsEventsGetOptions,
} from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { client } from "@/lib/client";
import { userStorage } from "@/lib/user-storage";
import type { CalendarEvent, TimedCalendarEvent } from "./calendar-types";
import { toCalendarEvent } from "./use-calendar-data";

export const REMINDER_MINUTES = 10;
const CHECK_MS = 15_000;
const LOOKAHEAD_MS = 24 * 3_600_000;
const FETCH_STEP_MS = 5 * 60_000;
const SENT_KEY = "bessel:calendar-reminders-sent";
// Long enough to cover the lookahead; older entries are dropped.
const SENT_TTL_MS = 2 * LOOKAHEAD_MS;

/** One reminder per occurrence: a moved event gets a new one. */
export function reminderKey(event: TimedCalendarEvent): string {
  return `${event.id}@${event.start.getTime()}`;
}

/** Events whose reminder is due now and hasn't been shown. A reminder that
 *  was missed (the app was closed) still fires until the event starts. */
export function dueReminders(
  events: CalendarEvent[],
  now: Date,
  sent: ReadonlySet<string>,
  hiddenCalendarIds: ReadonlySet<string> = new Set(),
  minutes = REMINDER_MINUTES,
): TimedCalendarEvent[] {
  const lead = minutes * 60_000;
  return events.filter(
    (event): event is TimedCalendarEvent =>
      !event.allDay &&
      event.start.getTime() - lead <= now.getTime() &&
      now < event.start &&
      event.details.myResponse !== "declined" &&
      !hiddenCalendarIds.has(event.calendarId) &&
      !sent.has(reminderKey(event)),
  );
}

export function reminderBody(event: TimedCalendarEvent, now: Date): string {
  const minutes = Math.max(
    1,
    Math.round((event.start.getTime() - now.getTime()) / 60_000),
  );
  const when = `${format(event.start, "HH:mm")}–${format(event.end, "HH:mm")}`;
  const where = event.details.location ? ` - ${event.details.location}` : "";
  return `In ${minutes} min - ${when}${where}`;
}

function readSent(now: number): Map<string, number> {
  try {
    const stored = JSON.parse(userStorage.getItem(SENT_KEY) ?? "{}");
    return new Map(
      Object.entries(stored as Record<string, number>).filter(
        ([, at]) => typeof at === "number" && now - at < SENT_TTL_MS,
      ),
    );
  } catch {
    return new Map();
  }
}

function writeSent(sent: Map<string, number>) {
  // On failure it's not remembered across reloads; the notification tag
  // still dedupes.
  userStorage.setItem(SENT_KEY, JSON.stringify(Object.fromEntries(sent)));
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Sends a desktop notification shortly before each upcoming event, on
 *  whatever page is open. Renders nothing. */
export function EventReminders() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const enabled =
    settings.calendarReminders &&
    notificationsSupported() &&
    Notification.permission === "granted";
  // Rounded so the query key (and cache) only changes every few minutes.
  const [from, setFrom] = useState(
    () => Math.floor(Date.now() / FETCH_STEP_MS) * FETCH_STEP_MS,
  );

  const { data: accounts } = useQuery({
    ...listCalendarAccountsV1CalendarsAccountsGetOptions({ client }),
    enabled,
  });
  const hasAccounts = (accounts?.accounts.length ?? 0) > 0;
  const { data } = useQuery({
    ...listCalendarEventsV1CalendarsEventsGetOptions({
      client,
      query: {
        start_ts: Math.floor(from / 1000),
        end_ts: Math.floor((from + LOOKAHEAD_MS) / 1000),
      },
    }),
    enabled: enabled && hasAccounts,
    refetchInterval: FETCH_STEP_MS,
  });

  useEffect(() => {
    if (!enabled || !data || !accounts) return;
    const events = data.events
      .map(toCalendarEvent)
      .filter((e): e is CalendarEvent => e !== null);
    const hidden = new Set(
      accounts.accounts.flatMap((a) =>
        a.calendars.filter((c) => c.hidden).map((c) => c.id),
      ),
    );
    const check = () => {
      const now = new Date();
      const step = Math.floor(now.getTime() / FETCH_STEP_MS) * FETCH_STEP_MS;
      if (step !== from) setFrom(step);
      const sent = readSent(now.getTime());
      const due = dueReminders(events, now, new Set(sent.keys()), hidden);
      if (due.length === 0) return;
      for (const event of due) {
        sent.set(reminderKey(event), now.getTime());
        const notification = new Notification(event.title || "Event", {
          body: reminderBody(event, now),
          // Same tag from another window replaces rather than duplicates.
          tag: reminderKey(event),
        });
        notification.onclick = () => {
          window.focus();
          void navigate({ to: "/calendar" });
          notification.close();
        };
      }
      writeSent(sent);
    };
    check();
    const timer = setInterval(check, CHECK_MS);
    return () => clearInterval(timer);
  }, [enabled, data, accounts, from, navigate]);

  return null;
}
