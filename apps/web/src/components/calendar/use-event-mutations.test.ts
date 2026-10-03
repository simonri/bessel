import type { CalendarEventSchema } from "@bessel/client";
import { describe, expect, it } from "vitest";
import {
  applyOptimistic,
  applyReply,
  errorDetail,
  eventFieldsBody,
} from "./use-event-mutations";

const TZ = "Asia/Tokyo";

const row: CalendarEventSchema = {
  id: "e1",
  calendar_id: "c1",
  title: "Planning",
  location: "Office",
  all_day: false,
  start_at: new Date("2026-10-07T00:00:00Z"),
  end_at: new Date("2026-10-07T01:00:00Z"),
  start_date: null,
  end_date: null,
  description: "Agenda",
  creator_name: null,
  creator_email: null,
  attendees: [],
  conference_url: null,
  html_link: null,
  busy: true,
  recurring: false,
  visibility: null,
  editable: true,
};

describe("eventFieldsBody", () => {
  it("contains exactly the changed fields", () => {
    expect(eventFieldsBody({ title: "New" }, TZ)).toEqual({ title: "New" });
    expect(eventFieldsBody({}, TZ)).toEqual({});
  });

  it("clears with null and maps names", () => {
    expect(
      eventFieldsBody(
        {
          location: "",
          description: null,
          recurrence: null,
          busy: false,
          addConference: true,
          attendees: ["a@b.com"],
        },
        TZ,
      ),
    ).toEqual({
      location: null,
      description: null,
      recurrence: null,
      busy: false,
      add_conference: true,
      attendees: ["a@b.com"],
    });
  });

  it("sends timing as wall-clock fields in the display zone", () => {
    expect(
      eventFieldsBody(
        {
          timing: {
            allDay: false,
            start: new Date(2026, 9, 7, 9),
            end: new Date(2026, 9, 7, 10),
          },
        },
        TZ,
      ).timing,
    ).toEqual({
      start: { date_time: "2026-10-07T09:00" },
      end: { date_time: "2026-10-07T10:00" },
      time_zone: TZ,
    });
  });
});

describe("applyOptimistic", () => {
  it("converts display-zone wall clock back to instants", () => {
    const next = applyOptimistic(
      row,
      {
        title: "Moved",
        timing: {
          allDay: false,
          start: new Date(2026, 9, 7, 13),
          end: new Date(2026, 9, 7, 14),
        },
      },
      TZ,
    );
    // 13:00 in Tokyo is 04:00 UTC.
    expect(next.start_at?.toISOString()).toBe("2026-10-07T04:00:00.000Z");
    expect(next.title).toBe("Moved");
    expect(next.location).toBe("Office");
  });

  it("switches to all-day dates", () => {
    const next = applyOptimistic(
      row,
      {
        timing: {
          allDay: true,
          start: new Date(2026, 9, 7),
          end: new Date(2026, 9, 8),
        },
      },
      TZ,
    );
    expect([
      next.all_day,
      next.start_at,
      next.start_date?.toISOString(),
    ]).toEqual([true, null, "2026-10-07T00:00:00.000Z"]);
  });

  it("moves calendars", () => {
    expect(applyOptimistic(row, {}, TZ, "c2").calendar_id).toBe("c2");
  });
});

describe("applyReply", () => {
  it("changes my answer and my row, nobody else's", () => {
    const invite: CalendarEventSchema = {
      ...row,
      my_response: "needs_action",
      attendees: [
        {
          email: "boss@x.com",
          name: null,
          response: "accepted",
          is_organizer: true,
        },
        {
          email: "me@x.com",
          name: null,
          response: "needs_action",
          is_self: true,
        },
      ],
    };
    const next = applyReply(invite, "declined");
    expect(next.my_response).toBe("declined");
    expect(next.attendees.map((a) => a.response)).toEqual([
      "accepted",
      "declined",
    ]);
    expect(invite.my_response).toBe("needs_action");
  });
});

describe("errorDetail", () => {
  it("prefers the API's message", () => {
    expect(errorDetail({ detail: "Calendar is read-only" }, "x")).toBe(
      "Calendar is read-only",
    );
    expect(errorDetail(new Error("boom"), "Fallback")).toBe("Fallback");
    expect(errorDetail({ detail: [{ msg: "bad" }] }, "Fallback")).toBe(
      "Fallback",
    );
  });
});
