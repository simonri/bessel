import type { TaskSchema } from "@bessel/client";
import {
  completeTaskV1TasksTaskIdCompletePostMutation,
  listProjectsV1ProjectsGetOptions,
  listTasksV1TasksGetOptions,
  listTasksV1TasksGetQueryKey,
  reopenTaskV1TasksTaskIdReopenPostMutation,
  reorderTasksV1TasksReorderPatchMutation,
  TaskStatus,
  undoCompleteTaskV1TasksTaskIdUndoCompletePostMutation,
  updateTaskV1TasksTaskIdPatchMutation,
} from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
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
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { TaskDetailDialogController } from "@/components/task-detail-dialog";
import { DoneSummary } from "@/components/tasks/done-summary";
import {
  ProgressRing,
  useTaskProgress,
} from "@/components/tasks/progress-ring";
import { QuickAddTask } from "@/components/tasks/quick-add";
import { RoutinesStrip } from "@/components/tasks/routines-strip";
import { TaskRow } from "@/components/tasks/task-row";
import { TodayView } from "@/components/tasks/today-view";
import {
  STATUS_FIELDS,
  taskMutationOptions,
  useTaskCacheHelpers,
} from "@/hooks/use-task-cache";
import { client } from "@/lib/client";
import { isDesktop } from "@/lib/environment";
import { buildTaskPrompt, isRepeatingTask } from "@/lib/task-format";
import { cn } from "@/lib/utils";
import { BoardColumn } from "./-board-column";
import { ProjectFilterButton } from "./-project-filter-button";
import { DragCard } from "./-task-card";

export const Route = createFileRoute("/_app/tasks")({
  component: Tasks,
});

type ViewTab = "today" | "board" | "done" | "all";

const VIEW_TABS: { label: string; value: ViewTab }[] = [
  { label: "Today", value: "today" },
  { label: "Board", value: "board" },
  { label: "Done", value: "done" },
  { label: "All", value: "all" },
];

// Radix Select doesn't allow an empty-string item value, so "All" (projectFilter === null) needs a sentinel.
const ALL_PROJECTS_VALUE = "__all__";

const BOARD_COLUMNS = ["todo", "in_progress", "in_review"] as const;
type BoardColumnKey = (typeof BOARD_COLUMNS)[number];
type BoardOrder = Record<BoardColumnKey, string[]>;

function columnOf(order: BoardOrder, taskId: string): BoardColumnKey {
  return BOARD_COLUMNS.find((c) => order[c].includes(taskId)) ?? "todo";
}

const dropAnimationConfig: DropAnimation = {
  duration: 200,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

function FirstTaskHint() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 pb-10 text-center">
      <p className="text-sm font-medium text-white/80">What's on your mind?</p>
      <p className="text-xs text-white/45">
        Add your first task above - try "Call mom tomorrow".
      </p>
    </div>
  );
}

