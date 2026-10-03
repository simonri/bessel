export type CalendarProvider = "google" | "icloud";

export interface CalendarAccount {
  id: string;
  provider: CalendarProvider;
  email: string;
  lastSyncedAt: Date | null;
  syncError: string | null;
}

export interface CalendarInfo {
  id: string;
  accountId: string;
  name: string;
  /** Hex color as supplied by the provider. */
  color: string;
  hidden: boolean;
}

interface CalendarEventBase {
  id: string;
  calendarId: string;
  title: string;
}

export interface TimedCalendarEvent extends CalendarEventBase {
  allDay: false;
  start: Date;
  end: Date;
}

/** All-day events are calendar dates, not instants: `YYYY-MM-DD`, end exclusive
 *  (the convention both Google's `start.date` and iCal `VALUE=DATE` use). */
export interface AllDayCalendarEvent extends CalendarEventBase {
  allDay: true;
  startDate: string;
  endDate: string;
}

export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent;

export type CalendarViewMode = "week" | "day";
