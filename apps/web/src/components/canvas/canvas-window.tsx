import { memo, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, CheckSquare, X } from "lucide-react";
import { getTaskV1TasksTaskIdGetOptions } from "@metron/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metron/ui/components/dropdown-menu";
import { TaskDetailDialogController } from "@/components/task-detail-dialog";
import { isDoneStatus } from "@/lib/task-format";
import { client } from "@/lib/client";
import { MODULE_REGISTRY } from "./module-registry";
import { WindowEntryContext, WindowTitleContext, useWindowManager, type WindowEntry } from "./window-manager";

function WindowSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
    </div>
  );
}

function MoveToWorkspaceMenu({ entry }: { entry: WindowEntry }) {
  const { workspaces, moveWindowToWorkspace } = useWindowManager();
  const others = workspaces.filter((ws) => ws.id !== entry.workspaceId);
  if (others.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          title="Move to workspace"
          className="flex size-4 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
        >
          <ChevronDown className="size-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-40 border-white/10 bg-black/80 text-white/80 shadow-2xl backdrop-blur-xl"
      >
        {workspaces.map((ws, i) =>
          ws.id === entry.workspaceId ? null : (
            <DropdownMenuItem
              key={ws.id}
              className="text-white/70 focus:bg-white/10 focus:text-white/90"
              onClick={() => moveWindowToWorkspace(entry.id, ws.id)}
            >
              Move to workspace {i + 1}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Shown for any window that has a task attached (dropped onto a Claude/Codex
// terminal widget) — lives in the shared title bar rather than the widget's
// own content so it reads as "what this whole window is working on".
function AttachedTaskButton({ entry }: { entry: WindowEntry }) {
  const { updateWindowData } = useWindowManager();
  const attachedTaskId = entry.data?.attachedTaskId || null;
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: task, isError: taskMissing } = useQuery({
    ...getTaskV1TasksTaskIdGetOptions({ client, path: { task_id: attachedTaskId ?? "" } }),
    enabled: attachedTaskId != null,
  });

  useEffect(() => {
    if (!attachedTaskId) return;
    if (taskMissing || (task && isDoneStatus(task.status))) {
      updateWindowData(entry.id, { attachedTaskId: "" });
      setDialogOpen(false);
    }
  }, [entry.id, attachedTaskId, task, taskMissing, updateWindowData]);

  if (!attachedTaskId || !task) return null;

  return (
    <>
      <div className="flex min-w-0 items-center rounded-full bg-white/5">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setDialogOpen(true)}
          title={task.title}
          className="flex min-w-0 max-w-32 items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[11px] text-white/50 transition-colors hover:text-white/80"
        >
          <CheckSquare className="size-2.5 shrink-0 text-primary-400" />
          <span className="min-w-0 truncate">{task.title}</span>
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => updateWindowData(entry.id, { attachedTaskId: "" })}
          title="Unassign task"
          className="flex size-4 shrink-0 items-center justify-center rounded-full text-white/30 transition hover:bg-white/10 hover:text-white/80"
        >
          <X className="size-2.5" />
        </button>
      </div>
      <TaskDetailDialogController
        taskId={dialogOpen ? attachedTaskId : null}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}

export const CanvasWindow = memo(function CanvasWindow({
  entry,
  isFocused = false,
  onFocus,
}: {
  entry: WindowEntry;
  isFocused?: boolean;
  onFocus?: () => void;
}) {
  const { closeWindow } = useWindowManager();
  const config = MODULE_REGISTRY[entry.module];
  const Icon = config.icon;
  const Component = config.component;
  const [dynamicTitle, setDynamicTitle] = useState<string | null>(null);

  return (
    <div
      data-is-window="true"
      onPointerDown={onFocus}
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-black/60 shadow-2xl backdrop-blur-xl transition-[border-color,box-shadow] duration-300 ${
        isFocused ? "border-primary-500" : "border-white/10"
      }`}
    >
      {/* Title bar — react-grid-layout drag handle (selector: .canvas-window-titlebar) */}
      <div className="canvas-window-titlebar flex shrink-0 cursor-grab items-center gap-1.5 border-b border-white/10 bg-white/5 px-3 py-1.5 active:cursor-grabbing">
        <Icon className="size-3 text-white/50" />
        <span className="text-xs font-medium text-white/80">
          {config.title}
          {(dynamicTitle || entry.data?.projectName) && (
            <span className="ml-1.5 font-normal text-white/40">
              / {dynamicTitle || entry.data?.projectName}
            </span>
          )}
        </span>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <AttachedTaskButton entry={entry} />
          <MoveToWorkspaceMenu entry={entry} />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => closeWindow(entry.id)}
            className="flex size-4 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
          >
            <X className="size-2.5" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className={`flex-1 ${config.noPadding ? "overflow-hidden" : "overflow-y-auto p-4"}`}>
        <WindowTitleContext.Provider value={setDynamicTitle}>
          <WindowEntryContext.Provider value={entry}>
            <Suspense fallback={<WindowSpinner />}>
              <Component />
            </Suspense>
          </WindowEntryContext.Provider>
        </WindowTitleContext.Provider>
      </div>
    </div>
  );
});
