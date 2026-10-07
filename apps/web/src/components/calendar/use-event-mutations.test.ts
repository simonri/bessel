import type { CalendarEventSchema } from "@bessel/client";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { toApiError } from "@/lib/api-error";
import {
  applyOptimistic,
  applyReply,
  eventFieldsBody,
  restoreEvent,
  shouldRetryCreate,
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

describe("restoreEvent", () => {
  const eventsKey = [{ _id: "listCalendarEventsV1CalendarsEventsGet" }];

  it("puts back only the failed event, where it was", () => {
    const queryClient = new QueryClient();
    const other: CalendarEventSchema = { ...row, id: "e2", title: "Lunch" };
    queryClient.setQueryData(eventsKey, { events: [row, other] });
    const snapshot = [[eventsKey, { event: row, index: 0 }]] as Parameters<
      typeof restoreEvent
    >[2];

    // e1 was deleted optimistically; e2 was then renamed by another write.
    queryClient.setQueryData(eventsKey, {
      events: [{ ...other, title: "Late lunch" }],
    });
    restoreEvent(queryClient, "e1", snapshot);

    expect(queryClient.getQueryData(eventsKey)).toEqual({
      events: [row, { ...other, title: "Late lunch" }],
    });
  });
});

describe("shouldRetryCreate", () => {
  it("retries a create only when its response may have been lost", () => {
    expect(shouldRetryCreate(0, toApiError(new TypeError()))).toBe(true);
    expect(shouldRetryCreate(2, toApiError(new TypeError()))).toBe(false);
    expect(
      shouldRetryCreate(0, toApiError({}, new Response(null, { status: 500 }))),
    ).toBe(false);
  });

  it("retries while the first request with the same key is still running", () => {
    const conflict = (error: string) =>
      toApiError({ error }, new Response(null, { status: 409 }));
    expect(shouldRetryCreate(0, conflict("IdempotencyError"))).toBe(true);
    expect(shouldRetryCreate(0, conflict("Conflict"))).toBe(false);
  });
});
