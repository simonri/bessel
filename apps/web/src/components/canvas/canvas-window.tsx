import { getTaskV1TasksTaskIdGetOptions } from "@bessel/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { Spinner } from "@bessel/ui/components/spinner";
import { glassSurface } from "@bessel/ui/lib/glass";
import { useQuery } from "@tanstack/react-query";
import {
  CheckSquare,
  FolderOpen,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  X,
} from "lucide-react";
import { memo, Suspense, useCallback, useEffect, useState } from "react";
import { TaskDetailDialogController } from "@/components/task-detail-dialog";
import { client } from "@/lib/client";
import { isDoneStatus } from "@/lib/task-format";
import { cn } from "@/lib/utils";
import {
  setWindowAgentStatus,
  useWindowAgentStatus,
} from "./canvas-agent-status";
import { setFocusedWindow, useIsWindowFocused } from "./canvas-focus";
import {
  clearFullscreenWindow,
  toggleFullscreenWindow,
  useIsWindowFullscreen,
} from "./canvas-fullscreen";
import { MODULE_REGISTRY, moduleSupportsProject } from "./module-registry";
import {
  ProjectPickerMenu,
  type ProjectWithPath,
  useProjectsWithPath,
} from "./project-picker-menu";
import {
  type AgentStatus,
  sessionLabel,
  useWindowActions,
  useWindowState,
  useWorkspaceMeta,
  type WindowEntry,
  WindowEntryContext,
  WindowStatusContext,
  WindowTitleContext,
} from "./window-manager";

function AgentStatusIndicator({ status }: { status: AgentStatus }) {
  const isWorking = status === "working";
  return (
    <span
      title={isWorking ? "Working" : "Free"}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        isWorking ? "bg-amber-400 animate-pulse" : "bg-emerald-400",
      )}
    />
  );
}

function WindowSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-5 text-white/60" />
    </div>
  );
}

