import type { ContactBirthday, ContactSchema } from "@bessel/client";
import { differenceInCalendarDays, format } from "date-fns";

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

/** Search across name, nickname, company, emails and numbers; numbers match
 *  however they're spaced ("0701234567" finds "+46 70 123 45 67"'s local form). */
export function matchesContact(
  contact: Pick<
    ContactSchema,
    "display_name" | "nickname" | "organization" | "phones" | "emails"
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
