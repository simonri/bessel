import { getTaskV1TasksTaskIdGetOptions } from "@bessel/client";
import { Button, buttonVariants } from "@bessel/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { Spinner } from "@bessel/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import {
  CheckSquare,
  FolderOpen,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Power,
  Smartphone,
  X,
} from "lucide-react";
import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  isLive,
  useClaudeSession,
} from "@/components/claude-sessions/claude-sessions-store";
import { RemoteLinkPopover } from "@/components/claude-sessions/remote-link-popover";
import { SessionName } from "@/components/claude-sessions/session-name";
import {
  STATUS_DOT_TITLE,
  StatusDot,
} from "@/components/claude-sessions/status-dot";
import { useEndClaudeSession } from "@/components/claude-sessions/use-end-session";
import { CLAUDE_SESSION_KEY } from "@/components/claude-sessions/use-open-claude-session";
import { TaskDetailDialogController } from "@/components/task-detail-dialog";
import { WINDOW_FRAME, WindowTitleBar } from "@/components/window-chrome";
import { isNotFoundError } from "@/lib/api-error";
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
  return (
    <span title={STATUS_DOT_TITLE[status]} className="flex">
      <StatusDot status={status} />
    </span>
  );
}

function WindowSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-5 text-white/60" />
    </div>
  );
}

function WindowMenu({
  entry,
  onRename,
}: {
  entry: WindowEntry;
  /** Set for windows whose name can be edited in the title bar. */
  onRename?: () => void;
}) {
  const { workspaces } = useWorkspaceMeta();
  const { windowsByWorkspace } = useWindowState();
  const { moveWindowToWorkspace } = useWindowActions();
  const claudeSession = useClaudeSession(
    entry.module === "claudeCode"
      ? entry.data?.[CLAUDE_SESSION_KEY] || undefined
      : undefined,
  );
  const { requestEnd, endDialog } = useEndClaudeSession();
  // Closing the menu refocuses its trigger, which would blur the rename
  // input straight away.
  const renameRequested = useRef(false);
  const others = workspaces.filter((ws) => ws.id !== entry.workspaceId);
  const canEnd = claudeSession !== null && isLive(claudeSession.status);
  if (others.length === 0 && !canEnd && !onRename) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            shape="pill"
            onPointerDown={(e) => e.stopPropagation()}
            title="More"
            className="text-white/40 hover:bg-white/10 hover:text-white/80"
          >
            <MoreHorizontal className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-40"
          onCloseAutoFocus={(e) => {
            if (!renameRequested.current) return;
            renameRequested.current = false;
            e.preventDefault();
            onRename?.();
          }}
        >
          {onRename && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  renameRequested.current = true;
                }}
              >
                <Pencil className="size-3.5" />
                Rename session
              </DropdownMenuItem>
              {others.length > 0 && <DropdownMenuSeparator />}
            </>
          )}
          {others.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => moveWindowToWorkspace(entry.id, ws.id)}
            >
              Move to {sessionLabel(ws, windowsByWorkspace.get(ws.id) ?? [])}
            </DropdownMenuItem>
          ))}
          {canEnd && others.length > 0 && <DropdownMenuSeparator />}
          {canEnd && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => requestEnd(claudeSession)}
            >
              <Power className="size-3.5" />
              End session
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {endDialog}
    </>
  );
}

// Background Claude sessions are reachable from the phone: the title bar
// offers the link while one is live.
function RemoteLinkButton({ entry }: { entry: WindowEntry }) {
  const session = useClaudeSession(
    entry.data?.[CLAUDE_SESSION_KEY] || undefined,
  );
  if (!session || !isLive(session.status)) return null;
  return (
    <RemoteLinkPopover sessionKey={session.key} side="bottom" align="end">
      <Button
        variant="ghost"
        size="iconSm"
        shape="pill"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        title="Open on phone"
        className={cn(
          "hover:bg-white/10 hover:text-white/80",
          session.remoteUrl ? "text-white/40" : "text-white/25",
        )}
      >
        <Smartphone className="size-3" />
      </Button>
    </RemoteLinkPopover>
  );
}

