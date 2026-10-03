import {
  listTasksV1TasksGetOptions,
  type TaskSchema,
  TaskStatus,
} from "@bessel/client";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";
import { isRepeatingTask } from "@/lib/task-format";
import { cn } from "@/lib/utils";
import { isDueTodayOrEarlier } from "./today-groups";

const SIZE = 22;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const WEEK_MS = 7 * 86_400_000;

export function ProgressRing({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const fraction = Math.min(1, done / total);
  const complete = done >= total;
  const summary = `${done} of ${total} done today`;
  return (
    <div
      className="flex items-center gap-1.5"
      title={summary}
      aria-label={summary}
      role="img"
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-white/10"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className="stroke-primary-400 transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span
        className={cn(
          "text-11 tabular-nums",
          complete ? "font-medium text-primary-300" : "text-white/55",
        )}
      >
        {complete ? "All done ✨" : `${done}/${total}`}
      </span>
    </div>
  );
}

function completedAt(task: TaskSchema): Date | null {
  const value = task.completed_at;
  if (!value) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Today's progress: what got done vs. what was in play for today. */
export function useTaskProgress(openTasks: TaskSchema[]) {
  const { data } = useQuery(
    listTasksV1TasksGetOptions({
      client,
      query: {
        page: 1,
        limit: 100,
        status: [TaskStatus.DONE],
        sorting: ["-completed_at" as "-created_at"],
      },
    }),
  );
  const now = new Date();
  let doneToday = 0;
  let doneThisWeek = 0;
  for (const task of data?.items ?? []) {
    const at = completedAt(task);
    if (!at) continue;
    if (isSameLocalDay(at, now)) doneToday++;
    if (now.getTime() - at.getTime() < WEEK_MS) doneThisWeek++;
  }
  const inPlay = openTasks.filter(
    (t) =>
      !isRepeatingTask(t) &&
      (t.status === "in_progress" ||
        ((t.status ?? "todo") === "todo" && isDueTodayOrEarlier(t, now))),
  ).length;
  return { doneToday, doneThisWeek, total: doneToday + inPlay };
}
