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
  AppWindow,
  ChevronRight,
  FolderInput,
  FolderPlus,
  LayoutTemplate,
  Pencil,
  Plus,
  Power,
  Smartphone,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSessionAgentStatus } from "@/components/canvas/canvas-agent-status";
import {
  sessionLabel,
  useFlashWorkspace,
  useWindowActions,
  useWindowState,
  useWorkspaceMeta,
  type WindowEntry,
  type WorkspaceMeta,
} from "@/components/canvas/window-manager";
import { WorkspaceTemplatesDialog } from "@/components/canvas/workspace-template-dialog";
import {
  isLive,
  STATUS_LABEL,
  toAgentStatus,
  useClaudeSessions,
} from "@/components/claude-sessions/claude-sessions-store";
import type { ClaudeSessionView } from "@/components/claude-sessions/claude-sessions-types";
import { RemoteLinkPopover } from "@/components/claude-sessions/remote-link-popover";
import { StatusDot } from "@/components/claude-sessions/status-dot";
import { useEndClaudeSession } from "@/components/claude-sessions/use-end-session";
import {
  useAttachedSessionKeys,
  useOpenClaudeSession,
} from "@/components/claude-sessions/use-open-claude-session";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { useProjectMutations } from "@/hooks/use-project-mutations";
import { useProjects } from "@/hooks/use-projects";
import { client } from "@/lib/client";
import { userStorage } from "@/lib/user-storage";
import { cn } from "@/lib/utils";
import type { ProjectWithPath } from "./project-picker-menu";
import { ProjectQuickStart } from "./project-quick-start";

const ROW =
  "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md text-left text-xs font-medium transition-[background-color,color] duration-150";
const ROW_ACTIVE = "bg-white/12 text-white/90";
const ROW_IDLE = "text-white/55 hover:bg-white/[0.06] hover:text-white/75";
const ICON_BUTTON =
  "flex size-5 shrink-0 items-center justify-center rounded text-white/35 transition-[background-color,color,opacity] duration-150 hover:bg-white/[0.1] hover:text-white/80";
const MENU_SURFACE = "bg-popover min-w-44";

const COLLAPSED_KEY = "bessel:collapsedProjects";
const NO_WINDOWS: WindowEntry[] = [];
const NO_BACKGROUND: ClaudeSessionView[] = [];
const NO_PROJECT_LABEL = "No project";

