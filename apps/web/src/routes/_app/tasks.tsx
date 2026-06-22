import { useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isTomorrow, isPast, isYesterday, addDays } from "date-fns";
import {
  CheckSquare,
  Trash2,
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
  Folder,
  Layers,
  Copy,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@metron/ui/components/dialog";
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
import { toast } from "sonner";
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

const SCHEDULED_THRESHOLD_DAYS = 7;

function isScheduledTask(task: TaskSchema): boolean {
  if (!task.due_date) return false;
  const due = task.due_date instanceof Date ? task.due_date : new Date(String(task.due_date));
  return due > addDays(new Date(), SCHEDULED_THRESHOLD_DAYS);
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  todo: { label: "Todo", icon: Circle, color: "text-white/35" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-blue-400" },
  scheduled: { label: "Scheduled", icon: CalendarClock, color: "text-violet-400" },
  done: { label: "Done", icon: CheckCircle2, color: "text-emerald-400" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-white/25" },
};

const PRIORITY_CONFIG: Record<number, { label: string; color: string; border: string }> = {
  0: { label: "None", color: "text-white/20", border: "border-l-transparent" },
  1: { label: "Low", color: "text-white/40", border: "border-l-white/20" },
  2: { label: "Medium", color: "text-blue-400", border: "border-l-blue-400/70" },
  3: { label: "High", color: "text-orange-400", border: "border-l-orange-400" },
  4: { label: "Urgent", color: "text-red-400", border: "border-l-red-400" },
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
  if (isPast(d) && !isToday(d)) return "text-red-400";
  if (isToday(d)) return "text-orange-400";
  return "text-white/40";
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

function copyText(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
  return Promise.resolve();
}

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  onSelect,
  onComplete,
}: {
  task: TaskSchema;
  onSelect: () => void;
  onComplete: () => void;
}) {
  const priority = task.priority ?? 0;
  const priorityConfig = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0];
  const dueLabel = formatDueDate(task.due_date);
  const dueColor = getDueDateColor(task.due_date);
  const recurrence = formatRecurrence(task);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-lg border border-l-2 border-white/10 bg-white/5 p-2.5 transition-colors cursor-grab active:cursor-grabbing hover:bg-white/10 hover:border-white/20 ${priorityConfig.border}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          className="mt-0.5 shrink-0 text-white/25 hover:text-emerald-400 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
        >
          <Circle className="size-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[13px] font-medium text-white/85 leading-snug">{task.title}</div>
          <div className="flex items-center gap-2 flex-wrap">
            {dueLabel && (
              <span className={`flex items-center gap-1 text-[11px] ${dueColor}`}>
                <Calendar className="size-3" />
                {dueLabel}
              </span>
            )}
            {recurrence && (
              <span className="flex items-center gap-1 text-[11px] text-white/35">
                <Repeat className="size-3" />
                {recurrence}
              </span>
            )}
            {priority >= 3 && <Flag className={`size-3 ${priorityConfig.color}`} />}
            {task.project && (
              <span className="text-[11px] text-white/45 bg-white/10 rounded px-1.5 py-0">
                {task.project}
              </span>
            )}
            {task.area && <span className="text-[11px] text-white/30">{task.area}</span>}
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
  onSelectTask,
  onCompleteTask,
}: {
  status: string;
  tasks: TaskSchema[];
  onSelectTask: (task: TaskSchema) => void;
  onCompleteTask: (task: TaskSchema) => void;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo;
  const Icon = config.icon;
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex-1 min-w-[260px] max-w-[400px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon className={`size-3.5 ${config.color}`} />
        <span className="text-[11px] font-semibold text-white/50">{config.label}</span>
        <span className="text-[10px] text-white/30 bg-white/10 rounded-full px-1.5 tabular-nums ml-0.5">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`space-y-1.5 min-h-[80px] rounded-lg p-1 transition-colors ${isOver ? "bg-white/5" : ""}`}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onSelect={() => onSelectTask(task)}
            onComplete={() => onCompleteTask(task)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-[11px] text-white/25">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Detail Dialog
// ---------------------------------------------------------------------------

function TaskDetailDialog({
  task,
  onComplete,
  onReopen,
  onDelete,
  onStatusChange,
  onPriorityChange,
  completePending,
  reopenPending,
}: {
  task: TaskSchema;
  onComplete: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: number) => void;
  completePending: boolean;
  reopenPending: boolean;
}) {
  const status = task.status ?? "todo";
  const priority = task.priority ?? 0;
  const isDone = status === "done" || status === "cancelled";
  const recurrence = formatRecurrence(task);

  return (
    <DialogContent className="max-w-md gap-0 p-0">
      <DialogHeader className="px-5 pt-5 pb-0">
        <DialogTitle className="text-base leading-snug pr-6">{task.title}</DialogTitle>
      </DialogHeader>

      <div className="px-5 py-4 space-y-5">
        {/* Properties grid */}
        <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-3 text-sm items-center">
          {/* Status */}
          <span className="text-muted-foreground text-xs">Status</span>
          <div className="flex gap-1">
            {(["todo", "in_progress"] as const).map((s) => {
              const sc = STATUS_CONFIG[s];
              const Icon = sc.icon;
              return (
                <button
                  key={s}
                  type="button"
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                    status === s
                      ? "border-foreground/20 bg-accent"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                  onClick={() => onStatusChange(s)}
                >
                  <Icon className={`size-3 ${sc.color}`} />
                  {sc.label}
                </button>
              );
            })}
          </div>

          {/* Priority */}
          <span className="text-muted-foreground text-xs">Priority</span>
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4].map((p) => {
              const pc = PRIORITY_CONFIG[p] ?? PRIORITY_CONFIG[0];
              return (
                <button
                  key={p}
                  type="button"
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    priority === p
                      ? "border-foreground/20 bg-accent font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                  onClick={() => onPriorityChange(p)}
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

          {/* Due date */}
          {task.due_date && (
            <>
              <span className="text-muted-foreground text-xs">Due</span>
              <div
                className={`flex items-center gap-1.5 text-sm ${getDueDateColor(task.due_date)}`}
              >
                <Calendar className="size-3.5" />
                {formatDueDate(task.due_date)}
              </div>
            </>
          )}

          {/* Recurrence */}
          {task.is_recurring && recurrence && (
            <>
              <span className="text-muted-foreground text-xs">Recurrence</span>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Repeat className="size-3.5" />
                {recurrence}
              </div>
            </>
          )}

          {/* Project */}
          {task.project && (
            <>
              <span className="text-muted-foreground text-xs">Project</span>
              <div className="flex items-center gap-1.5 text-sm">
                <Folder className="size-3.5 text-muted-foreground" />
                {task.project}
              </div>
            </>
          )}

          {/* Area */}
          {task.area && (
            <>
              <span className="text-muted-foreground text-xs">Area</span>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Layers className="size-3.5" />
                {task.area}
              </div>
            </>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div className="border-t pt-3">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {task.description}
            </p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t px-5 py-3 flex items-center gap-2">
        {!isDone ? (
          <Button size="sm" className="h-8 text-xs" onClick={onComplete} disabled={completePending}>
            <CheckCircle2 className="size-3.5 mr-1.5" />
            Complete
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={onReopen}
            disabled={reopenPending}
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Reopen
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => {
            const parts = [`Implement this task:\nTitle: ${task.title}`];
            if (task.description) parts.push(`Description: ${task.description}`);
            copyText(parts.join("\n\n"))
              .then(() => toast.success("Copied to clipboard"))
              .catch(() => toast.error("Failed to copy"));
          }}
        >
          <Copy className="size-3.5 mr-1.5" />
          Copy to prompt
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground hover:text-destructive ml-auto"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5 mr-1.5" />
          Delete
        </Button>
      </div>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function Tasks() {
  const [viewTab, setViewTab] = useState<ViewTab>("board");
  const [selectedTask, setSelectedTask] = useState<TaskSchema | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskSchema | null>(null);
  const [page, setPage] = useState(1);
  const limit = 100;
  const queryClient = useQueryClient();

  const statusFilter = viewTab === "done" ? ("done" as const) : undefined;
  const sortingValue =
    viewTab === "done"
      ? ["-completed_at" as "-created_at"]
      : ["-priority" as "-created_at", "due_date" as "-created_at"];

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

  const queryKey = listTasksV1TasksGetQueryKey({ client });

  const optimisticHelpers = {
    async cancel() {
      await queryClient.cancelQueries({ queryKey });
      return queryClient.getQueriesData({ queryKey });
    },
    rollback(context: { previous: [any, any][] } | undefined) {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    invalidate() {
      void queryClient.invalidateQueries({ queryKey });
    },
  };

  const deleteMutation = useMutation({
    ...deleteTaskV1TasksTaskIdDeleteMutation({ client }),
    onMutate: async ({ path }) => {
      const previous = await optimisticHelpers.cancel();
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.filter((t: any) => t.id !== path.task_id),
          pagination: {
            ...old.pagination,
            total_count: old.pagination.total_count - 1,
          },
        };
      });
      setDeleteTarget(null);
      setSelectedTask(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      optimisticHelpers.rollback(context);
      toast.error("Action failed");
    },
    onSettled: () => optimisticHelpers.invalidate(),
  });

  const completeMutation = useMutation({
    ...completeTaskV1TasksTaskIdCompletePostMutation({ client }),
    onMutate: async ({ path }) => {
      const previous = await optimisticHelpers.cancel();
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) =>
            t.id === path.task_id
              ? { ...t, status: "done", completed_at: new Date().toISOString() }
              : t,
          ),
        };
      });
      setSelectedTask(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      optimisticHelpers.rollback(context);
      toast.error("Action failed");
    },
    onSettled: () => optimisticHelpers.invalidate(),
  });

  const reopenMutation = useMutation({
    ...reopenTaskV1TasksTaskIdReopenPostMutation({ client }),
    onMutate: async ({ path }) => {
      const previous = await optimisticHelpers.cancel();
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) =>
            t.id === path.task_id ? { ...t, status: "todo", completed_at: null } : t,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      optimisticHelpers.rollback(context);
      toast.error("Action failed");
    },
    onSettled: () => optimisticHelpers.invalidate(),
  });

  const updateMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    onMutate: async ({ path, body }) => {
      const previous = await optimisticHelpers.cancel();
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) => (t.id === path.task_id ? { ...t, ...body } : t)),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      optimisticHelpers.rollback(context);
      toast.error("Action failed");
    },
    onSettled: () => optimisticHelpers.invalidate(),
  });

  const handleSelectTask = (task: TaskSchema) => {
    setSelectedTask(task);
  };

  const handleCompleteTask = (task: TaskSchema) => {
    completeMutation.mutate({ client, path: { task_id: task.id } });
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

  const handlePriorityChange = (task: TaskSchema, newPriority: number) => {
    updateMutation.mutate({
      client,
      path: { task_id: task.id },
      body: { priority: newPriority },
    });
    setSelectedTask({ ...task, priority: newPriority });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const taskId = String(active.id);
    const newStatus = String(over.id);

    // Map "scheduled" drop zone → status "todo" (scheduled is a view-layer concept)
    const apiStatus = newStatus === "scheduled" ? "todo" : newStatus;

    updateMutation.mutate({
      client,
      path: { task_id: taskId },
      body: { status: apiStatus as "todo" },
    });
  };

  const allTasks = data?.items ?? [];
  const totalCount = data?.pagination.total_count ?? 0;
  const maxPage = data?.pagination.max_page ?? 1;

  const boardTasks =
    viewTab === "board"
      ? {
          todo: allTasks.filter((t) => (t.status ?? "todo") === "todo" && !isScheduledTask(t)),
          in_progress: allTasks.filter((t) => t.status === "in_progress"),
          scheduled: allTasks.filter((t) => (t.status ?? "todo") === "todo" && isScheduledTask(t)),
        }
      : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-white/90">Tasks</h2>
          {totalCount > 0 && (
            <span className="text-[11px] text-white/35 tabular-nums">
              {totalCount}
            </span>
          )}
        </div>
        <CreateTaskDialog />
      </div>

      {/* View tabs */}
      <div className="flex items-center border-b border-white/10">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              viewTab === tab.value
                ? "border-white/60 text-white/90"
                : "border-transparent text-white/35 hover:text-white/60"
            }`}
            onClick={() => {
              setViewTab(tab.value);
              setPage(1);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? null : allTasks.length === 0 && viewTab === "board" ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia >
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
        <>
          {viewTab === "board" && boardTasks ? (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {BOARD_COLUMNS.map((col) => (
                  <BoardColumn
                    key={col}
                    status={col}
                    tasks={boardTasks[col]}
                    onSelectTask={handleSelectTask}
                    onCompleteTask={handleCompleteTask}
                  />
                ))}
              </div>
            </DndContext>
          ) : (
            /* Done / All list view */
            <div className="space-y-1">
              {allTasks.map((task) => {
                const status = task.status ?? "todo";
                const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo;
                const StatusIcon = config.icon;
                const isDone = status === "done" || status === "cancelled";
                const priority = task.priority ?? 0;

                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2.5 transition-colors cursor-pointer hover:bg-white/10 hover:border-white/20"
                    onClick={() => handleSelectTask(task)}
                  >
                    {isDone ? (
                      <button
                        type="button"
                        title="Reopen"
                        className="text-white/25 hover:text-white/70 transition-colors shrink-0"
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
                        className="text-white/25 hover:text-emerald-400 transition-colors shrink-0"
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
                        className={`text-[13px] ${isDone ? "line-through text-white/30" : "font-medium text-white/85"}`}
                      >
                        {task.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.is_recurring && <Repeat className="size-3 text-white/30" />}
                      {priority >= 3 && (
                        <Flag
                          className={`size-3 ${(PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0]).color}`}
                        />
                      )}
                      <StatusIcon className={`size-3.5 ${config.color}`} />
                      {task.due_date && (
                        <span className={`text-[11px] ${getDueDateColor(task.due_date)}`}>
                          {formatDueDate(task.due_date)}
                        </span>
                      )}
                      {isDone && task.completed_at && (
                        <span className="text-[11px] text-white/30">
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
                <div className="text-white/30 text-center text-xs py-8">
                  {viewTab === "done" ? "No completed tasks yet." : "No tasks."}
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
        </>
      )}

      {/* Task detail dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        {selectedTask && (
          <TaskDetailDialog
            task={selectedTask}
            onComplete={() => handleCompleteTask(selectedTask)}
            onReopen={() => handleReopenTask(selectedTask)}
            onDelete={() => {
              setDeleteTarget(selectedTask);
            }}
            onStatusChange={(s) => handleStatusChange(selectedTask, s)}
            onPriorityChange={(p) => handlePriorityChange(selectedTask, p)}
            completePending={completeMutation.isPending}
            reopenPending={reopenMutation.isPending}
          />
        )}
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be permanently removed. This can&rsquo;t be
              undone.
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
