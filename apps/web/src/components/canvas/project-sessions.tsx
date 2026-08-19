import type { ProjectSchema } from "@bessel/client";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@bessel/ui/components/context-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { glassSurface } from "@bessel/ui/lib/glass";
import {
  ChevronRight,
  FolderInput,
  LayoutTemplate,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessionAgentStatus } from "@/components/canvas/canvas-agent-status";
import {
  type AgentStatus,
  sessionLabel,
  useFlashWorkspace,
  useWindowActions,
  useWindowState,
  useWorkspaceMeta,
  type WindowEntry,
  type WorkspaceMeta,
} from "@/components/canvas/window-manager";
import { WorkspaceTemplatesDialog } from "@/components/canvas/workspace-template-dialog";
import { useProjects } from "@/hooks/use-projects";
import {
  templateToWindowSpecs,
  useWorkspaceTemplates,
  widgetSummary,
} from "@/hooks/use-workspace-templates";
import { cn } from "@/lib/utils";

const ROW =
  "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md text-left text-xs font-medium transition-[background-color,color,transform] duration-150";
const ROW_ACTIVE = "bg-white/12 text-white/90";
const ROW_IDLE = "text-white/55 hover:bg-white/[0.06] hover:text-white/75";
const ICON_BUTTON =
  "flex size-5 shrink-0 items-center justify-center rounded text-white/35 transition-[background-color,color,opacity,transform] duration-150 hover:bg-white/[0.1] hover:text-white/80 active:scale-95 motion-reduce:active:scale-100";
const MENU_SURFACE = cn(
  glassSurface({ weight: "heavy" }),
  "min-w-40 border-white/10 text-white/80 shadow-2xl",
);
const MENU_ITEM = "text-white/70 focus:bg-white/10 focus:text-white/90";

const COLLAPSED_KEY = "bessel:collapsedProjects";
const NO_WINDOWS: WindowEntry[] = [];
const NO_PROJECT_LABEL = "Other";

function loadCollapsed(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(COLLAPSED_KEY) ?? "[]",
    );
    if (Array.isArray(parsed))
      return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {}
  return new Set();
}

function useCollapsedProjects() {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);
  return { collapsed, toggle };
}

function projectLocationKey(path: string, sshHost: string | null | undefined) {
  return `${sshHost ?? ""}:${path}`;
}

// One-time upgrade for canvases saved before sessions belonged to projects:
// a canvas whose project-bound widgets all point at the same known project
// is filed under it. Only the canvases present at startup are considered —
// a session the user later un-assigns or creates blank must stay that way.
function useAdoptLegacySessions(
  projects: readonly ProjectSchema[] | undefined,
) {
  const { workspaces } = useWorkspaceMeta();
  const { windowsByWorkspace } = useWindowState();
  const { setWorkspaceProject } = useWindowActions();
  const pendingRef = useRef<Set<string> | null>(
    new Set(workspaces.filter((ws) => !ws.projectId).map((ws) => ws.id)),
  );

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || !projects) return;
    pendingRef.current = null;
    const byLocation = new Map<string, string>();
    for (const p of projects)
      if (p.path) byLocation.set(projectLocationKey(p.path, p.ssh_host), p.id);
    for (const id of pending) {
      const locations = new Set<string>();
      for (const win of windowsByWorkspace.get(id) ?? NO_WINDOWS) {
        const path = win.data?.projectPath;
        if (path)
          locations.add(projectLocationKey(path, win.data?.projectSshHost));
      }
      if (locations.size !== 1) continue;
      const projectId = byLocation.get([...locations][0]);
      if (projectId) setWorkspaceProject(id, projectId);
    }
  }, [projects, windowsByWorkspace, setWorkspaceProject]);
}

function CountBadge({ count }: { count: number }) {
  if (count < 1) return null;
  return (
    <span className="shrink-0 rounded bg-white/[0.08] px-1.5 py-px font-mono text-10 tabular-nums leading-4 text-white/45">
      {count}
    </span>
  );
}