function MoveToWorkspaceMenu({ entry }: { entry: WindowEntry }) {
  const { workspaces } = useWorkspaceMeta();
  const { windowsByWorkspace } = useWindowState();
  const { moveWindowToWorkspace } = useWindowActions();
  const others = workspaces.filter((ws) => ws.id !== entry.workspaceId);
  if (others.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          title="Move to session"
          className="flex size-5 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
        >
          <MoreHorizontal className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className={cn(
          glassSurface({ weight: "heavy" }),
          "min-w-40 border-white/10 text-white/80 shadow-2xl",
        )}
      >
        {workspaces.map((ws) =>
          ws.id === entry.workspaceId ? null : (
            <DropdownMenuItem
              key={ws.id}
              className="text-white/70 focus:bg-white/10 focus:text-white/90"
              onClick={() => moveWindowToWorkspace(entry.id, ws.id)}
            >
              Move to {sessionLabel(ws, windowsByWorkspace.get(ws.id) ?? [])}
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
  const { updateWindowData } = useWindowActions();
  const attachedTaskId = entry.data?.attachedTaskId || null;
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: task, isError: taskMissing } = useQuery({
    ...getTaskV1TasksTaskIdGetOptions({
      client,
      path: { task_id: attachedTaskId ?? "" },
    }),
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
      <div className="flex h-5 min-w-0 items-center rounded-full bg-white/5">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setDialogOpen(true)}
          title={task.title}
          className="flex h-5 min-w-0 max-w-32 items-center gap-1 rounded-full pl-2 pr-1 text-11 leading-none text-white/50 transition-colors hover:text-white/80"
        >
          <CheckSquare className="size-3 shrink-0 text-primary-400" />
          <span className="min-w-0 truncate">{task.title}</span>
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => updateWindowData(entry.id, { attachedTaskId: "" })}
          title="Unassign task"
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-white/30 transition hover:bg-white/10 hover:text-white/80"
        >
          <X className="size-3" />
        </button>
      </div>
      <TaskDetailDialogController
        taskId={dialogOpen ? attachedTaskId : null}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}

// Lets a project-aware widget (Claude, Codex, Grok, a plain terminal) be
// repointed at a different project directory without closing and reopening
// the window — the actual respawn happens via the `key` on <Component>
// below, which unmounts/remounts the widget (and its Claude session, if any)
// once entry.data's project fields change.
function ProjectSwitcher({ entry }: { entry: WindowEntry }) {
  const { updateWindowData } = useWindowActions();
  const [open, setOpen] = useState(false);
  const projects = useProjectsWithPath();

  const switchProject = (project?: ProjectWithPath) => {
    const patch: Record<string, string> = {
      projectPath: project?.path ?? "",
      projectName: project?.name ?? "",
      projectSshHost: project?.ssh_host ?? "",
    };
    // Force a brand-new Claude session in the new directory rather than
    // resuming the old project's conversation.
    if (entry.module === "claudeCode") patch.claudeSessionId = "";
    updateWindowData(entry.id, patch);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          title="Switch project"
          className="flex size-5 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
        >
          <FolderOpen className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className={cn(
          glassSurface({ weight: "heavy" }),
          "w-64 overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl",
        )}
      >
        <ProjectPickerMenu
          projects={projects}
          onSelect={switchProject}
          noProjectLabel="No project"
        />
      </PopoverContent>
    </Popover>
  );
}

export const CanvasWindow = memo(function CanvasWindow({
  entry,
}: {
  entry: WindowEntry;
}) {
  const { closeWindow } = useWindowActions();
  const { activeWorkspaceId } = useWorkspaceMeta();
  const isFocused = useIsWindowFocused(entry.id);
  // Only "shown" fullscreen while its own workspace is the one on screen —
  // switching away just falls back to the normal grid slot (hidden along
  // with the rest of that workspace), so it reappears fullscreened if you
  // switch back rather than leaking through over whatever you switched to.
  const isFullscreen =
    useIsWindowFullscreen(entry.id) && entry.workspaceId === activeWorkspaceId;
  const config = MODULE_REGISTRY[entry.module];
  const Icon = config.icon;
  const Component = config.component;
  const [dynamicTitle, setDynamicTitle] = useState<string | null>(null);
  const agentStatus = useWindowAgentStatus(entry.id);
  const setAgentStatus = useCallback(
    (status: AgentStatus | null) => setWindowAgentStatus(entry.id, status),
    [entry.id],
  );
  useEffect(() => () => setWindowAgentStatus(entry.id, null), [entry.id]);

  return (
    <div
      data-is-window="true"
      onPointerDown={() => setFocusedWindow(entry.id)}
      className={cn(
        glassSurface({ weight: "medium" }),
        "relative flex h-full flex-col overflow-hidden rounded-2xl border shadow-2xl transition-[border-color] duration-150",
        isFocused || isFullscreen ? "border-primary-500" : "border-white/10",
      )}
    >
      {/* Title bar — react-grid-layout drag handle (selector: .canvas-window-titlebar) */}
      <div
        className="canvas-window-titlebar flex shrink-0 cursor-grab items-center gap-1.5 border-b border-white/10 bg-white/5 px-3 py-1.5 active:cursor-grabbing"
        onMouseDownCapture={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          event.stopPropagation();
          closeWindow(entry.id);
          clearFullscreenWindow(entry.id);
        }}
      >
        <Icon className="size-3.5 text-white/50" />
        <span className="select-none text-xs font-medium text-white/80">
          {config.title}
          {(dynamicTitle || entry.data?.projectName) && (
            <span className="ml-1.5 font-normal text-white/50">
              / {dynamicTitle || entry.data?.projectName}
            </span>
          )}
        </span>
        {agentStatus && <AgentStatusIndicator status={agentStatus} />}
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <AttachedTaskButton entry={entry} />
          {moduleSupportsProject(entry.module) && (
            <ProjectSwitcher entry={entry} />
          )}
          <MoveToWorkspaceMenu entry={entry} />
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => toggleFullscreenWindow(entry.id)}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
            className="flex size-5 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
          >
            {isFullscreen ? (
              <Minimize2 className="size-3" />
            ) : (
              <Maximize2 className="size-3" />
            )}
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              closeWindow(entry.id);
              clearFullscreenWindow(entry.id);
            }}
            className="flex size-5 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div
        className={`flex-1 ${config.noPadding ? "overflow-hidden" : "overflow-y-auto p-4"}`}
      >
        <WindowTitleContext.Provider value={setDynamicTitle}>
          <WindowStatusContext.Provider value={setAgentStatus}>
            <WindowEntryContext.Provider value={entry}>
              <Suspense fallback={<WindowSpinner />}>
                {/* Keyed on project so switching directories fully respawns the
                    widget (killing the old PTY/Claude session, starting a new
                    one) instead of leaving it pointed at the old cwd. */}
                <Component
                  key={`${entry.data?.projectSshHost ?? ""}:${entry.data?.projectPath ?? ""}`}
                />
              </Suspense>
            </WindowEntryContext.Provider>
          </WindowStatusContext.Provider>
        </WindowTitleContext.Provider>
      </div>
    </div>
  );
});
