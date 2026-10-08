import type { TaskSchema } from "@bessel/client";
import { daysUntilDue, isRepeatingTask } from "@/lib/task-format";

export type WhenKey =
  | "doing"
  | "review"
  | "overdue"
  | "today"
  | "week"
  | "later"
  | "someday";

export interface WhenGroup {
  key: WhenKey;
  label: string;
  tasks: TaskSchema[];
}

const GROUPS: { key: WhenKey; label: string }[] = [
  { key: "doing", label: "Doing" },
  { key: "review", label: "In review" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "someday", label: "Someday" },
];

function isOpen(task: TaskSchema): boolean {
  const status = task.status ?? "todo";
  return (
    status === "todo" || status === "in_progress" || status === "in_review"
  );
}

function whenOf(task: TaskSchema, now: Date): WhenKey {
  if (task.status === "in_progress") return "doing";
  if (task.status === "in_review") return "review";
  if (!task.due_date) return "someday";
  const days = daysUntilDue(task.due_date, now);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days < 7) return "week";
  return "later";
}

export function isDueTodayOrEarlier(
  task: TaskSchema,
  now = new Date(),
): boolean {
  return task.due_date != null && daysUntilDue(task.due_date, now) <= 0;
}

/** Open, non-recurring tasks by when they're due, in display order. */
export function groupTasksByWhen(
  tasks: TaskSchema[],
  now = new Date(),
): WhenGroup[] {
  const buckets = new Map<WhenKey, TaskSchema[]>(
    GROUPS.map((g) => [g.key, []]),
  );
  for (const task of tasks) {
    if (!isOpen(task) || isRepeatingTask(task)) continue;
    buckets.get(whenOf(task, now))?.push(task);
  }
  buckets
    .get("overdue")
    ?.sort(
      (a, b) => daysUntilDue(a.due_date!, now) - daysUntilDue(b.due_date!, now),
    );
  return GROUPS.flatMap(({ key, label }) => {
    const groupTasks = buckets.get(key) ?? [];
    return groupTasks.length > 0 ? [{ key, label, tasks: groupTasks }] : [];
  });
}
