// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const NOW = new Date(2026, 9, 8, 14, 0);
const at = (h: number) => new Date(2026, 9, 8, h);

function event(id: string, calendarId: string, start: Date, end: Date) {
  return {
    id,
    calendar_id: calendarId,
    title: id,
    all_day: false,
    start_at: start,
    end_at: end,
    start_date: null,
    end_date: null,
    location: null,
    description: null,
    creator_name: null,
    creator_email: null,
    attendees: [],
    my_response: null,
    conference_url: null,
    html_link: null,
    busy: true,
    recurring: false,
    visibility: null,
    editable: true,
  };
}

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listCalendarAccountsOptions: () => ({
    queryKey: ["accounts"],
    queryFn: async () => ({
      accounts: [
        {
          id: "a1",
          provider: "google",
          email: "me@example.com",
          last_synced_at: new Date(2026, 9, 8, 13),
          sync_error: null,
          can_write: true,
          calendars: [
            { id: "mine", name: "Mine", hidden: false },
            { id: "colleague", name: "Colleague", hidden: true },
          ],
        },
      ],
    }),
  }),
  listTasksOptions: () => ({
    queryKey: ["tasks"],
    queryFn: async () => ({ items: [], pagination: { total_count: 0 } }),
  }),
  listCalendarEventsOptions: () => ({
    queryKey: ["events"],
    queryFn: async () => ({
      events: [
        event("Colleague's dentist", "colleague", at(15), at(16)),
        event("Team lunch", "mine", at(17), at(18)),
      ],
    }),
  }),
}));

vi.mock("@/components/settings-dialog", () => ({
  useOpenSettings: () => vi.fn(),
}));

vi.mock("@/components/contacts/meeting-brief", () => ({
  MeetingBrief: () => null,
}));

const { NextUp } = await import("./today-page");

afterEach(cleanup);

describe("NextUp", () => {
  it("skips events on calendars hidden in the calendar", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextUp now={NOW} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Team lunch")).toBeTruthy();
    expect(screen.queryByText("Colleague's dentist")).toBeNull();
  });
});
