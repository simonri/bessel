import { describe, expect, it } from "vitest";
import {
  daysAgo,
  describeBirthday,
  describeDate,
  describeLastSeen,
  groupByLetter,
  initials,
  matchesContact,
  sectionLetter,
  telUrl,
  upcomingDay,
} from "./contact-meta";

const person = (overrides: Record<string, unknown> = {}) => ({
  display_name: "Anna Berg",
  nickname: null,
  organization: null,
  phones: [
    { label: "Mobile", value: "+46 70 123 45 67", display: "070-123 45 67" },
  ],
  emails: [
    { label: null, value: "anna@example.com", display: "anna@example.com" },
  ],
  tags: [] as string[],
  ...overrides,
});

describe("initials and letters", () => {
  it("takes the first and last name's first letters", () => {
    expect(initials("Anna Maria Berg")).toBe("AB");
    expect(initials("Örjan")).toBe("Ö");
    expect(initials("+46 70 123")).toBe("#");
  });

  it("files names under their first letter, Swedish ones included, and the rest under #", () => {
    expect(["Anna", "örjan", "Åsa", "123 Taxi", ""].map(sectionLetter)).toEqual(
      ["A", "Ö", "Å", "#", "#"],
    );
  });

  it("groups a sorted list by letter, keeping its order", () => {
    const groups = groupByLetter(
      ["Anna", "Axel", "Bo", "Cia"].map((display_name) => ({ display_name })),
    );

    expect(
      groups.map((g) => [g.letter, g.contacts.map((c) => c.display_name)]),
    ).toEqual([
      ["A", ["Anna", "Axel"]],
      ["B", ["Bo"]],
      ["C", ["Cia"]],
    ]);
  });
});

describe("matchesContact", () => {
  it("finds by name, nickname, company and email, ignoring case", () => {
    expect(matchesContact(person(), "berg")).toBe(true);
    expect(matchesContact(person({ nickname: "Nana" }), "nana")).toBe(true);
    expect(matchesContact(person({ organization: "Acme" }), "ACME")).toBe(true);
    expect(matchesContact(person(), "anna@")).toBe(true);
    expect(matchesContact(person({ tags: ["Climbing"] }), "climb")).toBe(true);
    expect(matchesContact(person(), "bo")).toBe(false);
  });

  it("finds a number however it's written, including the local 07 form of +46 7", () => {
    expect(matchesContact(person(), "123 45")).toBe(true);
    expect(matchesContact(person(), "070-123")).toBe(true);
    expect(matchesContact(person(), "4670123")).toBe(true);
    expect(matchesContact(person(), "12")).toBe(false);
  });
});

describe("describeBirthday", () => {
  const today = new Date(2026, 9, 26);

  it("says the date and how long until the next one, with the age when the year is known", () => {
    expect(describeBirthday({ month: 11, day: 7, year: 1990 }, today)).toEqual({
      date: "7 November 1990",
      next: "In 12 days - turns 36",
    });
    expect(describeBirthday({ month: 11, day: 7, year: null }, today)).toEqual({
      date: "7 November",
      next: "In 12 days",
    });
  });

  it("counts to next year once this year's has passed, and names today and tomorrow", () => {
    expect(
      describeBirthday({ month: 3, day: 14, year: 1990 }, today).next,
    ).toBe("In 139 days - turns 37");
    expect(
      describeBirthday({ month: 10, day: 26, year: null }, today).next,
    ).toBe("Today");
    expect(
      describeBirthday({ month: 10, day: 27, year: null }, today).next,
    ).toBe("Tomorrow");
  });
});

describe("telUrl", () => {
  it("keeps only what a phone dials, dropping a (0) after the country code", () => {
    expect(telUrl("+46 (0)70-123 45 67")).toBe("tel:+46701234567");
    expect(telUrl("070-123 45 67")).toBe("tel:0701234567");
  });
});

// API dates arrive as UTC midnight of the day.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("keeping in touch", () => {
  const today = "2027-03-09";

  it("says how long ago in days, then weeks, then months", () => {
    expect(
      [
        "2027-03-09",
        "2027-03-08",
        "2027-02-24",
        "2027-02-23",
        "2027-01-10",
        "2027-01-08",
        "2026-11-09",
      ].map((d) => daysAgo(d, today)),
    ).toEqual([
      "today",
      "yesterday",
      "13 days ago",
      "2 weeks ago",
      "8 weeks ago",
      "2 months ago",
      "4 months ago",
    ]);
  });

  it("says how they were last seen, with the event or the note", () => {
    expect(
      describeLastSeen(
        { on: day("2027-02-16"), kind: "event", summary: "Lunch" },
        today,
      ),
    ).toBe("Seen 3 weeks ago - Lunch");
    expect(
      describeLastSeen(
        { on: day("2027-03-08"), kind: "call", summary: "Moving to Berlin" },
        today,
      ),
    ).toBe("Called yesterday - Moving to Berlin");
    expect(
      describeLastSeen(
        { on: day("2027-03-09"), kind: "message", summary: null },
        today,
      ),
    ).toBe("Messaged today");
    expect(describeLastSeen(null, today)).toBe("Not seen in the past year");
  });

  it("says the age for a birthday and the years for anything else", () => {
    expect(describeDate("Birthday", 37)).toBe("Birthday, turns 37");
    expect(describeDate("Anniversary", 12)).toBe("Anniversary, 12 years");
    expect(describeDate("Namnsdag", null)).toBe("Namnsdag");
  });

  it("counts an anniversary in years rather than as an age", () => {
    expect(
      describeBirthday(
        { month: 3, day: 12, year: 2015 },
        new Date(2027, 2, 9),
        "years",
      ),
    ).toEqual({ date: "12 March 2015", next: "In 3 days - 12 years" });
  });

  it("names a coming day by weekday within the week, then by date", () => {
    expect(
      ["2027-03-09", "2027-03-10", "2027-03-15", "2027-03-16"].map((d) =>
        upcomingDay(day(d), today),
      ),
    ).toEqual(["Today", "Tomorrow", "Monday", "16 March"]);
  });
});
