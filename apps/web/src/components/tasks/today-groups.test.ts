import type { TaskSchema } from "@bessel/client";
import { describe, expect, it } from "vitest";
import { groupTasksByWhen, isDueTodayOrEarlier } from "./today-groups";

const NOW = new Date(2026, 9, 3, 15, 30);

function task(id: string, extra: Partial<TaskSchema> = {}): TaskSchema {
  return { id, title: id, status: "todo", ...extra } as TaskSchema;
}

describe("groupTasksByWhen", () => {
  it("files open tasks by when they're due, doing first", () => {
    const groups = groupTasksByWhen(
      [
        task("someday"),
        task("later", { due_date: "2026-10-12" as unknown as Date }),
        task("week", { due_date: "2026-10-05" as unknown as Date }),
        task("today", { due_date: "2026-10-03" as unknown as Date }),
        task("late-1", { due_date: "2026-10-02" as unknown as Date }),
        task("late-5", { due_date: "2026-09-28" as unknown as Date }),
        task("doing", {
          status: "in_progress",
          due_date: "2026-09-01" as unknown as Date,
        }),
        task("done", { status: "done" }),
        task("routine", {
          is_recurring: true,
          due_date: "2026-10-03" as unknown as Date,
        }),
      ],
      NOW,
    );

    expect(groups.map((g) => [g.key, g.tasks.map((t) => t.id)])).toEqual([
      ["doing", ["doing"]],
      ["overdue", ["late-5", "late-1"]],
      ["today", ["today"]],
      ["week", ["week"]],
      ["later", ["later"]],
      ["someday", ["someday"]],
    ]);
  });

  it("drops empty groups and keeps the incoming order", () => {
    const groups = groupTasksByWhen([task("b"), task("a")], NOW);
    expect(groups).toEqual([
      { key: "someday", label: "Someday", tasks: [task("b"), task("a")] },
    ]);
  });

  it("puts urgent tasks first in each group, then by priority, keeping the order among equals", () => {
    const today = "2026-10-03" as unknown as Date;
    const groups = groupTasksByWhen(
      [
        task("plain-1", { due_date: today }),
        task("high", { due_date: today, priority: 3 }),
        task("plain-2", { due_date: today, priority: 0 }),
        task("urgent", { due_date: today, priority: 4 }),
        task("late-5-low", {
          due_date: "2026-09-28" as unknown as Date,
          priority: 1,
        }),
        task("late-1-urgent", {
          due_date: "2026-10-02" as unknown as Date,
          priority: 4,
        }),
        task("late-3-low", {
          due_date: "2026-09-30" as unknown as Date,
          priority: 1,
        }),
      ],
      NOW,
    );

    expect(groups.map((g) => [g.key, g.tasks.map((t) => t.id)])).toEqual([
      ["overdue", ["late-1-urgent", "late-5-low", "late-3-low"]],
      ["today", ["urgent", "high", "plain-1", "plain-2"]],
    ]);
  });

  it("treats Date due dates as local days", () => {
    const due = new Date(2026, 9, 3);
    expect(isDueTodayOrEarlier(task("x", { due_date: due }), NOW)).toBe(true);
    expect(
      isDueTodayOrEarlier(task("y", { due_date: new Date(2026, 9, 4) }), NOW),
    ).toBe(false);
    expect(isDueTodayOrEarlier(task("z"), NOW)).toBe(false);
  });
});