function loadCollapsed(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(
      userStorage.getItem(COLLAPSED_KEY) ?? "[]",
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
      userStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
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
    <span
      title={`${count} ${count === 1 ? "widget" : "widgets"}`}
      className="shrink-0 rounded bg-white/[0.08] px-1.5 py-px font-mono text-10 tabular-nums leading-4 text-white/45"
    >
      {count}
    </span>
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
  const rowClass = cn(
    ROW,
    "gap-2 pl-7.5 pr-1.5",
    isActive ? ROW_ACTIVE : ROW_IDLE,
  );

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
            className={cn(rowClass, isFlashing && "animate-workspace-flash")}
          >
            <StatusDot status={status} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <CountBadge count={windows.length} />
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
          onSelect={() => {
            pendingRenameRef.current = true;
          }}
        >
          <Pencil className="size-3.5" />
          Rename
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderInput className="size-3.5" />
            Move to project
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className={MENU_SURFACE}>
            {projects.map((p) => (
              <ContextMenuItem
                key={p.id}
                disabled={p.id === workspace.projectId}
                onSelect={() => setWorkspaceProject(workspace.id, p.id)}
              >
                {p.name}
              </ContextMenuItem>
            ))}
            {projects.length > 0 && <ContextMenuSeparator />}
            <ContextMenuItem
              disabled={!workspace.projectId}
              onSelect={() => setWorkspaceProject(workspace.id, null)}
            >
              No project
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem
          variant="destructive"
          disabled={!canClose}
          onSelect={() => removeWorkspace(workspace.id)}
        >
          <X className="size-3.5" />
          Close
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// A Claude session running in the background with no window showing it.
// Dimmer than a canvas session: it's there, but not open.
function BackgroundSessionRow({
  session,
  onOpen,
  onEnd,
}: {
  session: ClaudeSessionView;
  onOpen: (session: ClaudeSessionView) => void;
  onEnd: (session: ClaudeSessionView) => void;
}) {
  const status = toAgentStatus(session.status);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group/bg",
            ROW,
            "gap-1 pl-7.5 pr-1",
            "text-white/45 hover:bg-white/[0.06] hover:text-white/75",
          )}
        >
          <button
            type="button"
            onClick={() => onOpen(session)}
            title={`${session.name} - ${STATUS_LABEL[session.status]}, running in the background`}
            className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
          >
            <StatusDot status={status} />
            <span className="min-w-0 flex-1 truncate">{session.name}</span>
          </button>
          {/* Out of the layout until needed, so the name gets the full width. */}
          <div className="hidden shrink-0 items-center group-focus-within/bg:flex group-hover/bg:flex has-[[data-state=open]]:flex">
            <RemoteLinkPopover sessionKey={session.key}>
              <button
                type="button"
                title="Open on phone"
                aria-label={`Open ${session.name} on phone`}
                className={ICON_BUTTON}
              >
                <Smartphone className="size-3" />
              </button>
            </RemoteLinkPopover>
            <button
              type="button"
              onClick={() => onEnd(session)}
              title="End session"
              aria-label={`End ${session.name}`}
              className={ICON_BUTTON}
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className={MENU_SURFACE}>
        <ContextMenuItem onSelect={() => onOpen(session)}>
          <AppWindow className="size-3.5" />
          Open
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={() => onEnd(session)}>
          <Power className="size-3.5" />
          End session
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ProjectGroup({
  id,
  name,
  sessions,
  background,
  windowsByWorkspace,
  projects,
  activeWorkspaceId,
  flash,
  collapsed,
  onToggle,
  quickStartProject,
  onMoreOptions,
  onSetFolder,
  autoOpenQuickStart,
  onAutoOpened,
  onShowCanvas,
  canClose,
  onOpen,
  onOpenBackground,
  onEndBackground,
}: {
  id: string;
  name: string;
  sessions: WorkspaceMeta[];
  background: ClaudeSessionView[];
  windowsByWorkspace: ReadonlyMap<string, WindowEntry[]>;
  projects: readonly ProjectSchema[];
  activeWorkspaceId: string | null;
  flash: { id: string; seq: number } | null;
  collapsed: boolean;
  onToggle: (id: string) => void;
  /** A project usable on this device: "+" offers its quick-start menu. */
  quickStartProject?: ProjectWithPath;
  /** The full New session page — the "+" itself where there's no quick start. */
  onMoreOptions?: () => void;
  /** A project with no folder on this device yet. */
  onSetFolder?: () => void;
  /** Open the quick-start menu right away (a project that was just added). */
  autoOpenQuickStart?: boolean;
  onAutoOpened?: () => void;
  onShowCanvas: () => void;
  canClose: boolean;
  onOpen: (id: string) => void;
  onOpenBackground: (session: ClaudeSessionView) => void;
  onEndBackground: (session: ClaudeSessionView) => void;
}) {
  const hasSessions = sessions.length + background.length > 0;
  const expanded = hasSessions && !collapsed;
  const totalWindows = sessions.reduce(
    (sum, ws) => sum + (windowsByWorkspace.get(ws.id)?.length ?? 0),
    0,
  );
  const containsActive = sessions.some((ws) => ws.id === activeWorkspaceId);
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const unconfigured = onSetFolder !== undefined;

  useEffect(() => {
    if (!autoOpenQuickStart || !quickStartProject) return;
    setQuickStartOpen(true);
    onAutoOpened?.();
  }, [autoOpenQuickStart, quickStartProject, onAutoOpened]);

  const start = quickStartProject
    ? () => setQuickStartOpen(true)
    : (onMoreOptions ?? onSetFolder);
  const startLabel = quickStartProject
    ? `Start something in ${name}`
    : unconfigured
      ? `Set ${name}'s folder on this device`
      : "New session";

  const header = (
    <div
      className={cn(
        "group",
        ROW,
        "pr-1",
        unconfigured
          ? "text-white/35"
          : containsActive && collapsed
            ? "text-white/80"
            : "text-white/65",
        "hover:bg-white/[0.06] hover:text-white/85",
        quickStartOpen && "bg-white/[0.06] text-white/85",
      )}
    >
      <button
        type="button"
        // A project with nothing open yet has nothing to expand — clicking
        // it goes straight to starting something there.
        onClick={() => (hasSessions ? onToggle(id) : start?.())}
        aria-expanded={hasSessions ? expanded : undefined}
        title={hasSessions ? name : startLabel}
        className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2 text-left"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-[transform,color] duration-150",
            hasSessions ? "text-white/35" : "text-transparent",
            expanded && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <CountBadge count={totalWindows} />
      </button>
      {start && (
        <button
          type="button"
          onClick={start}
          title={startLabel}
          aria-label={startLabel}
          className={cn(
            ICON_BUTTON,
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            quickStartOpen && "opacity-100",
          )}
        >
          {unconfigured ? (
            <FolderPlus className="size-3" />
          ) : (
            <Plus className="size-3" />
          )}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-0.5">
      {quickStartProject ? (
        <ProjectQuickStart
          project={quickStartProject}
          open={quickStartOpen}
          onOpenChange={setQuickStartOpen}
          onShowCanvas={onShowCanvas}
          onMoreOptions={() => onMoreOptions?.()}
        >
          {header}
        </ProjectQuickStart>
      ) : (
        header
      )}
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
          {background.map((session) => (
            <BackgroundSessionRow
              key={session.key}
              session={session}
              onOpen={onOpenBackground}
              onEnd={onEndBackground}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Header actions: saved canvas templates (applied from a project's quick
// start) and adding a project.
function HeaderActions({
  newProjectOpen,
  onNewProjectOpenChange,
  onProjectCreated,
}: {
  newProjectOpen: boolean;
  onNewProjectOpenChange: (open: boolean) => void;
  onProjectCreated: (project: ProjectSchema) => void;
}) {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => setTemplatesOpen(true)}
        title="Templates"
        aria-label="Templates"
        className={cn(
          ICON_BUTTON,
          "opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100",
        )}
      >
        <LayoutTemplate className="size-3" />
      </button>
      <button
        type="button"
        onClick={() => onNewProjectOpenChange(true)}
        title="New project"
        aria-label="New project"
        className={ICON_BUTTON}
      >
        <Plus className="size-3" />
      </button>
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={onNewProjectOpenChange}
        onCreated={onProjectCreated}
      />
      <WorkspaceTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
      />
    </div>
  );
}

function FirstProjectCard({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-1 mt-1 flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-medium text-white/80">
        Add your first project
      </p>
      <p className="text-11 leading-relaxed text-white/45">
        Pick a folder you work in. Bessel opens Claude, terminals and git there.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="flex h-7 w-fit items-center gap-1.5 rounded-md bg-primary-500 px-2.5 text-xs font-medium text-white transition-[background-color] duration-150 hover:bg-primary-400"
      >
        <Plus className="size-3" />
        Add project
      </button>
    </div>
  );
}

/**
 * The sidebar's project tree: every project from the API with its sessions
 * (canvases) nested under it, plus a "No project" group for sessions that
 * belong to none. Clicking a session switches to it and brings the canvas on
 * screen; a project's "+" (or clicking one with nothing open) offers its
 * quick-start menu.
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
  const { switchWorkspace } = useWindowActions();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [quickStartFor, setQuickStartFor] = useState<string | null>(null);
  const clearQuickStartFor = useCallback(() => setQuickStartFor(null), []);
  const { setLocation } = useProjectMutations();

  const setFolder = async (project: ProjectSchema) => {
    const path = await window.electron?.selectFolder();
    if (!path) return;
    setLocation.mutate(
      {
        client,
        path: { project_id: project.id },
        body: { path, ssh_host: null },
      },
      {
        onSuccess: () => setQuickStartFor(project.id),
        onError: () => toast.error(`Couldn't set ${project.name}'s folder`),
      },
    );
  };
  const flash = useFlashWorkspace();
  const { collapsed, toggle } = useCollapsedProjects();
  useAdoptLegacySessions(projects);
  const { sessions: claudeSessions } = useClaudeSessions();
  const attachedKeys = useAttachedSessionKeys();
  const openBackground = useOpenClaudeSession(onOpenCanvas);
  const { requestEnd, endDialog } = useEndClaudeSession();

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

  const { backgroundByProject, backgroundUnassigned } = useMemo(() => {
    const byPath = new Map<string, string>();
    for (const p of projectList)
      if (p.path && !p.ssh_host) byPath.set(p.path, p.id);
    const known = new Set(projectList.map((p) => p.id));
    const backgroundByProject = new Map<string, ClaudeSessionView[]>();
    const backgroundUnassigned: ClaudeSessionView[] = [];
    for (const session of claudeSessions) {
      if (!isLive(session.status) || attachedKeys.has(session.key)) continue;
      const projectId =
        session.projectId && known.has(session.projectId)
          ? session.projectId
          : byPath.get(session.cwd);
      if (!projectId) {
        backgroundUnassigned.push(session);
        continue;
      }
      const list = backgroundByProject.get(projectId);
      if (list) list.push(session);
      else backgroundByProject.set(projectId, [session]);
    }
    return { backgroundByProject, backgroundUnassigned };
  }, [projectList, claudeSessions, attachedKeys]);

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
      <div className="group/header mb-0.5 flex h-7 items-center justify-between pl-2 pr-1">
        <span className="text-xs font-medium text-white/40">Projects</span>
        <HeaderActions
          newProjectOpen={newProjectOpen}
          onNewProjectOpenChange={setNewProjectOpen}
          onProjectCreated={(project) => setQuickStartFor(project.id)}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        {projectList.map((p) => (
          <ProjectGroup
            key={p.id}
            id={p.id}
            name={p.name}
            sessions={byProject.get(p.id) ?? []}
            background={backgroundByProject.get(p.id) ?? NO_BACKGROUND}
            windowsByWorkspace={windowsByWorkspace}
            projects={projectList}
            activeWorkspaceId={shownActiveId}
            flash={flash}
            collapsed={collapsed.has(p.id)}
            onToggle={toggle}
            quickStartProject={p.path ? { ...p, path: p.path } : undefined}
            onMoreOptions={() => onNewSession(p.id)}
            onSetFolder={p.path ? undefined : () => void setFolder(p)}
            autoOpenQuickStart={quickStartFor === p.id}
            onAutoOpened={clearQuickStartFor}
            onShowCanvas={onOpenCanvas}
            canClose={canClose}
            onOpen={openSession}
            onOpenBackground={openBackground}
            onEndBackground={requestEnd}
          />
        ))}
        {unassigned.length + backgroundUnassigned.length > 0 && (
          <ProjectGroup
            id="__other"
            name={NO_PROJECT_LABEL}
            sessions={unassigned}
            background={backgroundUnassigned}
            windowsByWorkspace={windowsByWorkspace}
            projects={projectList}
            activeWorkspaceId={shownActiveId}
            flash={flash}
            collapsed={collapsed.has("__other")}
            onToggle={toggle}
            onMoreOptions={() => onNewSession(null)}
            onShowCanvas={onOpenCanvas}
            canClose={canClose}
            onOpen={openSession}
            onOpenBackground={openBackground}
            onEndBackground={requestEnd}
          />
        )}
        {projectList.length === 0 && (
          <FirstProjectCard onAdd={() => setNewProjectOpen(true)} />
        )}
      </div>
      {endDialog}
    </div>
  );
}
