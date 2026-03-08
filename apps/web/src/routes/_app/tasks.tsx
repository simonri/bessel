import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format, isToday, isTomorrow, isPast, isYesterday, addDays } from "date-fns";
import {
  CheckSquare,
  Trash2,
  X,
  Repeat,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flag,
  Circle,
  CheckCircle2,
  Clock,
  CalendarClock,
  XCircle,
  RotateCcw,
} from "lucide-react";
import type { TaskSchema } from "@metron/client";
import {
  listTasksV1TasksGetOptions,
  listTasksV1TasksGetQueryKey,
  deleteTaskV1TasksTaskIdDeleteMutation,
  completeTaskV1TasksTaskIdCompletePostMutation,
  reopenTaskV1TasksTaskIdReopenPostMutation,
  updateTaskV1TasksTaskIdPatchMutation,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metron/ui/components/alert-dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@metron/ui/components/empty";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/tasks")({
  component: Tasks,
});

type ViewTab = "board" | "done" | "all";

const VIEW_TABS: { label: string; value: ViewTab }[] = [
  { label: "Board", value: "board" },
  { label: "Done", value: "done" },
  { label: "All", value: "all" },
];

const BOARD_COLUMNS = ["todo", "in_progress", "scheduled"] as const;

/** Number of days before due date when a scheduled task becomes visible in Todo. */
const SCHEDULED_THRESHOLD_DAYS = 7;

function isScheduledTask(task: TaskSchema): boolean {
  if (!task.due_date) return false;
  const due = task.due_date instanceof Date ? task.due_date : new Date(String(task.due_date));
  return due > addDays(new Date(), SCHEDULED_THRESHOLD_DAYS);
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  todo: { label: "Todo", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-blue-500" },
  scheduled: { label: "Scheduled", icon: CalendarClock, color: "text-violet-500" },
  done: { label: "Done", icon: CheckCircle2, color: "text-green-500" },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-muted-foreground",
  },
};

const PRIORITY_CONFIG: Record<
  number,
  { label: string; color: string; border: string }
> = {
  0: {
    label: "None",
    color: "text-muted-foreground/30",
    border: "border-l-transparent",
  },
  1: {
    label: "Low",
    color: "text-muted-foreground",
    border: "border-l-muted-foreground/40",
  },
  2: { label: "Medium", color: "text-blue-500", border: "border-l-blue-500" },
  3: {
    label: "High",
    color: "text-orange-500",
    border: "border-l-orange-500",
  },
  4: { label: "Urgent", color: "text-red-500", border: "border-l-red-500" },
};

function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  const last = n % 10;
  if (last === 1) return "st";
  if (last === 2) return "nd";
  if (last === 3) return "rd";
  return "th";
}

function formatDueDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function getDueDateColor(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isPast(d) && !isToday(d)) return "text-red-500";
  if (isToday(d)) return "text-orange-500";
  return "text-muted-foreground";
}

