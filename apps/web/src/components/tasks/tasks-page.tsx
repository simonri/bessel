import { listTasksV1TasksGetOptions, TaskStatus } from "@bessel/client";
import { Spinner } from "@bessel/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { StatTile } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { isRepeatingTask } from "@/lib/task-format";
import { useTaskProgress } from "./progress-ring";
import { groupTasksByWhen } from "./today-groups";

// The full task feature (views, filters, quick add, board drag and drop) is
// the Tasks widget; the page frames it like the other pages.
const TasksBoard = lazy(() =>
  import("@/routes/_app/tasks").then((m) => ({
    default: m.Route.options.component as React.ComponentType,
  })),
);

export interface TaskCounts {
  doing: number;
  inReview: number;
  overdue: number;
  dueToday: number;
  doneToday: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "2 due today, 1 overdue - 3 done today", or something kinder when clear. */
export function tasksSentence({
  doing,
  inReview,
  overdue,
  dueToday,
  doneToday,
}: TaskCounts): string {
  const ahead = [
    doing > 0 ? `${doing} in progress` : null,
    inReview > 0 ? `${inReview} to review` : null,
    dueToday > 0 ? `${dueToday} due today` : null,
    overdue > 0 ? `${overdue} overdue` : null,
  ].filter(Boolean);
  const done = doneToday > 0 ? `${plural(doneToday, "task")} done today` : null;
  if (ahead.length === 0)
    return done ? `Nothing left for today - ${done}.` : "Nothing due today.";
  return `${ahead.join(", ")}${done ? ` - ${done}` : ""}.`;
}

function useOpenTasks() {
  const { data } = useQuery(
    listTasksV1TasksGetOptions({
      client,
      query: {
        page: 1,
        limit: 100,
        status: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW],
        sorting: ["position" as "-created_at"],
      },
    }),
  );
  return {
    tasks: data?.items ?? [],
    total: data?.pagination.total_count ?? null,
  };
}

export function TasksPage() {
  const { tasks, total } = useOpenTasks();
  const progress = useTaskProgress(tasks);
  const groups = groupTasksByWhen(tasks);
  const count = (key: string) =>
    groups.find((g) => g.key === key)?.tasks.length ?? 0;
  const counts: TaskCounts = {
    doing: count("doing"),
    inReview: count("review"),
    overdue: count("overdue"),
    dueToday: count("today"),
    doneToday: progress.doneToday,
  };
  const routines = tasks.filter(isRepeatingTask).length;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-5">
      <header className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-white/90">
          Your tasks
        </h2>
        <p className="mt-0.5 text-xs text-white/50">
          {total === null ? " " : tasksSentence(counts)}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Open"
          value={total ?? "-"}
          hint={
            routines > 0
              ? `${plural(routines, "routine")} among them`
              : undefined
          }
        />
        <StatTile
          label="Due today"
          value={counts.dueToday + counts.doing}
          hint={counts.doing > 0 ? `${counts.doing} in progress` : undefined}
        />
        <StatTile
          label="Overdue"
          value={
            <span className={counts.overdue > 0 ? "text-rose-300" : undefined}>
              {counts.overdue}
            </span>
          }
        />
        <StatTile
          label="Done today"
          value={progress.doneToday}
          hint={`${progress.doneThisWeek} this week`}
        />
      </div>

      <section className="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="size-5 text-white/50" />
            </div>
          }
        >
          <TasksBoard />
        </Suspense>
      </section>
    </div>
  );
}
