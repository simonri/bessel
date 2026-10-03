import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { CalendarAttendee, CalendarEvent } from "./calendar-types";

export interface Person {
  email: string;
  /** A name some calendar gave for this address, if any did. */
  name: string | null;
  photoUrl: string | null;
  /** How many loaded events they're on; ranks suggestions. */
  events: number;
}

/** Everyone on the loaded events, keyed by lowercased email. */
export function buildDirectory(events: CalendarEvent[]): Map<string, Person> {
  const people = new Map<string, Person>();
  const note = (
    email: string | null,
    name: string | null,
    photoUrl: string | null,
  ) => {
    if (!email) return;
    const key = email.toLowerCase();
    const known = people.get(key);
    people.set(key, {
      email: known?.email ?? email,
      name: known?.name || name?.trim() || null,
      photoUrl: known?.photoUrl ?? photoUrl,
      events: (known?.events ?? 0) + 1,
    });
  };
  for (const event of events) {
    const { attendees, creatorEmail, creatorName } = event.details;
    for (const a of attendees) note(a.email, a.name, a.photoUrl);
    if (!attendees.some((a) => a.email === creatorEmail)) {
      note(creatorEmail, creatorName, null);
    }
  }
  return people;
}

/** The person's real name: from this event, or one another event gave for
 *  the same address. Null means only the address is known; never a guess. */
export function displayName(
  attendee: Pick<CalendarAttendee, "email" | "name">,
  directory: Map<string, Person>,
): string | null {
  return (
    attendee.name?.trim() ||
    directory.get(attendee.email.toLowerCase())?.name ||
    null
  );
}

/** Their photo, from this event or another event's copy of the person. */
export function photoOf(
  attendee: Pick<CalendarAttendee, "email" | "photoUrl">,
  directory: Map<string, Person>,
): string | null {
  return (
    attendee.photoUrl ??
    directory.get(attendee.email.toLowerCase())?.photoUrl ??
    null
  );
}

/** People matching `query` by name or email, most frequent first. */
export function suggestPeople(
  directory: Map<string, Person>,
  query: string,
  exclude: string[],
  limit = 5,
): Person[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const taken = new Set(exclude.map((e) => e.toLowerCase()));
  return [...directory.values()]
    .filter((person) => !taken.has(person.email.toLowerCase()))
    .filter((person) => {
      const name = (person.name ?? "").toLowerCase();
      return (
        person.email.toLowerCase().startsWith(q) ||
        name.split(" ").some((word) => word.startsWith(q)) ||
        name.startsWith(q)
      );
    })
    .sort((a, b) => b.events - a.events || a.email.localeCompare(b.email))
    .slice(0, limit);
}

const PeopleContext = createContext<Map<string, Person>>(new Map());

export function PeopleProvider({
  events,
  children,
}: {
  events: CalendarEvent[];
  children: ReactNode;
}) {
  const directory = useMemo(() => buildDirectory(events), [events]);
  return (
    <PeopleContext.Provider value={directory}>
      {children}
    </PeopleContext.Provider>
  );
}

export function usePeople(): Map<string, Person> {
  return useContext(PeopleContext);
}
