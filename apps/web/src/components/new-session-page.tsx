import { glassSurface } from "@bessel/ui/lib/glass";
import { ArrowLeft, Check, ChevronRight, Play } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { tileEvenly } from "@/components/canvas/layout-engine";
import { MODULE_REGISTRY } from "@/components/canvas/module-registry";
import {
  type ProjectWithPath,
  useProjectsWithPath,
} from "@/components/canvas/project-picker-menu";
import {
  GRID_COLS,
  type ModuleKey,
  useWindowActions,
  type WindowSpec,
} from "@/components/canvas/window-manager";
import {
  claudeSessionsApi,
  isLive,
  isUntrustedWorkspaceError,
  useClaudeSessions,
} from "@/components/claude-sessions/claude-sessions-store";
import type { ClaudeConversation } from "@/components/claude-sessions/claude-sessions-types";
import { useShowCanvas } from "@/components/claude-sessions/show-canvas-context";
import { useOpenClaudeSession } from "@/components/claude-sessions/use-open-claude-session";
import { isDesktop } from "@/lib/environment";
import { cn } from "@/lib/utils";

type AgentModule = Extract<ModuleKey, "claudeCode" | "codex" | "grok">;
const AGENTS: AgentModule[] = ["claudeCode", "codex", "grok"];
const COUNTS = [1, 2, 3, 4] as const;
type Count = (typeof COUNTS)[number];
type RunMode = "open" | "background";
const NEW_CONVERSATION = "";
const MAX_RESUMED_NAME = 48;

