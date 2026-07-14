import type { TaskSchema } from "@bessel/client";
import {
  completeTaskV1TasksTaskIdCompletePostMutation,
  listProjectsV1ProjectsGetOptions,
  listTasksV1TasksGetOptions,
  listTasksV1TasksGetQueryKey,
  reopenTaskV1TasksTaskIdReopenPostMutation,
  reorderTasksV1TasksReorderPatchMutation,
  TaskStatus,
  updateTaskV1TasksTaskIdPatchMutation,
} from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import { Dialog } from "@bessel/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@bessel/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { Skeleton } from "@bessel/ui/components/skeleton";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flag,
  Folder,
  Repeat,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { TaskDetailDialogController } from "@/components/task-detail-dialog";
import { useTaskCacheHelpers } from "@/hooks/use-task-cache";
import { client } from "@/lib/client";
import { isDesktop } from "@/lib/environment";
import {
  buildTaskPrompt,
  formatDueDate,
  getDueDateColor,
  isRepeatingTask,
  PRIORITY_CONFIG,
  STATUS_CONFIG,
} from "@/lib/task-format";
import { BoardColumn } from "./-board-column";
import { ProjectFilterButton } from "./-project-filter-button";
import { ScheduledTasksDialog } from "./-scheduled-tasks-dialog";
import { DragCard } from "./-task-card";

export const Route = createFileRoute("/_app/tasks")({
  component: Tasks,
});

type ViewTab = "board" | "done" | "all";

const VIEW_TABS: { label: string; value: ViewTab }[] = [
  { label: "Board", value: "board" },
  { label: "Done", value: "done" },
  { label: "All", value: "all" },
];

// Radix Select doesn't allow an empty-string item value, so "All" (projectFilter === null) needs a sentinel.
const ALL_PROJECTS_VALUE = "__all__";

const BOARD_COLUMNS = ["todo", "in_progress"] as const;

