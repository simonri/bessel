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

  it("treats Date due dates as local days", () => {
    const due = new Date(2026, 9, 3);
    expect(isDueTodayOrEarlier(task("x", { due_date: due }), NOW)).toBe(true);
    expect(
      isDueTodayOrEarlier(task("y", { due_date: new Date(2026, 9, 4) }), NOW),
    ).toBe(false);
    expect(isDueTodayOrEarlier(task("z"), NOW)).toBe(false);
  });
});