const NO_TASKS: TaskSchema[] = [];

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function Tasks() {
  const [viewTab, setViewTab] = useState<ViewTab>("today");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskSchema | null>(null);
  const [localOrder, setLocalOrder] = useState<BoardOrder | null>(null);
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

  // Today and Board only ever render open tasks — filtering
  // server-side keeps the result set small so the (done-heavy) pagination
  // limit never truncates it.
  const showsOpenTasks = viewTab === "today" || viewTab === "board";
  const statusFilter =
    viewTab === "done"
      ? [TaskStatus.DONE]
      : showsOpenTasks
        ? [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW]
        : undefined;
  const sortingValue =
    viewTab === "done"
      ? ["-completed_at" as "-created_at"]
      : showsOpenTasks
        ? ["position" as "-created_at"]
        : ["-created_at" as const];

  const { data: projectsData } = useQuery(
    listProjectsV1ProjectsGetOptions({ client }),
  );
  const projects = projectsData ?? [];

  // A renamed or deleted project leaves nothing to filter by.
  useEffect(() => {
    if (
      projectFilter &&
      projectsData &&
      !projectsData.some((p) => p.name === projectFilter)
    ) {
      setProjectFilter(null);
    }
  }, [projectFilter, projectsData]);

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
    ...taskMutationOptions,
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndGet(path.task_id);
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        status: "done",
        completed_at: new Date(),
      }));
      return { previous };
    },
    onError: (_err, { path }, context) => {
      cache.restoreFields(path.task_id, context?.previous, STATUS_FIELDS);
      toast.error("Action failed");
    },
    onSettled: () => cache.settle(),
  });

  const reopenMutation = useMutation({
    ...reopenTaskV1TasksTaskIdReopenPostMutation({ client }),
    ...taskMutationOptions,
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndGet(path.task_id);
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        status: "todo",
        completed_at: null,
      }));
      return { previous };
    },
    onError: (_err, { path }, context) => {
      cache.restoreFields(path.task_id, context?.previous, STATUS_FIELDS);
      toast.error("Action failed");
    },
    onSettled: () => cache.settle(),
  });

  // Unlike reopen, also removes the next occurrence completing a repeating
  // task spawned.
  const undoCompleteMutation = useMutation({
    ...undoCompleteTaskV1TasksTaskIdUndoCompletePostMutation({ client }),
    ...taskMutationOptions,
    onMutate: async ({ path }) => {
      const previous = await cache.cancelAndGet(path.task_id);
      cache.patchTask(path.task_id, (t) => ({
        ...t,
        status: "todo",
        completed_at: null,
      }));
      return { previous };
    },
    onError: (_err, { path }, context) => {
      cache.restoreFields(path.task_id, context?.previous, STATUS_FIELDS);
      toast.error("Couldn't undo");
    },
    onSettled: () => cache.settle(),
  });

  // Kept as a bespoke inline patch (rather than cache.patchTask) because a
  // position change needs the whole column re-sorted, not just one item swapped.
  const updateMutation = useMutation({
    ...updateTaskV1TasksTaskIdPatchMutation({ client }),
    ...taskMutationOptions,
    onMutate: async ({ path, body }) => {
      const previous = await cache.cancelAndGet(path.task_id);
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
    onError: (_err, { path, body }, context) => {
      cache.restoreFields(
        path.task_id,
        context?.previous,
        Object.keys(body) as (keyof TaskSchema)[],
      );
      toast.error("Action failed");
    },
    onSettled: () => cache.settle(),
  });

  // Touches many tasks at once; a failure is put right by the refetch in
  // settle() rather than by restoring a snapshot over other in-flight edits.
  const reorderMutation = useMutation({
    ...reorderTasksV1TasksReorderPatchMutation({ client }),
    ...taskMutationOptions,
    onMutate: async ({ body }) => {
      await cache.cancel();
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
    },
    onError: () => toast.error("Action failed"),
    onSettled: () => cache.settle(),
  });

  const handleSelectTask = (task: TaskSchema) => {
    setSelectedTaskId(task.id);
  };

  const handleReopenTask = (task: TaskSchema) => {
    reopenMutation.mutate({ client, path: { task_id: task.id } });
  };

  const handleCompleteTask = (task: TaskSchema) => {
    completeMutation.mutate(
      { client, path: { task_id: task.id } },
      {
        onSuccess: () =>
          toast(`“${task.title}” done`, {
            action: {
              label: "Undo",
              onClick: () =>
                undoCompleteMutation.mutate({
                  client,
                  path: { task_id: task.id },
                }),
            },
          }),
      },
    );
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
        in_review: boardTasks.in_review.map((t) => t.id),
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
    const activeColumn = columnOf(localOrder, activeId);
    const overColumn = overIsColumn
      ? (overId as BoardColumnKey)
      : columnOf(localOrder, overId);

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
    const newStatus = columnOf(localOrder, taskId);
    const originalStatus = activeTask.status as BoardColumnKey;
    const overIsColumn = (BOARD_COLUMNS as readonly string[]).includes(overId);

    // Destination column's tasks in server position order, excluding the dragged task.
    // We use the server order (boardTasks) as the position reference to compute midpoints.
    const destServerIds = boardTasks![newStatus]
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

    const body: { position: number; status?: BoardColumnKey } = {
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

  const maxPage = data?.pagination.max_page ?? 1;

  const repeatingTasks = allTasks.filter(
    (t) => (t.status ?? "todo") === "todo" && isRepeatingTask(t),
  );

  const progress = useTaskProgress(showsOpenTasks ? allTasks : NO_TASKS);

  const boardTasks =
    viewTab === "board"
      ? {
          todo: allTasks.filter(
            (t) => (t.status ?? "todo") === "todo" && !isRepeatingTask(t),
          ),
          in_progress: allTasks.filter((t) => t.status === "in_progress"),
          in_review: allTasks.filter((t) => t.status === "in_review"),
        }
      : null;

  const liveBoardTasks = (() => {
    if (!localOrder || !boardTasks) return boardTasks;
    const taskMap = new Map(allTasks.map((t) => [t.id, t]));
    const tasksIn = (ids: string[]) =>
      ids.map((id) => taskMap.get(id)).filter((t): t is TaskSchema => !!t);
    return {
      todo: tasksIn(localOrder.todo),
      in_progress: tasksIn(localOrder.in_progress),
      in_review: tasksIn(localOrder.in_review),
    };
  })();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header: views, project filter, today's progress, quick add */}
      <div className="flex shrink-0 flex-col gap-3 px-3 pt-3 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center rounded-full bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={viewTab === tab.value}
                className={cn(
                  "h-6 rounded-full px-3 text-xs font-medium transition-[background-color,color] duration-150",
                  viewTab === tab.value
                    ? "bg-white/[0.12] text-white/90 shadow-sm"
                    : "text-white/45 hover:text-white/75",
                )}
                onClick={() => {
                  setViewTab(tab.value);
                  // "All" should mean every task, not whatever project was
                  // last selected while on another view — otherwise a
                  // leftover project filter silently hides tasks from it.
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
                    setProjectFilter(
                      value === ALL_PROJECTS_VALUE ? null : value,
                    );
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    size="xs"
                    className="w-auto max-w-32 shrink-0 gap-1 border-0 bg-transparent font-medium text-white/60 shadow-none transition-colors hover:bg-white/[0.06] hover:text-white/80 dark:bg-transparent dark:hover:bg-white/[0.06]"
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
                      project={p.name}
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
          {showsOpenTasks && (
            <ProgressRing done={progress.doneToday} total={progress.total} />
          )}
        </div>
        {viewTab !== "done" && <QuickAddTask defaultProject={projectFilter} />}
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col px-3">
        {isLoading ? (
          <div className="flex flex-1 flex-col gap-2 pt-1">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-11 w-full rounded-xl" />
            ))}
          </div>
        ) : viewTab === "today" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <RoutinesStrip
              tasks={repeatingTasks}
              onSelectTask={handleSelectTask}
              onCompleteTask={handleCompleteTask}
            />
            <TodayView
              tasks={allTasks}
              onSelectTask={handleSelectTask}
              onCompleteTask={handleCompleteTask}
              draggableToClaude={isDesktop}
            />
          </div>
        ) : viewTab === "board" && boardTasks ? (
          allTasks.length === 0 ? (
            <FirstTaskHint />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <RoutinesStrip
                tasks={repeatingTasks}
                onSelectTask={handleSelectTask}
                onCompleteTask={handleCompleteTask}
              />
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
            </div>
          )
        ) : (
          /* Done / All list view */
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            {viewTab === "done" && (
              <DoneSummary count={progress.doneThisWeek} />
            )}
            <div className="mt-2 flex flex-col gap-0.5">
              {allTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onSelect={() => handleSelectTask(task)}
                  onComplete={() => handleCompleteTask(task)}
                  onReopen={() => handleReopenTask(task)}
                  draggableToClaude={isDesktop}
                />
              ))}
              {allTasks.length === 0 && (
                <p className="py-8 text-center text-xs text-white/40">
                  {viewTab === "done"
                    ? "Finished tasks land here."
                    : "No tasks yet - add one above."}
                </p>
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
      </div>

      {/* Task detail dialog */}
      <TaskDetailDialogController
        taskId={selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
      />
    </div>
  );
}
