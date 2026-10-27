// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetUserStorageForTests, userStorage } from "@/lib/user-storage";

const api = vi.hoisted(() => ({
  accounts: [] as { provider: string }[],
  anyTasks: [] as unknown[],
  openTasks: [] as unknown[],
  hold: null as Promise<void> | null,
  accountsFail: false,
  openSettings: vi.fn(),
}));

const account = (provider: string) => ({
  id: provider,
  provider,
  email: `me@${provider}.com`,
  last_synced_at: 1,
  sync_error: null,
  can_write: true,
  calendars: [],
});
const task = { id: "t1", title: "Buy milk" };

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listCalendarAccountsOptions: () => ({
    queryKey: ["accounts"],
    queryFn: async () => {
      if (api.hold) await api.hold;
      if (api.accountsFail) throw new Error("offline");
      return { accounts: api.accounts };
    },
  }),
  listTasksOptions: (options: { query: { status?: unknown } }) => ({
    queryKey: ["tasks", options.query],
    queryFn: async () => ({
      items: options.query.status ? api.openTasks : api.anyTasks,
      pagination: { total_count: 0, max_page: 0 },
    }),
  }),
  listCalendarEventsOptions: () => ({
    queryKey: ["events"],
    queryFn: async () => ({ events: [] }),
  }),
}));

vi.mock("@/components/settings-dialog", () => ({
  useOpenSettings: () => api.openSettings,
}));

vi.mock("@/components/create-task-dialog", () => ({
  TaskFormDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="New task" /> : null,
}));

const { GetStartedCard, GET_STARTED_KEY } = await import("./get-started");
const { NextUp, TasksBlock } = await import("./today-page");

function mount(node = <GetStartedCard className="" />) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const step = (name: string) => screen.getByRole("listitem", { name });

beforeEach(() => {
  localStorage.clear();
  resetUserStorageForTests();
  api.accounts = [];
  api.anyTasks = [];
  api.openTasks = [];
  api.hold = null;
  api.accountsFail = false;
  api.openSettings.mockReset();
});
afterEach(cleanup);

describe("GetStartedCard", () => {
  it("shows every step to do for a new user", async () => {
    mount();
    await screen.findByRole("region", { name: "Get started" });
    expect(step("Connect Google - to do")).toBeTruthy();
    expect(step("Add your first task - to do")).toBeTruthy();
    expect(step("Connect Claude - to do")).toBeTruthy();
  });

  it("ticks off Google from a connected Google account, not iCloud", async () => {
    api.accounts = [account("apple")];
    const first = mount();
    await screen.findByRole("region", { name: "Get started" });
    expect(step("Connect Google - to do")).toBeTruthy();
    first.unmount();

    api.accounts = [account("apple"), account("google")];
    mount();
    expect(
      await screen.findByRole("listitem", { name: "Connect Google - done" }),
    ).toBeTruthy();
    expect(step("Add your first task - to do")).toBeTruthy();
  });

  it("ticks off the task step from any task, done or not", async () => {
    api.anyTasks = [task];
    mount();
    expect(
      await screen.findByRole("listitem", {
        name: "Add your first task - done",
      }),
    ).toBeTruthy();
    expect(step("Connect Google - to do")).toBeTruthy();
  });

  it("opens Integrations on the add tab from the Google and Claude steps", async () => {
    mount();
    await screen.findByRole("region", { name: "Get started" });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(api.openSettings).toHaveBeenLastCalledWith("integrations", "add");
    api.openSettings.mockReset();
    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    expect(api.openSettings).toHaveBeenLastCalledWith("integrations", "add");
    expect(step("Connect Claude - done")).toBeTruthy();
  });

  it("opens the new-task form from the task step", async () => {
    mount();
    await screen.findByRole("region", { name: "Get started" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByRole("dialog", { name: "New task" })).toBeTruthy();
  });

  it("never shows for an existing user with Google and tasks", async () => {
    api.accounts = [account("google")];
    api.anyTasks = [task];
    const { container } = mount();
    await settle();
    expect(container.innerHTML).toBe("");
    expect(userStorage.getItem(GET_STARTED_KEY)).toBeNull();
  });

  it("renders nothing and starts nothing when accounts fail to load", async () => {
    api.accountsFail = true;
    api.anyTasks = [task];
    const { container } = mount();
    await settle();
    expect(container.innerHTML).toBe("");
    expect(userStorage.getItem(GET_STARTED_KEY)).toBeNull();
  });

  it("renders nothing while the data is still loading", async () => {
    let release = () => {};
    api.hold = new Promise((r) => {
      release = r;
    });
    const { container } = mount();
    await settle();
    expect(container.innerHTML).toBe("");
    release();
    await screen.findByRole("region", { name: "Get started" });
  });

  it("stays until Claude is set up once started, then goes for good", async () => {
    const first = mount();
    await screen.findByRole("region", { name: "Get started" });
    first.unmount();

    api.accounts = [account("google")];
    api.anyTasks = [task];
    const second = mount();
    await screen.findByRole("listitem", { name: "Connect Google - done" });
    expect(step("Add your first task - done")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    expect(screen.queryByRole("region", { name: "Get started" })).toBeNull();
    second.unmount();

    const { container } = mount();
    await settle();
    expect(container.innerHTML).toBe("");
  });

  it("stays hidden after Hide, across mounts", async () => {
    const first = mount();
    await screen.findByRole("region", { name: "Get started" });
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("region", { name: "Get started" })).toBeNull();
    first.unmount();

    const { container } = mount();
    await settle();
    expect(container.innerHTML).toBe("");
  });
});

describe("empty Today cards", () => {
  it("offers to connect a calendar only when none is connected", async () => {
    const first = mount(<NextUp now={new Date()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect a calendar" }),
    );
    expect(api.openSettings).toHaveBeenCalledWith("integrations", "add");
    first.unmount();

    api.accounts = [account("apple")];
    mount(<NextUp now={new Date()} />);
    await settle();
    expect(
      screen.getByText("Nothing on your calendar for the next two days."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Connect a calendar" }),
    ).toBeNull();
  });

  it("doesn't offer to connect a calendar while accounts are loading", async () => {
    let release = () => {};
    api.hold = new Promise((r) => {
      release = r;
    });
    mount(<NextUp now={new Date()} />);
    await settle();
    expect(
      screen.queryByRole("button", { name: "Connect a calendar" }),
    ).toBeNull();
    release();
    await screen.findByRole("button", { name: "Connect a calendar" });
  });

  it("offers to add a task when there are none open", async () => {
    mount(<TasksBlock now={new Date()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a task" }));
    expect(screen.getByRole("dialog", { name: "New task" })).toBeTruthy();
  });
});
