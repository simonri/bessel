import type { RecurrenceSchema } from "@bessel/client";

export type CalendarProvider = "google" | "icloud";

export interface CalendarAccount {
  id: string;
  provider: CalendarProvider;
  email: string;
  lastSyncedAt: Date | null;
  syncError: string | null;
  /** False when connected read-only; reconnecting grants edit access. */
  canWrite: boolean;
  /** Google: guests can be named from contacts; false until reconnected. */
  canReadPeople: boolean;
}

export interface CalendarInfo {
  id: string;
  accountId: string;
  name: string;
  /** Hex color as supplied by the provider. */
  color: string;
  hidden: boolean;
  writable: boolean;
  primary: boolean;
}

export type AttendeeResponse =
  | "accepted"
  | "declined"
  | "tentative"
  | "needs_action";

/** A guest's answer; "needs_action" means they haven't answered yet. */
export type Reply = Exclude<AttendeeResponse, "needs_action">;

export interface CalendarAttendee {
  email: string;
  name: string | null;
  response: AttendeeResponse;
  /** The connected account itself. */
  isSelf: boolean;
  isOrganizer: boolean;
  /** From the account's contacts or company directory, when known. */
  photoUrl: string | null;
}

export interface CalendarEventDetails {
  location: string | null;
  description: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  attendees: CalendarAttendee[];
  /** This account's reply when it's a guest; null when it isn't invited. */
  myResponse: CalendarAttendee["response"] | null;
  conferenceUrl: string | null;
  /** The event in the provider's own UI (Google only). */
  htmlLink: string | null;
  busy: boolean;
  recurring: boolean;
  visibility: "public" | "private" | "confidential" | null;
  /** False for invitations organized by someone else. */
  editable: boolean;
  /** Google's per-event colour id; null shows the calendar's colour. */
  colorId: string | null;
  /** The series' raw RRULE; set even when `recurrence` can't represent it. */
  rule: string | null;
  recurrence: RecurrenceSchema | null;
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

/** "centered" shows the selected day with three days either side. */
export type CalendarViewMode = "week" | "centered" | "day";
