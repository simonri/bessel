import { AxiError } from "axi-sdk-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawTaskListResponse } from "../src/api.js";

const listTasksMock = vi.fn();
vi.mock("../src/api.js", () => ({
  listTasks: (...args: unknown[]) => listTasksMock(...args),
}));
vi.mock("../src/auth.js", () => ({
  getValidToken: vi.fn(async () => "fake-token"),
}));

function fixtureResponse(
  overrides: Partial<RawTaskListResponse> = {},
): RawTaskListResponse {
  return {
    items: [
      {
        id: "11111111-2222-3333-4444-555555555555",
        created_at: "2026-01-01T00:00:00Z",
        modified_at: null,
        title: "Write report",
        description: "A".repeat(1000),
        status: "todo",
        priority: 2,
        due_date: "2026-07-20",
        completed_at: null,
        project: "Bessel",
        area: "Personal",
        tags: ["writing"],
        position: 0,
        is_recurring: false,
        rrule_frequency: null,
        rrule_interval: null,
        rrule_day_of_week: null,
        rrule_day_of_month: null,
        parent_task_id: null,
      },
    ],
    pagination: { total_count: 47, max_page: 2 },
    ...overrides,
  };
}

beforeEach(() => {
  listTasksMock.mockReset();
});

describe("tasksCommand", () => {
  it("defaults to id/title/status/due_date and reports the total", async () => {
    listTasksMock.mockResolvedValue(fixtureResponse());
    const { tasksCommand } = await import("../src/tasks.js");

    const result = await tasksCommand([]);

    expect(result.summary).toBe("1 of 47 total");
    expect(result.tasks).toEqual([
      {
        id: "11111111",
        title: "Write report",
        status: "todo",
        due_date: "2026-07-20",
      },
    ]);
  });

  it("truncates long descriptions unless --full is passed", async () => {
    listTasksMock.mockResolvedValue(fixtureResponse());
    const { tasksCommand } = await import("../src/tasks.js");

    const preview = await tasksCommand(["list", "--fields", "description"]);
    const previewTasks = preview.tasks as Array<{ description: string }>;
    expect(previewTasks[0]?.description).toContain(
      "truncated, 1000 chars total",
    );
    expect(previewTasks[0]?.description.length).toBeLessThan(1000);

    const full = await tasksCommand(["list", "--full"]);
    const fullTasks = full.tasks as Array<{ description: string }>;
    expect(fullTasks[0]?.description).toBe("A".repeat(1000));
  });

  it("reports an explicit empty state instead of a blank list", async () => {
    listTasksMock.mockResolvedValue(
      fixtureResponse({
        items: [],
        pagination: { total_count: 0, max_page: 0 },
      }),
    );
    const { tasksCommand } = await import("../src/tasks.js");

    const result = await tasksCommand([]);

    expect(result.summary).toBe("0 tasks found matching these filters");
    expect(result.tasks).toEqual([]);
  });

  it("forwards filter flags as query params to listTasks", async () => {
    listTasksMock.mockResolvedValue(fixtureResponse());
    const { tasksCommand } = await import("../src/tasks.js");

    await tasksCommand([
      "list",
      "--status",
      "todo",
      "--status",
      "in_progress",
      "--priority",
      "3",
      "--project",
      "Bessel",
      "--recurring",
      "--page",
      "2",
      "--limit",
      "25",
    ]);

    expect(listTasksMock).toHaveBeenCalledWith("fake-token", {
      status: ["todo", "in_progress"],
      priority: 3,
      project: "Bessel",
      area: undefined,
      isRecurring: true,
      page: 2,
      limit: 25,
    });
  });

  it("suggests the next page when there are more results than shown", async () => {
    listTasksMock.mockResolvedValue(fixtureResponse());
    const { tasksCommand } = await import("../src/tasks.js");

    const result = await tasksCommand([]);

    expect(result.help).toEqual(
      expect.arrayContaining([expect.stringContaining("--page 2")]),
    );
  });

  it("rejects an unknown flag", async () => {
    const { tasksCommand } = await import("../src/tasks.js");
    await expect(tasksCommand(["list", "--bogus"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects an invalid --status value", async () => {
    const { tasksCommand } = await import("../src/tasks.js");
    await expect(
      tasksCommand(["list", "--status", "nope"]),
    ).rejects.toBeInstanceOf(AxiError);
  });

  it("rejects an unknown --fields value", async () => {
    const { tasksCommand } = await import("../src/tasks.js");
    await expect(
      tasksCommand(["list", "--fields", "made_up"]),
    ).rejects.toBeInstanceOf(AxiError);
  });

  it("rejects an unknown tasks subcommand", async () => {
    const { tasksCommand } = await import("../src/tasks.js");
    await expect(tasksCommand(["view", "123"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