function timeAgo(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

// Aspect of the little layout preview — roughly a widescreen canvas in grid
// cells, so the tiles look like what will actually open.
const PREVIEW_ROWS = 12;

// Options are real radio inputs (native arrow-key navigation, form semantics)
// visually hidden behind a styled label that reacts through the `peer` state.
const OPTION =
  "flex cursor-pointer select-none rounded-lg border border-white/10 bg-white/[0.03] text-white/65 transition-[background-color,border-color,color] duration-150 hover:border-white/20 hover:bg-white/[0.06] hover:text-white/85 peer-checked:border-primary-500/70 peer-checked:bg-primary-500/15 peer-checked:text-white/95 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/60";

function RadioOption({
  name,
  value,
  checked,
  disabled,
  onSelect,
  className,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  className: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="relative">
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          OPTION,
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-35",
          className,
        )}
      >
        {children}
      </label>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-11 font-medium text-white/40">{label}</span>
        {hint && <span className="text-11 text-white/35">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ProjectOption({
  name,
  value,
  label,
  sublabel,
  selected,
  onSelect,
}: {
  name: string;
  value: string;
  label: string;
  sublabel?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const id = useId();
  return (
    <div className="relative">
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-white/70 transition-colors hover:bg-white/5 peer-checked:bg-white/10 peer-checked:text-white/95 peer-focus-visible:bg-white/5 peer-checked:[&>svg]:opacity-100"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{label}</span>
          {sublabel && (
            <span className="block truncate text-11 text-white/45">
              {sublabel}
            </span>
          )}
        </span>
        <Check className="size-3.5 shrink-0 text-primary-400 opacity-0 transition-opacity" />
      </label>
    </div>
  );
}

function LayoutPreview({ count, agent }: { count: Count; agent: AgentModule }) {
  const tiles = useMemo(
    () => tileEvenly(count, GRID_COLS, PREVIEW_ROWS),
    [count],
  );
  const Icon = MODULE_REGISTRY[agent].icon;
  return (
    <div
      aria-hidden
      className="relative aspect-2/1 w-full overflow-hidden rounded-lg border border-white/10 bg-black/30"
    >
      {tiles.map((t) => (
        <div
          key={`${t.x},${t.y}`}
          className="absolute flex items-center justify-center rounded-md border border-white/15 bg-white/[0.07] transition-[inset] duration-300 ease-out"
          style={{
            left: `calc(${(t.x / GRID_COLS) * 100}% + 4px)`,
            top: `calc(${(t.y / PREVIEW_ROWS) * 100}% + 4px)`,
            width: `calc(${(t.w / GRID_COLS) * 100}% - 8px)`,
            height: `calc(${(t.h / PREVIEW_ROWS) * 100}% - 8px)`,
          }}
        >
          <Icon className="size-4 text-white/50" />
        </div>
      ))}
    </div>
  );
}

function specsFor(
  agent: AgentModule,
  count: Count,
  project: ProjectWithPath | null,
  claude?: { sessionName: string; resumeSessionId?: string },
): WindowSpec[] {
  const projectData = project
    ? {
        projectPath: project.path,
        projectName: project.name,
        ...(project.ssh_host ? { projectSshHost: project.ssh_host } : {}),
      }
    : undefined;
  const data =
    agent === "claudeCode" && claude
      ? {
          ...projectData,
          claudeSessionName: claude.sessionName,
          ...(claude.resumeSessionId
            ? { claudeSessionId: claude.resumeSessionId }
            : {}),
        }
      : projectData;
  // Each window owns its data — they diverge as widgets save per-instance state.
  return Array.from({ length: count }, () => ({
    module: agent,
    data: data && { ...data },
  }));
}

function useConversations(path: string | null): ClaudeConversation[] | null {
  const [state, setState] = useState<{
    path: string;
    items: ClaudeConversation[];
  } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => claudeSessionsApi().conversations(path))
      .catch((): ClaudeConversation[] => [])
      .then((items) => {
        if (!cancelled) setState({ path, items });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return path && state?.path === path ? state.items : null;
}

function ConversationOption({
  name,
  conversation,
  running,
  selected,
  onSelect,
}: {
  name: string;
  conversation: ClaudeConversation | null;
  running: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const id = useId();
  return (
    <div className="relative">
      <input
        id={id}
        type="radio"
        name={name}
        value={conversation?.sessionId ?? NEW_CONVERSATION}
        checked={selected}
        onChange={onSelect}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-white/70 transition-colors hover:bg-white/5 peer-checked:bg-white/10 peer-checked:text-white/95 peer-focus-visible:bg-white/5 peer-checked:[&>svg]:opacity-100"
      >
        <span className="min-w-0 flex-1 truncate text-sm">
          {conversation ? conversation.title : "New conversation"}
        </span>
        {running && (
          <span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-px text-10 font-medium text-emerald-300">
            Running
          </span>
        )}
        {conversation && (
          <span className="shrink-0 text-11 tabular-nums text-white/40">
            {timeAgo(conversation.updatedAt)}
          </span>
        )}
        <Check className="size-3.5 shrink-0 text-primary-400 opacity-0 transition-opacity" />
      </label>
    </div>
  );
}

/**
 * Full-page form for starting a session: pick the project (preselected when
 * opened from a project's "+"), which agent, and how many — they open tiled
 * evenly across a fresh canvas. Claude can also continue a past conversation
 * and run in the background without opening any windows.
 */
export function NewSessionPage({
  projectId,
  onCancel,
  onCreated,
}: {
  projectId: string | null;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const projects = useProjectsWithPath();
  const { createSession } = useWindowActions();
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [agent, setAgent] = useState<AgentModule>("claudeCode");
  const [count, setCount] = useState<Count>(1);
  const [name, setName] = useState("");
  const [conversationId, setConversationId] = useState(NEW_CONVERSATION);
  const [runMode, setRunMode] = useState<RunMode>("open");
  const [starting, setStarting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const formId = useId();
  const { sessions } = useClaudeSessions();
  const openClaudeSession = useOpenClaudeSession(useShowCanvas());

  const project = projects.find((p) => p.id === selectedProjectId) ?? null;
  const agentTitle = MODULE_REGISTRY[agent].title;
  const isClaude = agent === "claudeCode";
  // Background sessions run on this machine, so not for SSH projects.
  const canBackground = isClaude && isDesktop && !project?.ssh_host;
  const conversationPath = canBackground && project ? project.path : null;
  const conversations = useConversations(conversationPath);
  const conversation =
    (conversationPath &&
      conversations?.find((c) => c.sessionId === conversationId)) ||
    null;
  const runningSession = conversation
    ? sessions.find(
        (s) =>
          s.conversationIds.includes(conversation.sessionId) &&
          isLive(s.status),
      )
    : undefined;
  const background = canBackground && runMode === "background";
  const effectiveCount: Count = conversation ? 1 : count;
  const defaultName = isClaude
    ? conversation
      ? conversation.title.slice(0, MAX_RESUMED_NAME)
      : (project?.name ?? "Claude")
    : count > 1
      ? `${agentTitle} ×${count}`
      : agentTitle;

  // A conversation belongs to the project it was picked under.
  useEffect(() => setConversationId(NEW_CONVERSATION), [selectedProjectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const startInBackground = async () => {
    setStarting(true);
    const sessionName = name.trim() || defaultName;
    try {
      for (let i = 0; i < effectiveCount; i++) {
        await claudeSessionsApi().create({
          cwd: project?.path ?? "",
          name: sessionName,
          projectId: project?.id,
          resumeSessionId: conversation?.sessionId,
        });
      }
      toast.success(
        effectiveCount > 1
          ? `Started ${effectiveCount} Claude sessions in the background`
          : `Started “${sessionName}” in the background`,
      );
      onCancel();
    } catch (err) {
      toast.error(
        isUntrustedWorkspaceError(err)
          ? `Run \`claude\` once in ${project?.path ?? "your home folder"} and accept the trust prompt first.`
          : "Couldn't start Claude in the background",
      );
    } finally {
      setStarting(false);
    }
  };

  const submit = () => {
    if (!isDesktop || starting) return;
    if (runningSession) {
      openClaudeSession(runningSession);
      return;
    }
    if (background) {
      void startInBackground();
      return;
    }
    createSession({
      projectId: project?.id,
      name,
      // Claude sessions outlive their windows; the canvas needn't.
      closeWhenEmpty: canBackground,
      specs: specsFor(
        agent,
        effectiveCount,
        project,
        isClaude
          ? {
              sessionName: name.trim() || defaultName,
              resumeSessionId: conversation?.sessionId,
            }
          : undefined,
      ),
    });
    onCreated();
  };

  const submitLabel = runningSession
    ? "Open running session"
    : conversation
      ? background
        ? "Resume in background"
        : "Resume conversation"
      : background
        ? effectiveCount > 1
          ? `Start ${effectiveCount} in background`
          : "Start in background"
        : `Open ${effectiveCount > 1 ? `${effectiveCount} × ${agentTitle}` : agentTitle}`;

  const optionsSummary = [
    background ? "In background" : null,
    effectiveCount > 1 ? `${effectiveCount} windows` : "1 window",
    name.trim() ? `“${name.trim()}”` : null,
  ]
    .filter(Boolean)
    .join(" - ");

  // No agents to spawn, so no need to gate on isDesktop like submit() does.
  const skip = () => {
    createSession({ projectId: project?.id, name, specs: [] });
    onCreated();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mx-auto flex w-full max-w-lg flex-col gap-6 py-4"
    >
      <header className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex w-fit items-center gap-1 text-xs text-white/45 transition-colors hover:text-white/75"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white/90">
            New session
          </h1>
          <p className="mt-0.5 text-xs text-white/50">
            {background
              ? "Runs on this machine without a window. Reach it from the sidebar, claude.ai or the Claude app."
              : "Opens a fresh canvas with your agents laid out side by side."}
          </p>
        </div>
      </header>

      <Field label="Project">
        <fieldset
          className={cn(
            glassSurface({ weight: "light" }),
            "max-h-56 divide-y divide-white/[0.06] overflow-y-auto rounded-lg border border-white/10",
          )}
        >
          <legend className="sr-only">Project</legend>
          {projects.map((p) => (
            <ProjectOption
              key={p.id}
              name={`${formId}-project`}
              value={p.id}
              label={p.name}
              sublabel={p.ssh_host ? `${p.ssh_host}:${p.path}` : p.path}
              selected={p.id === selectedProjectId}
              onSelect={() => setSelectedProjectId(p.id)}
            />
          ))}
          <ProjectOption
            name={`${formId}-project`}
            value=""
            label="No project"
            sublabel="Start in the home directory"
            selected={project === null}
            onSelect={() => setSelectedProjectId(null)}
          />
        </fieldset>
      </Field>

      <Field label="Agent">
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="sr-only">Agent</legend>
          {AGENTS.map((key) => {
            const { title, icon: Icon } = MODULE_REGISTRY[key];
            const selected = key === agent;
            return (
              <RadioOption
                key={key}
                name={`${formId}-agent`}
                value={key}
                checked={selected}
                onSelect={() => setAgent(key)}
                className="items-center justify-between gap-2 px-3 py-3"
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <span className="text-xs font-medium">{title}</span>
                </span>
                {selected && (
                  <Check className="size-3.5 shrink-0 text-primary-400" />
                )}
              </RadioOption>
            );
          })}
        </fieldset>
      </Field>

      {conversationPath && (
        <Field
          label="Conversation"
          hint={conversations?.length === 0 ? "None yet" : undefined}
        >
          <fieldset
            className={cn(
              glassSurface({ weight: "light" }),
              "max-h-56 divide-y divide-white/[0.06] overflow-y-auto rounded-lg border border-white/10",
            )}
          >
            <legend className="sr-only">Conversation</legend>
            <ConversationOption
              name={`${formId}-conversation`}
              conversation={null}
              running={false}
              selected={conversation === null}
              onSelect={() => setConversationId(NEW_CONVERSATION)}
            />
            {conversations?.map((c) => (
              <ConversationOption
                key={c.sessionId}
                name={`${formId}-conversation`}
                conversation={c}
                running={sessions.some(
                  (s) =>
                    s.conversationIds.includes(c.sessionId) && isLive(s.status),
                )}
                selected={c.sessionId === conversation?.sessionId}
                onSelect={() => setConversationId(c.sessionId)}
              />
            ))}
          </fieldset>
        </Field>
      )}

      <div className="flex flex-col gap-6">
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          aria-expanded={showOptions}
          className="flex w-fit items-center gap-1.5 text-11 font-medium text-white/40 transition-colors hover:text-white/70"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform duration-150",
              showOptions && "rotate-90",
            )}
          />
          Options
          {!showOptions && (
            <span className="normal-case tracking-normal text-white/30">
              {optionsSummary}
            </span>
          )}
        </button>
        {showOptions && (
          <>
            {canBackground && (
              <Field label="Run">
                <fieldset className="grid grid-cols-2 gap-2">
                  <legend className="sr-only">Run</legend>
                  {(
                    [
                      ["open", "Open now", "In a new canvas"],
                      [
                        "background",
                        "In background",
                        "No window, reach it anywhere",
                      ],
                    ] as const
                  ).map(([mode, title, description]) => (
                    <RadioOption
                      key={mode}
                      name={`${formId}-run`}
                      value={mode}
                      checked={runMode === mode}
                      onSelect={() => setRunMode(mode)}
                      className="flex-col gap-0.5 px-3 py-2.5"
                    >
                      <span className="text-xs font-medium">{title}</span>
                      <span className="text-11 text-white/45">
                        {description}
                      </span>
                    </RadioOption>
                  ))}
                </fieldset>
              </Field>
            )}

            <Field
              label="How many"
              hint={conversation ? "One per conversation" : undefined}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <fieldset className="flex gap-2">
                    <legend className="sr-only">How many</legend>
                    {COUNTS.map((n) => (
                      <RadioOption
                        key={n}
                        name={`${formId}-count`}
                        value={String(n)}
                        checked={n === effectiveCount}
                        disabled={conversation !== null && n !== 1}
                        onSelect={() => setCount(n)}
                        className="size-9 items-center justify-center font-mono text-sm tabular-nums"
                      >
                        {n}
                      </RadioOption>
                    ))}
                  </fieldset>
                  <span className="text-xs text-white/40">
                    session{effectiveCount > 1 ? "s" : ""}
                    {background ? ", in the background" : ", tiled evenly"}
                  </span>
                </div>
                {!background && (
                  <LayoutPreview count={effectiveCount} agent={agent} />
                )}
              </div>
            </Field>

            <Field label="Name" hint="Optional">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultName}
                aria-label="Session name"
                className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-primary-500/50"
              />
            </Field>
          </>
        )}
      </div>

      {!isDesktop && (
        <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200/80">
          Agent widgets require the desktop app. You can still open an empty
          session here.
        </p>
      )}

      <footer className="flex items-center justify-between gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/55 transition-colors hover:text-white/85"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={skip}
            className="rounded-lg border border-white/10 px-3.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white/90"
          >
            Empty session
          </button>
          <button
            type="submit"
            disabled={!isDesktop || starting}
            className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-primary-500/20 transition-[background-color] duration-150 hover:bg-primary-400 disabled:opacity-40"
          >
            <Play className="size-3 fill-current" />
            {submitLabel}
            {project && !conversation ? ` in ${project.name}` : ""}
          </button>
        </div>
      </footer>
    </form>
  );
}