const dropAnimationConfig: DropAnimation = {
  duration: 200,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function Tasks() {
  const [viewTab, setViewTab] = useState<ViewTab>("board");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [repeatingOpen, setRepeatingOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskSchema | null>(null);
  const [localOrder, setLocalOrder] = useState<{
    todo: string[];
    in_progress: string[];
  } | null>(null);
  const [page, setPage] = useState(1);
  const limit = 100;
  const queryClient = useQueryClient();
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!isDesktop) return;
    const track = (e: PointerEvent) => {
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", track, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener("pointermove", track, { capture: true });
  }, []);

  // Board only ever renders todo/in_progress tasks — filtering server-side keeps
  // its result set small so the (done-heavy) pagination limit never truncates it.
  const statusFilter =
    viewTab === "done"
      ? [TaskStatus.DONE]
      : viewTab === "board"
        ? [TaskStatus.TODO, TaskStatus.IN_PROGRESS]
        : undefined;
  const sortingValue =
    viewTab === "done"
      ? ["-completed_at" as "-created_at"]
      : viewTab === "board"
        ? ["position" as "-created_at"]
        : ["-created_at" as const];

  const { data: projectsData } = useQuery(
    listProjectsV1ProjectsGetOptions({ client }),
  );
  const projects = projectsData ?? [];

  // Collapse the project pills into a dropdown once the widget is too narrow to
  // fit them. The pills are always measured off-screen (invisible + absolute, so
  // they don't affect layout) even while collapsed, so re-expanding the widget is
  // detected too.
  const projectFilterAreaRef = useRef<HTMLDivElement>(null);
  const projectPillsMeasureRef = useRef<HTMLDivElement>(null);
  const [projectFilterCollapsed, setProjectFilterCollapsed] = useState(false);

  useEffect(() => {
    const area = projectFilterAreaRef.current;
    const measure = projectPillsMeasureRef.current;
    if (!area || !measure) return;
    const checkOverflow = () =>
      setProjectFilterCollapsed(measure.scrollWidth > area.clientWidth);
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(area);
    observer.observe(measure);
    checkOverflow();
    return () => observer.disconnect();
  }, [projects.length]);

  const { data, isLoading } = useQuery({
    ...listTasksV1TasksGetOptions({
      client,
      query: {
        page,
        limit,
        sorting: sortingValue,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(projectFilter ? { project: projectFilter } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });

  const queryKey = listTasksV1TasksGetQueryKey({ client });
  const cache = useTaskCacheHelpers();

  const completeMutation = useMutation({
    ...completeTaskV1TasksTaskIdCompletePostMutation({ client }),
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndSnapshot();
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        status: "done",
        completed_at: new Date(),
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      cache.rollback(context?.previous);
      toast.error("Action failed");
    },
    onSettled: () => cache.invalidateAll(),
  });

  const reopenMutation = useMutation({
    ...reopenTaskV1TasksTaskIdReopenPostMutation({ client }),
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndSnapshot();
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        status: "todo",
        completed_at: null,
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      cache.rollback(context?.previous);
      toast.error("Action failed");
    },
    onSettled: () => cache.invalidateAll(),
  });

  // Kept as a bespoke inline patch (rather than cache.patchTask) because a
  // position change needs the whole column re-sorted, not just one item swapped.
  const updateMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    onMutate: async ({ path, body }) => {
      const previous = await cache.cancelAndSnapshot();
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        const updatedItems = old.items.map((t: any) =>
          t.id === path.task_id ? { ...t, ...body } : t,
        );
        if (body.position != null) {
          updatedItems.sort(
            (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
          );
        }
        return { ...old, items: updatedItems };
      });
      if (body.position != null) setLocalOrder(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      cache.rollback(context?.previous);
      toast.error("Action failed");
    },
    onSettled: () => cache.invalidateAll(),
  });

  const reorderMutation = useMutation({
    ...reorderTasksV1TasksReorderPatchMutation({ client }),
    onMutate: async ({ body }) => {
      const previous = await cache.cancelAndSnapshot();
      const itemsById = new Map(body.map((item) => [item.id, item]));
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        const updatedItems = old.items.map((t: any) => {
          const item = itemsById.get(t.id);
          if (!item) return t;
          return {
            ...t,
            position: item.position,
            ...(item.status ? { status: item.status } : {}),
          };
        });
        updatedItems.sort(
          (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
        );
        return { ...old, items: updatedItems };
      });
      setLocalOrder(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      cache.rollback(context?.previous);
      toast.error("Action failed");
    },
    onSettled: () => cache.invalidateAll(),
  });

  const handleSelectTask = (task: TaskSchema) => {
    setSelectedTaskId(task.id);
  };

  const handleCompleteTask = (task: TaskSchema) => {
    completeMutation.mutate({ client, path: { task_id: task.id } });
  };

  const handleReopenTask = (task: TaskSchema) => {
    reopenMutation.mutate({ client, path: { task_id: task.id } });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as TaskSchema;
    setActiveTask(task ?? null);
    if (boardTasks) {
      setLocalOrder({
        todo: boardTasks.todo.map((t) => t.id),
        in_progress: boardTasks.in_progress.map((t) => t.id),
      });
    }
    window.dispatchEvent(new CustomEvent("bessel:task-drag-start"));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !localOrder) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const overIsColumn = (BOARD_COLUMNS as readonly string[]).includes(overId);
    const activeInTodo = localOrder.todo.includes(activeId);
    const activeColumn = activeInTodo ? "todo" : "in_progress";
    const overColumn = overIsColumn
      ? (overId as "todo" | "in_progress")
      : localOrder.todo.includes(overId)
        ? "todo"
        : "in_progress";

    if (activeColumn === overColumn) {
      // Same-column reorder: keep localOrder in sync so liveBoardTasks reflects the drag
      // and handleDragEnd can use localOrder directly instead of re-deriving from over.id.
      if (overIsColumn) return;
      setLocalOrder((prev) => {
        if (!prev) return prev;
        const col = prev[activeColumn];
        const fromIdx = col.indexOf(activeId);
        const toIdx = col.indexOf(overId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
        return { ...prev, [activeColumn]: arrayMove(col, fromIdx, toIdx) };
      });
      return;
    }

    const isBelowOverCenter =
      active.rect.current.translated != null &&
      active.rect.current.translated.top +
        active.rect.current.translated.height / 2 >
        over.rect.top + over.rect.height / 2;

    setLocalOrder((prev) => {
      if (!prev) return prev;
      const source = prev[activeColumn].filter((id) => id !== activeId);
      const dest = [...prev[overColumn]];
      if (overIsColumn) {
        dest.push(activeId);
      } else {
        const idx = dest.indexOf(overId);
        const insertAt =
          idx >= 0 ? idx + (isBelowOverCenter ? 1 : 0) : dest.length;
        dest.splice(insertAt, 0, activeId);
      }
      return { ...prev, [activeColumn]: source, [overColumn]: dest };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    window.dispatchEvent(new CustomEvent("bessel:task-drag-end"));

    // Check if dropped onto a Claude terminal window
    if (isDesktop) {
      const { x, y } = lastPosRef.current;
      const task = active.data.current?.task as TaskSchema | undefined;
      for (const el of document.elementsFromPoint(x, y)) {
        const zone = (el as HTMLElement).closest("[data-claude-session]");
        if (zone && task) {
          const sid = zone.getAttribute("data-claude-session")!;
          window.electron?.terminal.sendInput(sid, buildTaskPrompt(task));
          window.dispatchEvent(
            new CustomEvent("bessel:claude-drop", {
              detail: { sessionId: sid, taskId: task.id },
            }),
          );
          setActiveTask(null);
          setLocalOrder(null);
          return;
        }
      }
    }

    if (!over || !localOrder || !activeTask) {
      setActiveTask(null);
      setLocalOrder(null);
      return;
    }

    const taskId = String(active.id);
    const overId = String(over.id);
    const newStatus = localOrder.todo.includes(taskId) ? "todo" : "in_progress";
    const originalStatus = activeTask.status as "todo" | "in_progress";
    const overIsColumn = (BOARD_COLUMNS as readonly string[]).includes(overId);

    // Destination column's tasks in server position order, excluding the dragged task.
    // We use the server order (boardTasks) as the position reference to compute midpoints.
    const destServerIds = (
      newStatus === "todo" ? boardTasks!.todo : boardTasks!.in_progress
    )
      .filter((t) => t.id !== taskId)
      .map((t) => t.id);

    // Compute the final ordered list for the destination column.
    // Position is determined from over.id + isBelowOverCenter at the actual drop instant,
    // which is more accurate than localOrder (which only tracked cross-column entry point).
    let orderedColumnIds: string[];
    if (overIsColumn) {
      // Dropped in empty column space — place at end
      orderedColumnIds = [...destServerIds, taskId];
    } else if (overId === taskId) {
      // Dropped on own sortable slot — localOrder has been kept in sync throughout
      // the drag (arrayMove for same-column, insertion for cross-column), so use it directly.
      orderedColumnIds = localOrder[newStatus];
    } else {
      const overIndex = destServerIds.indexOf(overId);
      if (overIndex < 0) {
        orderedColumnIds = [...destServerIds, taskId];
      } else {
        const isBelowOverCenter =
          active.rect.current.translated != null &&
          active.rect.current.translated.top +
            active.rect.current.translated.height / 2 >
            over.rect.top + over.rect.height / 2;
        const insertAt = overIndex + (isBelowOverCenter ? 1 : 0);
        const withTask = [...destServerIds];
        withTask.splice(insertAt, 0, taskId);
        orderedColumnIds = withTask;
      }
    }

    const taskIndex = orderedColumnIds.indexOf(taskId);
    const taskMap = new Map(allTasks.map((t) => [t.id, t]));
    const columnTasks = orderedColumnIds
      .map((id) => taskMap.get(id))
      .filter((t): t is TaskSchema => t !== undefined);

    const prev = columnTasks[taskIndex - 1];
    const next = columnTasks[taskIndex + 1];

    let newPosition: number;
    if (!prev && !next) {
      newPosition = 1000;
    } else if (!prev) {
      newPosition = (next.position ?? 1000) - 1000;
    } else if (!next) {
      newPosition = (prev.position ?? 0) + 1000;
    } else {
      const gap = (next.position ?? 0) - (prev.position ?? 0);
      newPosition = ((prev.position ?? 0) + (next.position ?? 0)) / 2;
      if (gap < 1e-6) {
        // Renumber the whole column in a single reorder call. The dragged
        // task's status change rides along on its item — firing a separate
        // update would race the renumbering and clobber positions.
        const renormItems = columnTasks.map((t, i) => ({
          id: t.id,
          position: (i + 1) * 1000,
          status:
            t.id === taskId && originalStatus !== newStatus
              ? (newStatus as TaskStatus)
              : undefined,
        }));
        reorderMutation.mutate({ client, body: renormItems });
        setActiveTask(null);
        return;
      }
    }

    const body: { position: number; status?: "todo" | "in_progress" } = {
      position: newPosition,
    };
    if (originalStatus !== newStatus) body.status = newStatus;

    updateMutation.mutate({ client, path: { task_id: taskId }, body });
    setActiveTask(null);
  };

  const allTasks = data?.items ?? [];
  const allTasksRef = useRef(allTasks);
  allTasksRef.current = allTasks;

  useEffect(() => {
    const onClaudeDrop = (e: Event) => {
      const { taskId } = (
        e as CustomEvent<{ sessionId: string; taskId?: string }>
      ).detail;
      if (!taskId) return;
      const task = allTasksRef.current.find((t) => t.id === taskId);
      if (task && (task.status ?? "todo") === "todo") {
        updateMutation.mutate({
          client,
          path: { task_id: taskId },
          body: { status: "in_progress" },
        });
      }
    };
    window.addEventListener("bessel:claude-drop", onClaudeDrop);
    return () => window.removeEventListener("bessel:claude-drop", onClaudeDrop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCount = data?.pagination.total_count ?? 0;
  const maxPage = data?.pagination.max_page ?? 1;

  const repeatingTasks = allTasks.filter(
    (t) => (t.status ?? "todo") === "todo" && isRepeatingTask(t),
  );

  const boardTasks =
    viewTab === "board"
      ? {
          todo: allTasks.filter(
            (t) => (t.status ?? "todo") === "todo" && !isRepeatingTask(t),
          ),
          in_progress: allTasks.filter((t) => t.status === "in_progress"),
        }
      : null;

  const liveBoardTasks = (() => {
    if (!localOrder || !boardTasks) return boardTasks;
    const taskMap = new Map(allTasks.map((t) => [t.id, t]));
    return {
      todo: localOrder.todo
        .map((id) => taskMap.get(id))
        .filter((t): t is TaskSchema => !!t),
      in_progress: localOrder.in_progress
        .map((id) => taskMap.get(id))
        .filter((t): t is TaskSchema => !!t),
    };
  })();

  const activeCount =
    viewTab === "board" && boardTasks
      ? boardTasks.todo.length + boardTasks.in_progress.length
      : totalCount;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 shrink-0 px-4 pt-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-white/90">Tasks</h2>
          {activeCount > 0 && (
            <span className="text-11 text-white/50 tabular-nums">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {repeatingTasks.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-11 text-white/50 hover:text-violet-400 transition-colors"
              onClick={() => setRepeatingOpen(true)}
            >
              <Repeat className="size-3.5" />
              {repeatingTasks.length} repeated
            </button>
          )}
          <CreateTaskDialog />
        </div>
      </div>

      {/* View tabs + project filter */}
      <div className="flex items-center justify-between border-b border-white/10 shrink-0 px-4">
        <div className="flex items-center">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                viewTab === tab.value
                  ? "border-white/60 text-white/90"
                  : "border-transparent text-white/50 hover:text-white/60"
              }`}
              onClick={() => {
                setViewTab(tab.value);
                // "All" should mean every task, not whatever project was
                // last selected while on Board/Done — otherwise a leftover
                // project filter silently hides tasks from the All tab.
                if (tab.value === "all") setProjectFilter(null);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {projects.length > 0 && (
          <div
            ref={projectFilterAreaRef}
            className="relative flex flex-1 min-w-0 items-center justify-end overflow-hidden pb-px"
          >
            <div
              ref={projectPillsMeasureRef}
              className="pointer-events-none invisible absolute right-0 flex items-center gap-1"
              aria-hidden="true"
            >
              <ProjectFilterButton
                active={projectFilter === null}
                onClick={() => {}}
              >
                All
              </ProjectFilterButton>
              {projects.map((p) => (
                <ProjectFilterButton
                  key={p.id}
                  active={false}
                  onClick={() => {}}
                >
                  {p.name}
                </ProjectFilterButton>
              ))}
            </div>
            {projectFilterCollapsed ? (
              <Select
                value={projectFilter ?? ALL_PROJECTS_VALUE}
                onValueChange={(value) => {
                  setProjectFilter(value === ALL_PROJECTS_VALUE ? null : value);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="h-auto w-auto max-w-32 shrink-0 gap-1 rounded border-0 bg-white/10 px-2.5 py-1 text-11 font-medium text-white/80 shadow-none hover:bg-white/15 data-[size=sm]:h-auto dark:bg-white/10 dark:hover:bg-white/15"
                >
                  <Folder className="size-3" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROJECTS_VALUE}>All</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-1">
                <ProjectFilterButton
                  active={projectFilter === null}
                  onClick={() => {
                    setProjectFilter(null);
                    setPage(1);
                  }}
                >
                  All
                </ProjectFilterButton>
                {projects.map((p) => (
                  <ProjectFilterButton
                    key={p.id}
                    active={projectFilter === p.name}
                    onClick={() => {
                      setProjectFilter(p.name);
                      setPage(1);
                    }}
                  >
                    {p.name}
                  </ProjectFilterButton>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 pt-5 px-4 flex flex-col">
        {isLoading ? (
          <div className="flex flex-1 gap-4">
            {[0, 1].map((col) => (
              <div key={col} className="flex-1 space-y-2">
                <Skeleton className="h-4 w-20" />
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ))}
          </div>
        ) : allTasks.length === 0 && viewTab === "board" ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia>
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={() => {
                  window.dispatchEvent(new CustomEvent("bessel:task-drag-end"));
                  setActiveTask(null);
                  setLocalOrder(null);
                }}
              >
                <div className="flex gap-4 flex-1 min-h-0">
                  {BOARD_COLUMNS.map((col) => (
                    <BoardColumn
                      key={col}
                      status={col}
                      tasks={(liveBoardTasks ?? boardTasks)[col]}
                      onSelectTask={handleSelectTask}
                      onCompleteTask={handleCompleteTask}
                    />
                  ))}
                </div>
                {typeof document !== "undefined" &&
                  createPortal(
                    <DragOverlay dropAnimation={dropAnimationConfig}>
                      {activeTask ? <DragCard task={activeTask} /> : null}
                    </DragOverlay>,
                    document.body,
                  )}
              </DndContext>
            ) : (
              /* Done / All list view */
              <div className="overflow-y-auto flex-1 min-h-0">
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
                        className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2.5 transition-colors cursor-pointer hover:bg-white/10 hover:border-white/20 last:mb-3"
                        onClick={() => handleSelectTask(task)}
                        draggable={isDesktop}
                        onDragStart={
                          isDesktop
                            ? (e) => {
                                e.dataTransfer.setData(
                                  "bessel/task-prompt",
                                  buildTaskPrompt(task),
                                );
                                e.dataTransfer.setData(
                                  "bessel/task-id",
                                  task.id,
                                );
                                e.dataTransfer.effectAllowed = "copy";
                              }
                            : undefined
                        }
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
                            className={`text-13 ${isDone ? "line-through text-white/50" : "font-medium text-white/85"}`}
                          >
                            {task.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {task.is_recurring && (
                            <Repeat className="size-3 text-white/30" />
                          )}
                          {priority >= 3 && (
                            <Flag
                              className={`size-3 ${(PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG[0]).color}`}
                            />
                          )}
                          <StatusIcon className={`size-3.5 ${config.color}`} />
                          {task.due_date && (
                            <span
                              className={`text-11 ${getDueDateColor(task.due_date)}`}
                            >
                              {formatDueDate(task.due_date)}
                            </span>
                          )}
                          {isDone && task.completed_at && (
                            <span className="text-11 text-white/50">
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
                    <div className="text-white/50 text-center text-xs py-8">
                      {viewTab === "done"
                        ? "No completed tasks yet."
                        : "No tasks."}
                    </div>
                  )}
                </div>
                {maxPage > 1 && (
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
            )}
          </>
        )}
      </div>

      {/* Repeating tasks dialog */}
      <Dialog open={repeatingOpen} onOpenChange={setRepeatingOpen}>
        <ScheduledTasksDialog
          tasks={repeatingTasks}
          onSelectTask={(task) => {
            setRepeatingOpen(false);
            setSelectedTaskId(task.id);
          }}
          onCompleteTask={handleCompleteTask}
        />
      </Dialog>

      {/* Task detail dialog */}
      <TaskDetailDialogController
        taskId={selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
      />
    </div>
  );
}
