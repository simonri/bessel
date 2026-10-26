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
  reminders: { birthdays: [] as unknown[], catch_up: [] as unknown[] },
  createTask: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  getContactRemindersOptions: () => ({
    queryKey: ["reminders"],
    queryFn: async () => api.reminders,
  }),
  createTaskMutation: () => ({ mutationFn: api.createTask }),
}));

const { PeopleBlock } = await import("./today-page");

const today = format(new Date(), "yyyy-MM-dd");
const utcDay = (iso: string) => new Date(`${iso}T00:00:00Z`);
const ref = (id: string, display_name: string) => ({
  id,
  display_name,
  photo_url: null,
});

function mount(queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <PeopleBlock />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.createTask.mockReset();
  api.reminders = { birthdays: [], catch_up: [] };
});
afterEach(cleanup);

describe("PeopleBlock", () => {
  it("shows birthdays and who to catch up with, and makes a task from one", async () => {
    api.reminders = {
      birthdays: [
        { contact: ref("c1", "Anna Berg"), on: utcDay(today), turns: 37 },
        {
          contact: ref("c2", "Bo Ek"),
          on: addDays(utcDay(today), 1),
          turns: null,
        },
      ],
      catch_up: [
        {
          contact: ref("c3", "Cia Ny"),
          due_on: utcDay(today),
          last_seen: { on: addDays(utcDay(today), -21), event_title: "Lunch" },
        },
      ],
    };
    api.createTask.mockResolvedValue({ title: "Get in touch with Cia Ny" });
    mount();

    expect(await screen.findByText("Anna Berg turns 37")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Bo Ek has a birthday")).toBeTruthy();
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.getByText(/last seen 3 weeks ago/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Make a task" }));
    fireEvent.click(screen.getByRole("button", { name: "Task added" }));

    await waitFor(() => expect(api.createTask).toHaveBeenCalledTimes(1));
    expect(api.createTask.mock.calls[0][0].body.title).toBe(
      "Get in touch with Cia Ny",
    );
  });

  it("lets a task that failed to save be tried again", async () => {
    api.reminders = {
      birthdays: [],
      catch_up: [
        {
          contact: ref("c3", "Cia Ny"),
          due_on: utcDay(today),
          last_seen: null,
        },
      ],
    };
    api.createTask.mockRejectedValueOnce(new Error("offline"));
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Make a task" }));

    expect(
      await screen.findByRole("button", { name: "Make a task" }),
    ).toHaveProperty("disabled", false);
    expect(api.createTask).toHaveBeenCalledTimes(1);
  });

  it("stays out of the way when there's nobody to remember", async () => {
    const queryClient = new QueryClient();
    const { container } = mount(queryClient);

    await waitFor(() =>
      expect(queryClient.getQueryState(["reminders"])?.status).toBe("success"),
    );
    expect(container.innerHTML).toBe("");
  });
});
