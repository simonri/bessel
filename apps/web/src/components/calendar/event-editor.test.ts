import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./calendar-types";
import { diffForm, type EditorSubject, initialState } from "./event-editor";

const start = new Date(2026, 9, 7, 9);
const end = new Date(2026, 9, 7, 10);

const event: CalendarEvent = {
  id: "e1",
  calendarId: "fam",
  title: "Planning",
  allDay: false,
  start,
  end,
  details: {
    location: "Office",
    description: "Agenda",
    creatorName: null,
    creatorEmail: null,
    attendees: [
      {
        email: "al@x.com",
        name: null,
        response: "accepted",
        isSelf: false,
        isOrganizer: false,
        photoUrl: null,
      },
    ],
    myResponse: null,
    colorId: null,
    conferenceUrl: null,
    htmlLink: null,
    busy: true,
    recurring: true,
    visibility: null,
    editable: true,
    rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=WE",
    recurrence: {
      frequency: "weekly",
      interval: 2,
      by_weekday: ["WE"],
      count: null,
      until: null,
    },
  },
};

const existing: EditorSubject = {
  event,
  timing: { allDay: false, start, end },
  calendarId: "fam",
};

describe("initialState", () => {
  it("reads the event, keeping a custom rule as custom", () => {
    const state = initialState(existing);
    expect(state).toMatchObject({
      title: "Planning",
      location: "Office",
      description: "Agenda",
      attendees: ["al@x.com"],
      repeat: "custom",
      busy: true,
      addConference: false,
    });
  });

  it("starts a draft empty and not repeating", () => {
    const state = initialState({
      event: null,
      timing: existing.timing,
      calendarId: "fam",
    });
    expect(state).toMatchObject({ title: "", repeat: "none", attendees: [] });
  });
});

describe("diffForm", () => {
  const initial = initialState(existing);

  it("is empty when nothing changed", () => {
    expect(diffForm(initial, initial, false)).toEqual({});
  });

  it("contains only what changed", () => {
    expect(
      diffForm(initial, { ...initial, title: " Sync ", busy: false }, false),
    ).toEqual({
      title: "Sync",
      busy: false,
    });
  });

  it("clears emptied text fields", () => {
    expect(
      diffForm(initial, { ...initial, location: "  ", description: "" }, false),
    ).toEqual({
      location: null,
      description: null,
    });
  });

  it("never sends an untouched custom rule, and maps presets", () => {
    expect(
      diffForm(initial, { ...initial, title: "x" }, false),
    ).not.toHaveProperty("recurrence");
    expect(diffForm(initial, { ...initial, repeat: "none" }, false)).toEqual({
      recurrence: null,
    });
    expect(
      diffForm(initial, { ...initial, repeat: "daily" }, false).recurrence,
    ).toMatchObject({
      frequency: "daily",
    });
  });

  it("detects guest and timing changes", () => {
    const moved = {
      allDay: false,
      start: new Date(2026, 9, 7, 11),
      end: new Date(2026, 9, 7, 12),
    };
    expect(
      diffForm(
        initial,
        { ...initial, attendees: ["al@x.com", "bo@x.com"], timing: moved },
        false,
      ),
    ).toEqual({
      attendees: ["al@x.com", "bo@x.com"],
      timing: moved,
    });
  });

  it("sends title and timing for a new event even when untouched", () => {
    const draft = initialState({
      event: null,
      timing: existing.timing,
      calendarId: "fam",
    });
    expect(diffForm(draft, draft, true)).toEqual({
      title: "",
      timing: existing.timing,
    });
  });

  it("only asks for a conference when requested", () => {
    expect(
      diffForm(initial, { ...initial, addConference: true }, false),
    ).toEqual({ addConference: true });
  });
});