function formatRecurrence(task: TaskSchema): string | null {
  if (!task.is_recurring || !task.rrule_frequency) return null;
  const interval = task.rrule_interval ?? 1;
  const freq = task.rrule_frequency;
  if (interval === 1) {
    if (freq === "daily") return "Daily";
    if (freq === "weekly") {
      if (task.rrule_day_of_week != null) {
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        return `Weekly on ${days[task.rrule_day_of_week]}`;
      }
      return "Weekly";
    }
    if (freq === "monthly") {
      if (task.rrule_day_of_month)
        return `Monthly on the ${task.rrule_day_of_month}${ordinalSuffix(task.rrule_day_of_month)}`;
      return "Monthly";
    }
    if (freq === "yearly") return "Yearly";
  }
  return `Every ${interval} ${freq}`;
}

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  isSelected,
  onSelect,
  onComplete,
}: {
  task: TaskSchema;
  isSelected: boolean;
  onSelect: () => void;
  onComplete: () => void;
}) {
  const priority = task.priority ?? 0;
  const priorityConfig = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0];
  const dueLabel = formatDueDate(task.due_date);
  const dueColor = getDueDateColor(task.due_date);
  const recurrence = formatRecurrence(task);

  return (
    <div
      className={`rounded-md border border-l-2 bg-card p-3 transition-colors cursor-pointer ${priorityConfig.border} ${
        isSelected
          ? "ring-2 ring-primary/50 border-primary"
          : "hover:border-foreground/20"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          className="mt-0.5 shrink-0 text-muted-foreground/40 hover:text-green-500 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
        >
          <Circle className="size-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-sm font-medium leading-snug">{task.title}</div>
          <div className="flex items-center gap-2 flex-wrap">
            {dueLabel && (
              <span
                className={`flex items-center gap-1 text-[11px] ${dueColor}`}
              >
                <Calendar className="size-3" />
                {dueLabel}
              </span>
            )}
            {recurrence && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Repeat className="size-3" />
                {recurrence}
              </span>
            )}
            {priority >= 3 && (
              <Flag className={`size-3 ${priorityConfig.color}`} />
            )}
            {task.project && (
              <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0">
                {task.project}
              </span>
            )}
            {task.area && (
              <span className="text-[11px] text-muted-foreground/60">
                {task.area}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board Column
// ---------------------------------------------------------------------------

function BoardColumn({
  status,
  tasks,
  selectedTaskId,
  onSelectTask,
  onCompleteTask,
}: {
  status: string;
  tasks: TaskSchema[];
  selectedTaskId: string | null;
  onSelectTask: (task: TaskSchema) => void;
  onCompleteTask: (task: TaskSchema) => void;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo;
  const Icon = config.icon;

  return (
    <div className="flex-1 min-w-[260px] max-w-[400px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon className={`size-4 ${config.color}`} />
        <span className="text-sm font-medium">{config.label}</span>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            isSelected={selectedTaskId === task.id}
            onSelect={() => onSelectTask(task)}
            onComplete={() => onCompleteTask(task)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground/50">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function Tasks() {
  const [viewTab, setViewTab] = useState<ViewTab>("board");
  const [selectedTask, setSelectedTask] = useState<TaskSchema | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskSchema | null>(null);
  const [page, setPage] = useState(1);
  const limit = 100;
  const queryClient = useQueryClient();

  const statusFilter =
    viewTab === "done" ? ("done" as const) : undefined;
  const sortingValue =
    viewTab === "done"
      ? (["-completed_at" as "-created_at"])
      : (["-priority" as "-created_at", "due_date" as "-created_at"]);

  const { data, isLoading } = useQuery({
    ...listTasksV1TasksGetOptions({
      client,
      query: {
        page,
        limit,
        sorting: sortingValue,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    ...deleteTaskV1TasksTaskIdDeleteMutation({ client }),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: listTasksV1TasksGetQueryKey({ client }),
      });
      setDeleteTarget(null);
      if (
        selectedTask &&
        deleteTarget &&
        selectedTask.id === deleteTarget.id
      ) {
        setSelectedTask(null);
      }
    },
  });

  const completeMutation = useMutation({
    ...completeTaskV1TasksTaskIdCompletePostMutation({ client }),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: listTasksV1TasksGetQueryKey({ client }),
      });
    },
  });

  const reopenMutation = useMutation({
    ...reopenTaskV1TasksTaskIdReopenPostMutation({ client }),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: listTasksV1TasksGetQueryKey({ client }),
      });
    },
  });

  const updateMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: listTasksV1TasksGetQueryKey({ client }),
      });
    },
  });

  const handleSelectTask = (task: TaskSchema) => {
    setSelectedTask((prev) => (prev?.id === task.id ? null : task));
  };

  const handleCompleteTask = (task: TaskSchema) => {
    completeMutation.mutate({ client, path: { task_id: task.id } });
    if (selectedTask?.id === task.id) setSelectedTask(null);
  };

  const handleReopenTask = (task: TaskSchema) => {
    reopenMutation.mutate({ client, path: { task_id: task.id } });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ client, path: { task_id: deleteTarget.id } });
  };

  const handleStatusChange = (task: TaskSchema, newStatus: string) => {
    updateMutation.mutate({
      client,
      path: { task_id: task.id },
      body: { status: newStatus as "todo" },
    });
    setSelectedTask({ ...task, status: newStatus as "todo" });
  };

  const allTasks = data?.items ?? [];
  const totalCount = data?.pagination.total_count ?? 0;
  const maxPage = data?.pagination.max_page ?? 1;

  // For board view, split tasks into columns.
  // "Scheduled" is a virtual column: tasks with status=todo but due date >7 days away.
  const boardTasks =
    viewTab === "board"
      ? {
          todo: allTasks.filter(
            (t) => (t.status ?? "todo") === "todo" && !isScheduledTask(t),
          ),
          in_progress: allTasks.filter((t) => t.status === "in_progress"),
          scheduled: allTasks.filter(
            (t) => (t.status ?? "todo") === "todo" && isScheduledTask(t),
          ),
        }
      : null;

  const sel = selectedTask;
  const selStatus = sel?.status ?? "todo";
  const selPriority = sel?.priority ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          {totalCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {totalCount} task{totalCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <CreateTaskDialog />
      </div>

      {/* View tabs */}
      <div className="flex items-center border-b">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              viewTab === tab.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setViewTab(tab.value);
              setSelectedTask(null);
              setPage(1);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-muted-foreground flex h-32 items-center justify-center">
          Loading...
        </div>
      ) : allTasks.length === 0 && viewTab === "board" ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckSquare />
            </EmptyMedia>
            <EmptyTitle>No tasks yet</EmptyTitle>
            <EmptyDescription>
              Create your first task to start organizing your work.
            </EmptyDescription>
          </EmptyHeader>
          <CreateTaskDialog />
        </Empty>
      ) : (
        <div className="flex gap-4 items-start">
          {/* Left: board or list */}
          <div className="flex-1 min-w-0">
            {viewTab === "board" && boardTasks ? (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {BOARD_COLUMNS.map((col) => (
                  <BoardColumn
                    key={col}
                    status={col}
                    tasks={boardTasks[col]}
                    selectedTaskId={selectedTask?.id ?? null}
                    onSelectTask={handleSelectTask}
                    onCompleteTask={handleCompleteTask}
                  />
                ))}
              </div>
            ) : (
              /* Done / All list view */
              <div className="space-y-1">
                {allTasks.map((task) => {
                  const status = task.status ?? "todo";
                  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo;
                  const StatusIcon = config.icon;
                  const isDone =
                    status === "done" || status === "cancelled";
                  const priority = task.priority ?? 0;

                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors cursor-pointer ${
                        selectedTask?.id === task.id
                          ? "ring-2 ring-primary/50 border-primary"
                          : "hover:border-foreground/20"
                      }`}
                      onClick={() => handleSelectTask(task)}
                    >
                      {isDone ? (
                        <button
                          type="button"
                          title="Reopen"
                          className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReopenTask(task);
                          }}
                        >
                          <RotateCcw className="size-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-muted-foreground/40 hover:text-green-500 transition-colors shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompleteTask(task);
                          }}
                        >
                          <Circle className="size-4" />
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <span
                          className={`text-sm ${isDone ? "line-through text-muted-foreground" : "font-medium"}`}
                        >
                          {task.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {task.is_recurring && (
                          <Repeat className="size-3 text-muted-foreground" />
                        )}
                        {priority >= 3 && (
                          <Flag
                            className={`size-3 ${(PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0]).color}`}
                          />
                        )}
                        <StatusIcon
                          className={`size-3.5 ${config.color}`}
                        />
                        {task.due_date && (
                          <span
                            className={`text-[11px] ${getDueDateColor(task.due_date)}`}
                          >
                            {formatDueDate(task.due_date)}
                          </span>
                        )}
                        {isDone && task.completed_at && (
                          <span className="text-[11px] text-muted-foreground">
                            {format(
                              task.completed_at instanceof Date
                                ? task.completed_at
                                : new Date(String(task.completed_at)),
                              "MMM d",
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {allTasks.length === 0 && (
                  <div className="text-muted-foreground text-center text-sm py-8">
                    {viewTab === "done"
                      ? "No completed tasks yet."
                      : "No tasks."}
                  </div>
                )}
              </div>
            )}

            {/* Pagination for done/all */}
            {viewTab !== "board" && maxPage > 1 && (
              <div className="flex items-center justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {page} / {maxPage}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                  disabled={page >= maxPage}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          {sel && (
            <div className="w-[300px] shrink-0 rounded-lg border bg-card sticky top-4">
              <div className="p-4 space-y-4">
                {/* Title + close */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{sel.title}</h3>
                  <button
                    type="button"
                    onClick={() => setSelectedTask(null)}
                    className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {(["todo", "in_progress"] as const).map((s) => {
                      const sc = STATUS_CONFIG[s];
                      const Icon = sc.icon;
                      return (
                        <button
                          key={s}
                          type="button"
                          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                            selStatus === s
                              ? "border-foreground/20 bg-accent"
                              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          }`}
                          onClick={() => handleStatusChange(sel, s)}
                        >
                          <Icon className={`size-3 ${sc.color}`} />
                          {sc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Priority */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">
                    Priority
                  </span>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((p) => {
                      const pc = PRIORITY_CONFIG[p] ?? PRIORITY_CONFIG[0];
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                            selPriority === p
                              ? "border-foreground/20 bg-accent font-medium"
                              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          }`}
                          onClick={() => {
                            updateMutation.mutate({
                              client,
                              path: { task_id: sel.id },
                              body: { priority: p },
                            });
                            setSelectedTask({ ...sel, priority: p });
                          }}
                        >
                          {p === 0 ? (
                            "\u2013"
                          ) : (
                            <span className="flex items-center gap-1">
                              <Flag className={`size-3 ${pc.color}`} />
                              {pc.label}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Due date */}
                {sel.due_date && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Due</span>
                    <div
                      className={`flex items-center gap-1.5 text-sm ${getDueDateColor(sel.due_date)}`}
                    >
                      <Calendar className="size-3.5" />
                      {formatDueDate(sel.due_date)}
                    </div>
                  </div>
                )}

                {/* Recurrence */}
                {sel.is_recurring && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      Recurrence
                    </span>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Repeat className="size-3.5" />
                      {formatRecurrence(sel) ?? "Recurring"}
                    </div>
                  </div>
                )}

                {/* Project / Area */}
                {(sel.project || sel.area) && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      Organization
                    </span>
                    <div className="flex items-center gap-2 text-sm">
                      {sel.project && (
                        <span className="bg-muted rounded px-1.5 py-0.5 text-xs">
                          {sel.project}
                        </span>
                      )}
                      {sel.area && (
                        <span className="text-xs text-muted-foreground">
                          {sel.area}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Description */}
                {sel.description && (
                  <div className="pt-2 border-t">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {sel.description}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 border-t flex items-center gap-1.5">
                  {selStatus !== "done" && selStatus !== "cancelled" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => handleCompleteTask(sel)}
                      disabled={completeMutation.isPending}
                    >
                      <CheckCircle2 className="size-3 mr-1" />
                      Complete
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => handleReopenTask(sel)}
                      disabled={reopenMutation.isPending}
                    >
                      <RotateCcw className="size-3 mr-1" />
                      Reopen
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive ml-auto"
                    onClick={() => setDeleteTarget(sel)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be permanently removed.
              This can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
