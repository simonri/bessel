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
  checkins: [] as { goal_id: string; day: Date }[],
  created: [] as unknown[],
  goals: [] as unknown[],
}));

function score(id: string, title: string, extra: Record<string, unknown>) {
  const { goal, ...rest } = extra as { goal?: Record<string, unknown> };
  return {
    goal: {
      id,
      title,
      metric: "gym_sessions",
      params: {},
      target: 3,
      comparison: "at_least",
      period: "week",
      deadline: null,
      sensitivity: "normal",
      why: null,
      position: 0,
      created_at: new Date(),
      modified_at: null,
      ...goal,
    },
    unit: "sessions",
    current: {
      start: new Date("2026-11-02T00:00:00Z"),
      end: new Date("2026-11-08T00:00:00Z"),
      value: 1,
      met: false,
    },
    history: [],
    streak: 0,
    step: null,
    step_met: null,
    measured: true,
    ...rest,
  };
}

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  goalScoreboardQueryKey: () => ["goals-scoreboard"],
  listGoalsQueryKey: () => ["goals"],
  goalScoreboardOptions: () => ({
    queryKey: ["goals-scoreboard"],
    queryFn: async () => ({ today: new Date(), goals: api.goals }),
  }),
  checkInGoalMutation: () => ({
    mutationFn: async ({
      path,
      body,
    }: {
      path: { goal_id: string };
      body: { day: Date };
    }) => {
      api.checkins.push({ goal_id: path.goal_id, day: body.day });
    },
  }),
  createGoalMutation: () => ({
    mutationFn: async ({ body }: { body: unknown }) => {
      api.created.push(body);
      return body;
    },
  }),
  deleteGoalMutation: () => ({ mutationFn: async () => undefined }),
}));

const { GoalsPage } = await import("./goals-page");

function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <GoalsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.checkins = [];
  api.created = [];
  api.goals = [];
});
afterEach(cleanup);

describe("GoalsPage", () => {
  it("shows where each goal stands, the next step, and what has no data yet", async () => {
    api.goals = [
      score("g1", "Gym", { step: 2 }),
      score("g2", "Asleep by 00:30", {
        goal: { metric: "sleep_before", params: { time: "00:30" } },
        unit: "nights",
        measured: false,
      }),
    ];
    mount();

    expect(await screen.findByText("1 of 3 sessions this week")).toBeTruthy();
    expect(screen.getByText("Next step: 2 sessions this week")).toBeTruthy();
    expect(screen.getByText("No data for this yet")).toBeTruthy();
    // A goal without data yet is not counted as behind.
    expect(screen.getByText("1 of 2 not met so far this period")).toBeTruthy();
  });

  it("checks in a manual goal for today", async () => {
    api.goals = [score("g3", "Read", { goal: { metric: "manual" }, unit: "" })];
    mount();

    fireEvent.click(await screen.findByRole("button", { name: /Check in/ }));

    await waitFor(() => expect(api.checkins).toHaveLength(1));
    expect(api.checkins[0].goal_id).toBe("g3");
    expect(api.checkins[0].day.toISOString()).toMatch(/T00:00:00\.000Z$/);
  });

  it("adds a goal from the form", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Add goal/ }));
    fireEvent.change(screen.getByPlaceholderText("Asleep by 00:30"), {
      target: { value: "Gym three times" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add goal" }).at(-1)!,
    );

    await waitFor(() => expect(api.created).toHaveLength(1));
    expect(api.created[0]).toMatchObject({
      title: "Gym three times",
      metric: "gym_sessions",
      target: 3,
      period: "week",
    });
  });
});
