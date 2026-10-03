import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./calendar-types";
import { buildDirectory, displayName, photoOf, suggestPeople } from "./people";

const event = (
  attendees: [string, string | null, string?][],
  creator?: [string, string],
): CalendarEvent =>
  ({
    details: {
      attendees: attendees.map(([email, name, photoUrl]) => ({
        email,
        name,
        response: "accepted",
        isSelf: false,
        isOrganizer: false,
        photoUrl: photoUrl ?? null,
      })),
      creatorEmail: creator?.[0] ?? null,
      creatorName: creator?.[1] ?? null,
    },
  }) as unknown as CalendarEvent;

describe("directory", () => {
  const directory = buildDirectory([
    event([
      ["Dan@oh.xyz", null],
      ["andrey@oh.xyz", "Andrey Grushevskiy", "https://lh3/andrey"],
    ]),
    event([["dan@oh.xyz", "Dan Gordon"]], ["boss@corp.com", "The Boss"]),
  ]);

  it("merges people across events, keeping any name seen", () => {
    expect(directory.get("dan@oh.xyz")).toEqual({
      email: "Dan@oh.xyz",
      name: "Dan Gordon",
      photoUrl: null,
      events: 2,
    });
    expect(directory.get("boss@corp.com")?.name).toBe("The Boss");
  });

  it("names people from the event, then another event, never a guess", () => {
    expect(displayName({ email: "x@y.com", name: "Given" }, directory)).toBe(
      "Given",
    );
    expect(displayName({ email: "DAN@oh.xyz", name: null }, directory)).toBe(
      "Dan Gordon",
    );
    expect(
      displayName({ email: "sara.lind@z.se", name: null }, directory),
    ).toBeNull();
    expect(
      displayName({ email: "admin@z.se", name: null }, directory),
    ).toBeNull();
  });

  it("finds a photo from another event", () => {
    expect(photoOf({ email: "ANDREY@oh.xyz", photoUrl: null }, directory)).toBe(
      "https://lh3/andrey",
    );
    expect(photoOf({ email: "dan@oh.xyz", photoUrl: null }, directory)).toBe(
      null,
    );
  });

  it("suggests by name or email prefix, most frequent first", () => {
    expect(suggestPeople(directory, "gordon", []).map((p) => p.email)).toEqual([
      "Dan@oh.xyz",
    ]);
    expect(suggestPeople(directory, "a", []).map((p) => p.email)).toEqual([
      "andrey@oh.xyz",
    ]);
    expect(suggestPeople(directory, "dan", ["dan@oh.xyz"])).toEqual([]);
    expect(suggestPeople(directory, " ", [])).toEqual([]);
  });
});
