// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  resets: [] as { counter_id: string; occurred_at?: Date }[],
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listCountersQueryKey: () => ["counters"],
  listCountersOptions: () => ({
    queryKey: ["counters"],
    queryFn: async () => [
      {
        id: "c1",
        name: "Gym",
        last_reset_at: null,
        reset_count: 0,
        created_at: new Date(),
        modified_at: null,
      },
    ],
  }),
  listResetsQueryKey: () => ["resets"],
  listResetsOptions: () => ({ queryKey: ["resets"], queryFn: async () => [] }),
  createResetMutation: () => ({
    mutationFn: async ({
      path,
      body,
    }: {
      path: { counter_id: string };
      body?: { occurred_at?: Date };
    }) => {
      api.resets.push({
        counter_id: path.counter_id,
        occurred_at: body?.occurred_at,
      });
      return { id: `r${api.resets.length}` };
    },
  }),
}));

const { Counters, daysAgo, onPickedDay } = await import("./counters");

const NOW = new Date(2026, 9, 30, 19, 30);

function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Counters />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.resets = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("daysAgo", () => {
  it("goes back whole days at the same time of day", () => {
    expect(daysAgo(4, NOW)).toEqual(new Date(2026, 9, 26, 19, 30));
  });
});

describe("onPickedDay", () => {
  it("is that day at the current time of day", () => {
    expect(onPickedDay("2026-10-20", NOW)).toEqual(
      new Date(2026, 9, 20, 19, 30),
    );
  });

  it("never lands after now", () => {
    expect(onPickedDay("2026-11-02", NOW)).toEqual(NOW);
  });

  it("ignores an empty or broken value", () => {
    expect(onPickedDay("", NOW)).toBeNull();
    expect(onPickedDay("2026-10", NOW)).toBeNull();
  });
});

describe("Counters", () => {
  it("marks a counter done now from its row", async () => {
    mount();

    fireEvent.click(
      await screen.findByRole("button", { name: "Mark Gym as done" }),
    );

    await waitFor(() =>
      expect(api.resets).toEqual([
        { counter_id: "c1", occurred_at: undefined },
      ]),
    );
  });

  it("marks it done on an earlier day from its details", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Gym" }));

    fireEvent.click(await screen.findByRole("button", { name: "4 days ago" }));
    await waitFor(() => expect(api.resets).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("Day it was done"), {
      target: { value: "2026-10-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.resets).toEqual([
        { counter_id: "c1", occurred_at: new Date(2026, 9, 26, 19, 30) },
        { counter_id: "c1", occurred_at: new Date(2026, 9, 20, 19, 30) },
      ]),
    );
    expect(
      (screen.getByLabelText("Day it was done") as HTMLInputElement).value,
    ).toBe("");
  });

  it("adds nothing until a day is picked", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Gym" }));

    const add = await screen.findByRole("button", { name: "Add" });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByLabelText("Day it was done") as HTMLInputElement).max,
    ).toBe("2026-10-30");
  });
});
