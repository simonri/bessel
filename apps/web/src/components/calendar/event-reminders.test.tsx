// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/hooks/use-settings";
import type { CalendarEvent, TimedCalendarEvent } from "./calendar-types";
import {
  dueReminders,
  EventReminders,
  reminderBody,
  reminderKey,
} from "./event-reminders";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const api = vi.hoisted(() => ({
  events: [] as unknown[],
  calendars: [] as unknown[],
}));
vi.mock("@bessel/client", () => ({
  listCalendarAccountsV1CalendarsAccountsGetOptions: () => ({
    queryKey: ["accounts"],
    queryFn: async () => ({
      accounts: [{ id: "a", calendars: api.calendars }],
    }),
  }),
  listCalendarEventsV1CalendarsEventsGetOptions: () => ({
    queryKey: ["events"],
    queryFn: async () => ({ events: api.events }),
  }),
}));

const NOW = new Date(2026, 9, 6, 9, 52);

function timed(
  id: string,
  startMin: number,
  extra: Partial<CalendarEvent["details"]> = {},
): TimedCalendarEvent {
  const start = new Date(NOW.getTime() + startMin * 60_000);
  return {
    id,
    calendarId: "c",
    title: id,
    allDay: false,
    start,
    end: new Date(start.getTime() + 3_600_000),
    details: {
      location: null,
      myResponse: null,
      ...extra,
    } as CalendarEvent["details"],
  };
}

describe("dueReminders", () => {
  it("fires from ten minutes before until the start, once", () => {
    const events = [
      timed("soon", 8),
      timed("later", 11),
      timed("started", -1),
      timed("exact", 10),
    ];
    expect(dueReminders(events, NOW, new Set()).map((e) => e.id)).toEqual([
      "soon",
      "exact",
    ]);
    expect(
      dueReminders(events, NOW, new Set([reminderKey(events[0])])).map(
        (e) => e.id,
      ),
    ).toEqual(["exact"]);
  });

  it("skips all-day, declined and hidden-calendar events", () => {
    const allDay = {
      ...timed("trip", 5),
      allDay: true,
    } as unknown as CalendarEvent;
    const declined = timed("no", 5, { myResponse: "declined" });
    const hidden = { ...timed("hidden", 5), calendarId: "h" };
    expect(
      dueReminders([allDay, declined, hidden], NOW, new Set(), new Set(["h"])),
    ).toEqual([]);
  });

  it("reminds again for an event moved to a new time", () => {
    const event = timed("moved", 5);
    const sent = new Set([reminderKey({ ...event, start: new Date(0) })]);
    expect(dueReminders([event], NOW, sent)).toHaveLength(1);
  });
});

describe("reminderBody", () => {
  it("says how soon, when and where", () => {
    expect(reminderBody(timed("x", 8, { location: "Office" }), NOW)).toBe(
      "In 8 min · 10:00–11:00 · Office",
    );
    expect(reminderBody(timed("x", 0.2), NOW)).toMatch(/^In 1 min/);
  });
});

describe("EventReminders", () => {
  const shown: {
    title: string;
    options: NotificationOptions;
    onclick: (() => void) | null;
  }[] = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    shown.length = 0;
    class FakeNotification {
      static permission = "granted";
      onclick: (() => void) | null = null;
      constructor(title: string, options: NotificationOptions) {
        shown.push(Object.assign(this, { title, options }) as never);
      }
      close() {}
    }
    vi.stubGlobal("Notification", FakeNotification);
    localStorage.clear();
    api.calendars = [{ id: "c", hidden: false }];
    api.events = [
      {
        id: "e1",
        calendar_id: "c",
        title: "Standup",
        all_day: false,
        start_at: new Date(NOW.getTime() + 8 * 60_000),
        end_at: new Date(NOW.getTime() + 38 * 60_000),
        start_date: null,
        end_date: null,
        attendees: [],
        location: null,
        description: null,
        creator_name: null,
        creator_email: null,
        conference_url: null,
        html_link: null,
        busy: true,
        recurring: false,
        visibility: null,
        editable: true,
      },
    ];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderReminders() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>
        <SettingsProvider>{children}</SettingsProvider>
      </QueryClientProvider>
    );
    return render(<EventReminders />, { wrapper });
  }

  it("notifies once for an event starting soon and opens the calendar on click", async () => {
    renderReminders();
    await waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0].title).toBe("Standup");
    expect(shown[0].options.body).toMatch(/^In 8 min/);

    shown[0].onclick?.();
    expect(navigate).toHaveBeenCalledWith({ to: "/calendar" });

    cleanup();
    renderReminders();
    await new Promise((r) => setTimeout(r, 50));
    expect(shown).toHaveLength(1);
  });

  it("stays quiet when turned off", async () => {
    localStorage.setItem(
      "bessel:settings",
      JSON.stringify({ calendarReminders: false }),
    );
    renderReminders();
    await new Promise((r) => setTimeout(r, 50));
    expect(shown).toEqual([]);
  });
});
