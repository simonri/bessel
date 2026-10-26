// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { addDays, format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  reminders: { dates: [] as unknown[] },
  followUps: [] as unknown[],
  brief: { event: {}, people: [] as unknown[] },
  log: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  getContactRemindersOptions: () => ({
    queryKey: ["reminders"],
    queryFn: async () => api.reminders,
  }),
  listContactFollowUpsOptions: () => ({
    queryKey: ["follow-ups"],
    queryFn: async () => api.followUps,
  }),
  getMeetingBriefOptions: () => ({
    queryKey: ["brief"],
    queryFn: async () => api.brief,
  }),
  logContactInteractionMutation: () => ({ mutationFn: api.log }),
  dismissContactAtEventMutation: () => ({ mutationFn: api.dismiss }),
}));

const { PeopleBlock } = await import("./today-page");
const { MeetingBrief } = await import("@/components/contacts/meeting-brief");

const today = format(new Date(), "yyyy-MM-dd");
const utcDay = (iso: string) => new Date(`${iso}T00:00:00Z`);
const ref = (id: string, display_name: string) => ({
  id,
  display_name,
  photo_url: null,
});
const event = { id: "ev1", title: "Planning", on: utcDay(today) };

function mount(node = <PeopleBlock />, queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  );
}

beforeEach(() => {
  api.log.mockReset();
  api.dismiss.mockReset();
  api.reminders = { dates: [] };
  api.followUps = [];
  api.brief = { event, people: [] };
});
afterEach(cleanup);

describe("PeopleBlock", () => {
  it("shows birthdays and other dates coming up", async () => {
    api.reminders = {
      dates: [
        {
          contact: ref("c1", "Anna Berg"),
          label: "Birthday",
          on: utcDay(today),
          years: 37,
        },
        {
          contact: ref("c2", "Bo Ek"),
          label: "Anniversary",
          on: addDays(utcDay(today), 1),
          years: null,
        },
      ],
    };
    mount();

    expect(await screen.findByText(/Birthday, turns 37/)).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText(/- Anniversary$/)).toBeTruthy();
    expect(screen.getByText("Tomorrow")).toBeTruthy();
  });

  it("takes a note about someone who was at an event, or skips it", async () => {
    api.followUps = [
      { kind: "note", contact: ref("c1", "Anna Berg"), event },
      { kind: "note", contact: ref("c2", "Bo Ek"), event },
    ];
    api.log.mockResolvedValue({});
    mount();

    fireEvent.change(await screen.findByLabelText("Note about Anna Berg"), {
      target: { value: " She got the job " },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    fireEvent.change(screen.getByLabelText("Note about Bo Ek"), {
      target: { value: "never mind" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Skip" })[1]);

    await waitFor(() => expect(api.log).toHaveBeenCalledTimes(2));
    expect(
      api.log.mock.calls.map((c) => [c[0].path.contact_id, c[0].body]),
    ).toEqual([
      ["c1", { calendar_event_id: "ev1", note: "She got the job" }],
      ["c2", { calendar_event_id: "ev1", note: null }],
    ]);
  });

  it("asks whether someone was there, logging a yes and dismissing a no", async () => {
    api.followUps = [
      { kind: "confirm", contact: ref("c1", "Anna Berg"), event },
      { kind: "confirm", contact: ref("c2", "Bo Ek"), event },
    ];
    api.log.mockResolvedValue({});
    api.dismiss.mockResolvedValue(undefined);
    mount();

    expect(await screen.findByText(/Was Anna Berg at/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Yes" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "No" })[1]);

    await waitFor(() => expect(api.dismiss).toHaveBeenCalledTimes(1));
    expect(api.log.mock.calls[0][0]).toMatchObject({
      path: { contact_id: "c1" },
      body: { calendar_event_id: "ev1" },
    });
    expect(api.dismiss.mock.calls[0][0]).toMatchObject({
      path: { contact_id: "c2" },
      body: { calendar_event_id: "ev1" },
    });
  });

  it("stays out of the way when there's nothing to show", async () => {
    const queryClient = new QueryClient();
    const { container } = mount(<PeopleBlock />, queryClient);

    await waitFor(() => {
      expect(queryClient.getQueryState(["reminders"])?.status).toBe("success");
      expect(queryClient.getQueryState(["follow-ups"])?.status).toBe("success");
    });
    expect(container.innerHTML).toBe("");
  });
});

describe("MeetingBrief", () => {
  it("names who's coming with when they were last seen, the latest note and dates ahead", async () => {
    api.brief = {
      event,
      people: [
        {
          contact: ref("c1", "Anna Berg"),
          sure: true,
          last_seen: { on: utcDay(today), kind: "call", summary: "Boat" },
          recent: [
            {
              id: "e1",
              occurred_on: utcDay(today),
              kind: "call",
              source: "manual",
              note: null,
              event_title: null,
            },
            {
              id: "e2",
              occurred_on: utcDay(today),
              kind: "met",
              source: "manual",
              note: "Moving to Berlin",
              event_title: null,
            },
          ],
          upcoming: {
            contact: ref("c1", "Anna Berg"),
            label: "Birthday",
            on: utcDay(today),
            years: 37,
          },
        },
        {
          contact: ref("c2", "Ada Ny"),
          sure: false,
          last_seen: null,
          recent: [],
          upcoming: null,
        },
      ],
    };
    mount(<MeetingBrief eventId="ev1" />);

    expect(await screen.findByText(/called today - Boat/)).toBeTruthy();
    expect(screen.getByText("“Moving to Berlin”")).toBeTruthy();
    expect(screen.getByText(/Birthday, turns 37 - Today/)).toBeTruthy();
    expect(screen.getByText("(maybe)")).toBeTruthy();
    expect(screen.getByText(/not seen in the past year/)).toBeTruthy();
  });

  it("shows nothing when none of the user's contacts are coming", async () => {
    const queryClient = new QueryClient();
    const { container } = mount(<MeetingBrief eventId="ev1" />, queryClient);

    await waitFor(() =>
      expect(queryClient.getQueryState(["brief"])?.status).toBe("success"),
    );
    expect(container.innerHTML).toBe("");
  });
});