function StatusDot({ status }: { status: AgentStatus | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full transition-colors duration-300",
        status === "working" && "animate-pulse bg-amber-400",
        status === "free" && "bg-emerald-400",
        status === null && "bg-white/20",
      )}
    />
  );
}

function RenameInput({
  workspace,
  placeholder,
  onDone,
}: {
  workspace: WorkspaceMeta;
  placeholder: string;
  onDone: () => void;
}) {
  const { renameWorkspace } = useWindowActions();
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape must discard the draft, but it also blurs the input — this flag
  // keeps that blur from committing what was just cancelled.
  const cancelledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = (value: string) => {
    if (!cancelledRef.current) renameWorkspace(workspace.id, value);
    onDone();
  };

  return (
    <input
      ref={inputRef}
      defaultValue={workspace.name ?? ""}
      placeholder={placeholder}
      aria-label="Session name"
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          cancelledRef.current = true;
          e.currentTarget.blur();
        }
      }}
      className="h-5 min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-1 text-xs text-white/90 outline-none placeholder:text-white/30 focus:border-primary-500/50"
    />
  );
}

function SessionRow({
  workspace,
  windows,
  projects,
  isActive,
  isFlashing,
  canClose,
  onOpen,
}: {
  workspace: WorkspaceMeta;
  windows: WindowEntry[];
  projects: readonly ProjectSchema[];
  isActive: boolean;
  isFlashing: boolean;
  canClose: boolean;
  onOpen: (id: string) => void;
}) {
  const { removeWorkspace, setWorkspaceProject } = useWindowActions();
  const [editing, setEditing] = useState(false);
  const pendingRenameRef = useRef(false);
  const windowIds = useMemo(() => windows.map((w) => w.id), [windows]);
  const status = useSessionAgentStatus(windowIds);
  const label = sessionLabel(workspace, windows);
  const rowClass = cn(ROW, "pl-6 pr-1.5", isActive ? ROW_ACTIVE : ROW_IDLE);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {editing ? (
          // A plain row while renaming — an <input> can't live inside a <button>.
          <div className={rowClass}>
            <StatusDot status={status} />
            <RenameInput
              workspace={workspace}
              placeholder={label}
              onDone={() => setEditing(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpen(workspace.id)}
            onDoubleClick={() => setEditing(true)}
            aria-current={isActive ? "page" : undefined}
            title={label}
            className={cn(
              rowClass,
              "active:scale-[0.98] motion-reduce:active:scale-100",
              isFlashing && "animate-workspace-flash",
            )}
          >
            <StatusDot status={status} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {windows.length > 1 && <CountBadge count={windows.length} />}
          </button>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent
        className={MENU_SURFACE}
        // Start editing only once the menu has fully closed — otherwise its
        // close-time focus restore lands on the trigger and steals focus from
        // the freshly mounted rename input.
        onCloseAutoFocus={(e) => {
          if (!pendingRenameRef.current) return;
          pendingRenameRef.current = false;
          e.preventDefault();
          setEditing(true);
        }}
      >
        <ContextMenuItem
          className={MENU_ITEM}
          onSelect={() => {
            pendingRenameRef.current = true;
          }}
        >
          <Pencil className="size-3.5" />
          Rename
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className={MENU_ITEM}>
            <FolderInput className="size-3.5" />
            Move to project
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className={MENU_SURFACE}>
            {projects.map((p) => (
              <ContextMenuItem
                key={p.id}
                disabled={p.id === workspace.projectId}
                className={MENU_ITEM}
                onSelect={() => setWorkspaceProject(workspace.id, p.id)}
              >
                {p.name}
              </ContextMenuItem>
            ))}
            {projects.length > 0 && <ContextMenuSeparator />}
            <ContextMenuItem
              disabled={!workspace.projectId}
              className={MENU_ITEM}
              onSelect={() => setWorkspaceProject(workspace.id, null)}
            >
              No project
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem
          disabled={!canClose}
          className="text-red-400/80 focus:bg-white/10 focus:text-red-400"
          onSelect={() => removeWorkspace(workspace.id)}
        >
          <X className="size-3.5 text-red-400/80" />
          Close
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ProjectGroup({
  id,
  name,
  sessions,
  windowsByWorkspace,
  projects,
  activeWorkspaceId,
  flash,
  collapsed,
  onToggle,
  onNewSession,
  newSessionHint,
  canClose,
  onOpen,
}: {
  id: string;
  name: string;
  sessions: WorkspaceMeta[];
  windowsByWorkspace: ReadonlyMap<string, WindowEntry[]>;
  projects: readonly ProjectSchema[];
  activeWorkspaceId: string | null;
  flash: { id: string; seq: number } | null;
  collapsed: boolean;
  onToggle: (id: string) => void;
  /** Absent when a session can't be started here (project not configured on this device). */
  onNewSession?: () => void;
  newSessionHint?: string;
  canClose: boolean;
  onOpen: (id: string) => void;
}) {
  const hasSessions = sessions.length > 0;
  const expanded = hasSessions && !collapsed;
  const totalWindows = sessions.reduce(
    (sum, ws) => sum + (windowsByWorkspace.get(ws.id)?.length ?? 0),
    0,
  );
  const containsActive = sessions.some((ws) => ws.id === activeWorkspaceId);

  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={cn(
          "group",
          ROW,
          "pr-1",
          containsActive && collapsed ? "text-white/80" : "text-white/65",
          "hover:bg-white/[0.06] hover:text-white/85",
        )}
      >
        <button
          type="button"
          // A project with nothing open yet has nothing to expand — clicking
          // it goes straight to starting its first session.
          onClick={() => (hasSessions ? onToggle(id) : onNewSession?.())}
          aria-expanded={hasSessions ? expanded : undefined}
          title={newSessionHint ?? name}
          className="flex h-full min-w-0 flex-1 items-center gap-1 pl-1 text-left"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 transition-[transform,color] duration-150",
              hasSessions ? "text-white/35" : "text-transparent",
              expanded && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <CountBadge count={totalWindows} />
        </button>
        {onNewSession && (
          <button
            type="button"
            onClick={onNewSession}
            title={`New session in ${name}`}
            aria-label={`New session in ${name}`}
            className={cn(
              ICON_BUTTON,
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <Plus className="size-3" />
          </button>
        )}
      </div>
      {expanded && (
        <div className="flex flex-col gap-0.5">
          {sessions.map((ws) => (
            <SessionRow
              // Remounting on each move restarts the flash animation even
              // when the same row is the target twice in a row.
              key={flash?.id === ws.id ? `${ws.id}-flash-${flash.seq}` : ws.id}
              workspace={ws}
              windows={windowsByWorkspace.get(ws.id) ?? NO_WINDOWS}
              projects={projects}
              isActive={ws.id === activeWorkspaceId}
              isFlashing={flash?.id === ws.id}
              canClose={canClose}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Header "+": the generic entry points that don't belong to one project — a
// "New session" page with the project still to pick, a blank canvas, and the
// saved templates.
function NewSessionMenu({
  onNewSession,
  onBlankSession,
  onOpenCanvas,
}: {
  onNewSession: () => void;
  onBlankSession: () => void;
  onOpenCanvas: () => void;
}) {
  const { templates } = useWorkspaceTemplates();
  const { applyTemplate } = useWindowActions();
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="New session"
            aria-label="New session"
            className={ICON_BUTTON}
          >
            <Plus className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className={cn(
            glassSurface({ weight: "heavy" }),
            "w-56 overflow-hidden rounded-xl border-white/10 p-0 shadow-2xl",
          )}
        >
          <button
            type="button"
            onClick={() => {
              onNewSession();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white/95"
          >
            <Plus className="size-3.5 shrink-0" />
            New session…
          </button>
          <button
            type="button"
            onClick={() => {
              onBlankSession();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-white/[0.06] px-3 py-2.5 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white/90"
          >
            <LayoutTemplate className="size-3.5 shrink-0" />
            Blank session
          </button>

          {templates.length > 0 && (
            <div className="max-h-48 overflow-y-auto border-t border-white/[0.06]">
              {templates.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => {
                    applyTemplate(templateToWindowSpecs(t), "new");
                    onOpenCanvas();
                    setOpen(false);
                  }}
                  className="flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <span className="text-sm text-white/80">{t.name}</span>
                  <span className="truncate text-11 text-white/50">
                    {widgetSummary(t.widgets)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setManageOpen(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-white/[0.06] px-3 py-2.5 text-left text-xs font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white/70"
          >
            <LayoutTemplate className="size-3.5 shrink-0" />
            Manage templates…
          </button>
        </PopoverContent>
      </Popover>
      <WorkspaceTemplatesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </>
  );
}

/**
 * The sidebar's project tree: every project from the API with its sessions
 * (canvases) nested under it, plus an "Other" group for sessions that belong
 * to no project. Clicking a session switches to it and brings the canvas on
 * screen; each project's hover "+" opens the New session page for it.
 */
export function ProjectSessions({
  isOnCanvasPage,
  onOpenCanvas,
  onNewSession,
}: {
  isOnCanvasPage: boolean;
  onOpenCanvas: () => void;
  onNewSession: (projectId: string | null) => void;
}) {
  const { data: projects } = useProjects();
  const { workspaces, activeWorkspaceId } = useWorkspaceMeta();
  const { windowsByWorkspace } = useWindowState();
  const { switchWorkspace, addWorkspace } = useWindowActions();
  const flash = useFlashWorkspace();
  const { collapsed, toggle } = useCollapsedProjects();
  useAdoptLegacySessions(projects);

  const projectList = projects ?? [];
  const { byProject, unassigned } = useMemo(() => {
    const known = new Set(projectList.map((p) => p.id));
    const byProject = new Map<string, WorkspaceMeta[]>();
    const unassigned: WorkspaceMeta[] = [];
    for (const ws of workspaces) {
      if (ws.projectId && known.has(ws.projectId)) {
        const list = byProject.get(ws.projectId);
        if (list) list.push(ws);
        else byProject.set(ws.projectId, [ws]);
      } else {
        unassigned.push(ws);
      }
    }
    return { byProject, unassigned };
  }, [projectList, workspaces]);

  const openSession = useCallback(
    (id: string) => {
      switchWorkspace(id);
      onOpenCanvas();
    },
    [switchWorkspace, onOpenCanvas],
  );

  // A session only reads as "active" while its windows are actually on
  // screen — elsewhere, the canvas is just mounted in the background to keep
  // live widgets running, not being viewed.
  const shownActiveId = isOnCanvasPage ? activeWorkspaceId : null;
  const canClose = workspaces.length > 1;

  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex h-5 items-center justify-between pl-2 pr-1">
        <span className="text-xs font-medium text-white/40">Projects</span>
        <NewSessionMenu
          onNewSession={() => onNewSession(null)}
          onBlankSession={() => {
            addWorkspace();
            onOpenCanvas();
          }}
          onOpenCanvas={onOpenCanvas}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        {projectList.map((p) => (
          <ProjectGroup
            key={p.id}
            id={p.id}
            name={p.name}
            sessions={byProject.get(p.id) ?? []}
            windowsByWorkspace={windowsByWorkspace}
            projects={projectList}
            activeWorkspaceId={shownActiveId}
            flash={flash}
            collapsed={collapsed.has(p.id)}
            onToggle={toggle}
            onNewSession={p.path ? () => onNewSession(p.id) : undefined}
            newSessionHint={
              p.path ? undefined : `${p.name} — not configured on this device`
            }
            canClose={canClose}
            onOpen={openSession}
          />
        ))}
        {unassigned.length > 0 && (
          <ProjectGroup
            id="__other"
            name={NO_PROJECT_LABEL}
            sessions={unassigned}
            windowsByWorkspace={windowsByWorkspace}
            projects={projectList}
            activeWorkspaceId={shownActiveId}
            flash={flash}
            collapsed={collapsed.has("__other")}
            onToggle={toggle}
            onNewSession={() => onNewSession(null)}
            canClose={canClose}
            onOpen={openSession}
          />
        )}
        {projectList.length === 0 && unassigned.length === 0 && (
          <p className="px-2 py-1 text-11 text-white/35">
            No projects yet — add one from the top bar.
          </p>
        )}
      </div>
    </div>
  );
}
