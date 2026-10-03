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

export interface CalendarAttendee {
  email: string;
  name: string | null;
  response: "accepted" | "declined" | "tentative" | "needs_action";
}

export interface CalendarEventDetails {
  location: string | null;
  description: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  attendees: CalendarAttendee[];
  conferenceUrl: string | null;
  /** The event in the provider's own UI (Google only). */
  htmlLink: string | null;
  busy: boolean;
  recurring: boolean;
  visibility: "public" | "private" | "confidential" | null;
}

interface CalendarEventBase {
  id: string;
  calendarId: string;
  title: string;
  details: CalendarEventDetails;
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