// Shown for any window that has a task attached (dropped onto a Claude/Codex
// terminal widget) — lives in the shared title bar rather than the widget's
// own content so it reads as "what this whole window is working on".
function AttachedTaskButton({ entry }: { entry: WindowEntry }) {
  const { updateWindowData } = useWindowActions();
  const attachedTaskId = entry.data?.attachedTaskId || null;
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: task, error } = useQuery({
    ...getTaskV1TasksTaskIdGetOptions({
      client,
      path: { task_id: attachedTaskId ?? "" },
    }),
    enabled: attachedTaskId != null,
  });
  // Only a definitive not-found detaches the task; network/auth/5xx failures
  // are transient and must not wipe the persisted attachment.
  const taskMissing = isNotFoundError(error);

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
          className={cn(
            buttonVariants({ variant: "ghost", shape: "pill" }),
            "h-5 min-w-0 max-w-32 gap-1 pl-2 pr-1 text-11 leading-none text-white/50 hover:bg-transparent hover:text-white/80",
          )}
        >
          <CheckSquare className="size-3 shrink-0 text-primary-400" />
          <span className="min-w-0 truncate">{task.title}</span>
        </button>
        <Button
          variant="ghost"
          size="iconSm"
          shape="pill"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => updateWindowData(entry.id, { attachedTaskId: "" })}
          title="Unassign task"
          className="shrink-0 text-white/30 hover:bg-white/10 hover:text-white/80"
        >
          <X className="size-3" />
        </Button>
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
    // Start a new Claude session in the new directory rather than resuming
    // the old project's conversation; the old one keeps running in the
    // background.
    if (entry.module === "claudeCode") {
      patch.claudeSessionId = "";
      patch[CLAUDE_SESSION_KEY] = "";
    }
    updateWindowData(entry.id, patch);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          shape="pill"
          onPointerDown={(e) => e.stopPropagation()}
          title="Switch project"
          className="text-white/40 hover:bg-white/10 hover:text-white/80"
        >
          <FolderOpen className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className={cn(
          "bg-popover",
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
  const { closeWindow, renameWorkspace } = useWindowActions();
  const { activeWorkspaceId, workspaces } = useWorkspaceMeta();
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
  const claudeSession = useClaudeSession(
    entry.module === "claudeCode"
      ? entry.data?.[CLAUDE_SESSION_KEY] || undefined
      : undefined,
  );
  const [renaming, setRenaming] = useState(false);
  // A canvas session opened for a Claude session is named after it; keep
  // the two in step unless the canvas session was renamed on its own.
  const followRename = (name: string, previous: string) => {
    const workspace = workspaces.find((ws) => ws.id === entry.workspaceId);
    if (workspace?.name === previous) renameWorkspace(workspace.id, name);
  };

  return (
    <div
      data-is-window="true"
      onPointerDown={() => setFocusedWindow(entry.id)}
      className={cn(
        WINDOW_FRAME,
        "transition-[border-color] duration-150",
        (isFocused || isFullscreen) && "border-primary-500",
      )}
    >
      {/* Title bar — react-grid-layout drag handle (selector: .canvas-window-titlebar) */}
      <WindowTitleBar
        icon={Icon}
        title={config.title}
        subtitle={
          claudeSession ? (
            <SessionName
              session={claudeSession}
              editing={renaming}
              onEditingChange={setRenaming}
              onRenamed={followRename}
            />
          ) : (
            dynamicTitle || entry.data?.projectName
          )
        }
        leading={agentStatus && <AgentStatusIndicator status={agentStatus} />}
        className="canvas-window-titlebar cursor-grab active:cursor-grabbing"
        onMouseDownCapture={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          event.stopPropagation();
          closeWindow(entry.id);
          clearFullscreenWindow(entry.id);
        }}
      >
        <AttachedTaskButton entry={entry} />
        {moduleSupportsProject(entry.module) && (
          <ProjectSwitcher entry={entry} />
        )}
        {entry.module === "claudeCode" && <RemoteLinkButton entry={entry} />}
        <WindowMenu
          entry={entry}
          onRename={claudeSession ? () => setRenaming(true) : undefined}
        />
        <Button
          variant="ghost"
          size="iconSm"
          shape="pill"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggleFullscreenWindow(entry.id)}
          title={isFullscreen ? "Exit full screen" : "Full screen"}
          className="text-white/40 hover:bg-white/10 hover:text-white/80"
        >
          {isFullscreen ? (
            <Minimize2 className="size-3" />
          ) : (
            <Maximize2 className="size-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          shape="pill"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            closeWindow(entry.id);
            clearFullscreenWindow(entry.id);
          }}
          className="text-white/40 hover:bg-white/10 hover:text-white/80"
        >
          <X className="size-3" />
        </Button>
      </WindowTitleBar>

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
