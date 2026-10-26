import type {
  ContactBirthday,
  ContactSchema,
  ContactSighting,
} from "@bessel/client";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

/** "AB" for Anna Berg, "A" for Anna, "#" when there's nothing to go on. */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((part) => /\p{L}/u.test(part))
    .map((part) => part.match(/\p{L}/u)?.[0] ?? "")
    .join("");
  if (!letters) return "#";
  return (
    letters[0] + (letters.length > 1 ? letters[letters.length - 1] : "")
  ).toUpperCase();
}

/** The list's section letter: A-Ö, or # for names that don't start with a letter. */
export function sectionLetter(name: string): string {
  const first = name.trim().charAt(0).toLocaleUpperCase("sv");
  return /\p{L}/u.test(first) ? first : "#";
}

/** Contacts grouped under their letter, in the list's order. */
export function groupByLetter<C extends Pick<ContactSchema, "display_name">>(
  contacts: C[],
): { letter: string; contacts: C[] }[] {
  const groups: { letter: string; contacts: C[] }[] = [];
  for (const contact of contacts) {
    const letter = sectionLetter(contact.display_name);
    const last = groups[groups.length - 1];
    if (last?.letter === letter) last.contacts.push(contact);
    else groups.push({ letter, contacts: [contact] });
  }
  return groups;
}

const digits = (text: string) => text.replace(/\D/g, "");

/** Search across name, nickname, company, tags, emails and numbers; numbers match
 *  however they're spaced ("0701234567" finds "+46 70 123 45 67"'s local form). */
export function matchesContact(
  contact: Pick<
    ContactSchema,
    "display_name" | "nickname" | "organization" | "phones" | "emails" | "tags"
  >,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = [
    contact.display_name,
    contact.nickname,
    contact.organization,
    ...contact.emails.map((e) => e.value),
    ...contact.tags,
  ];
  if (text.some((t) => t?.toLowerCase().includes(q))) return true;
  const wanted = digits(q);
  if (wanted.length < 3) return false;
  return contact.phones.some((p) => {
    const number = digits(p.value);
    // A Swedish number saved as +46 70… is dialled as 070…
    return (
      number.includes(wanted) || number.replace(/^46/, "0").includes(wanted)
    );
  });
}

/** "14 March 1990" (or "14 March"), and how long until the next one: "In 12 days - turns 36". */
export function describeBirthday(
  birthday: ContactBirthday,
  today: Date,
): { date: string; next: string } {
  const label = format(
    new Date(2000, birthday.month - 1, birthday.day),
    "d MMMM",
  );
  const date = birthday.year ? `${label} ${birthday.year}` : label;
  const thisYear = new Date(
    today.getFullYear(),
    birthday.month - 1,
    birthday.day,
  );
  const upcoming =
    differenceInCalendarDays(thisYear, today) >= 0
      ? thisYear
      : new Date(today.getFullYear() + 1, birthday.month - 1, birthday.day);
  const days = differenceInCalendarDays(upcoming, today);
  const when =
    days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  const age = birthday.year ? upcoming.getFullYear() - birthday.year : null;
  return { date, next: age ? `${when} - turns ${age}` : when };
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** What a phone dials: digits and +, without the trunk 0 written as "(0)" after a country code. */
export function telUrl(number: string): string {
  return `tel:${number.replace(/\(0\)/g, "").replace(/[^\d+]/g, "")}`;
}

export const KEEP_IN_TOUCH = [
  { days: 7, label: "Every week" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Every month" },
  { days: 91, label: "Every 3 months" },
  { days: 182, label: "Every 6 months" },
  { days: 365, label: "Every year" },
] as const;

/** An API date (a day, read as UTC midnight) as "yyyy-mm-dd". */
export function apiDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const daysBetween = (from: string, to: string) =>
  differenceInCalendarDays(parseISO(to), parseISO(from));

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago". */
export function daysAgo(day: string, today: string): string {
  const days = daysBetween(day, today);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30.4)} months ago`;
}

/** "Seen 3 weeks ago - Lunch with Anna", "Caught up yesterday", or that they haven't been seen. */
export function describeLastSeen(
  seen: ContactSighting | null | undefined,
  today: string,
): string {
  if (!seen) return "Not seen in the past year";
  const when = daysAgo(apiDay(seen.on), today);
  return seen.event_title
    ? `Seen ${when} - ${seen.event_title}`
    : `Caught up ${when}`;
}

/** When keeping in touch says to be in touch next. */
export function describeCatchUp(catchUpOn: Date, today: string): string {
  const days = daysBetween(today, apiDay(catchUpOn));
  if (days <= 0) return "Time to catch up";
  if (days === 1) return "Next catch-up tomorrow";
  return `Next catch-up in ${days} days`;
}

export function isCatchUpDue(
  contact: Pick<ContactSchema, "catch_up_on">,
  today: string,
): boolean {
  return !!contact.catch_up_on && apiDay(contact.catch_up_on) <= today;
}

/** When a coming day falls: "Today", "Tomorrow", "Saturday" within the week, else "14 March". */
export function upcomingDay(on: Date, today: string): string {
  const day = apiDay(on);
  const days = daysBetween(today, day);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return format(parseISO(day), days < 7 ? "EEEE" : "d MMMM");
}
