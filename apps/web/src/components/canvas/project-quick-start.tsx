import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import {
  History,
  LayoutTemplate,
  MoonStar,
  SlidersHorizontal,
  SquareDashed,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  claudeSessionsApi,
  isLive,
  isUntrustedWorkspaceError,
  useClaudeSessions,
} from "@/components/claude-sessions/claude-sessions-store";
import type { ClaudeConversation } from "@/components/claude-sessions/claude-sessions-types";
import { useOpenClaudeSession } from "@/components/claude-sessions/use-open-claude-session";
import {
  templateToWindowSpecs,
  useWorkspaceTemplates,
  widgetSummary,
} from "@/hooks/use-workspace-templates";
import { isDesktop } from "@/lib/environment";
import { MODULE_REGISTRY, moduleSupportsProject } from "./module-registry";
import type { ProjectWithPath } from "./project-picker-menu";
import {
  type ModuleKey,
  useWindowActions,
  type WindowSpec,
} from "./window-manager";

const RECENT_CONVERSATIONS = 5;
const MAX_RESUMED_NAME = 48;
const OTHER_AGENTS = ["codex", "grok", "terminal"] as const;

function shortenPath(path: string): string {
  return path.replace(/^\/(?:home|Users)\/[^/]+(?=\/|$)/, "~");
}

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

function projectData(project: ProjectWithPath): Record<string, string> {
  return {
    projectPath: project.path,
    projectName: project.name,
    ...(project.ssh_host ? { projectSshHost: project.ssh_host } : {}),
  };
}

function ModuleIcon({ module }: { module: ModuleKey }) {
  const Icon = MODULE_REGISTRY[module].icon;
  return <Icon className="size-3.5" />;
}

function ConversationsSubmenu({
  project,
  onResume,
  onMoreOptions,
}: {
  project: ProjectWithPath;
  onResume: (conversation: ClaudeConversation) => void;
  onMoreOptions: () => void;
}) {
  const [conversations, setConversations] = useState<
    ClaudeConversation[] | null
  >(null);
  const { sessions } = useClaudeSessions();

  const load = () => {
    claudeSessionsApi()
      .conversations(project.path)
      .catch((): ClaudeConversation[] => [])
      .then((items) => setConversations(items.slice(0, RECENT_CONVERSATIONS)));
  };

  return (
    <DropdownMenuSub onOpenChange={(open) => open && load()}>
      <DropdownMenuSubTrigger>
        <History className="size-3.5" />
        Continue a conversation
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        {conversations === null ? (
          <p className="px-2.5 py-1.5 text-xs text-white/40">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="px-2.5 py-1.5 text-xs text-white/40">
            No conversations yet
          </p>
        ) : (
          conversations.map((c) => {
            const running = sessions.some(
              (s) =>
                isLive(s.status) && s.conversationIds.includes(c.sessionId),
            );
            return (
              <DropdownMenuItem key={c.sessionId} onSelect={() => onResume(c)}>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {running ? (
                  <span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-px text-10 font-medium text-emerald-300">
                    Running
                  </span>
                ) : (
                  <span className="shrink-0 text-11 tabular-nums text-white/35">
                    {timeAgo(c.updatedAt)}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onMoreOptions}>
          All conversations…
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * What a project's "+" offers: the common starts one keystroke away (Enter
 * starts Claude), everything else behind "More options…".
 */
export function ProjectQuickStart({
  project,
  open,
  onOpenChange,
  children,
  onShowCanvas,
  onMoreOptions,
}: {
  project: ProjectWithPath;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element the menu anchors to; it doesn't open the menu itself. */
  children: ReactNode;
  onShowCanvas: () => void;
  /** Opens the full New session page for this project. */
  onMoreOptions: () => void;
}) {
  const { createSession } = useWindowActions();
  const { templates } = useWorkspaceTemplates();
  const { sessions } = useClaudeSessions();
  const openClaudeSession = useOpenClaudeSession(onShowCanvas);
  const contentRef = useRef<HTMLDivElement>(null);
  const isLocal = !project.ssh_host;
  const data = projectData(project);

  const close = () => onOpenChange(false);

  // Opened from the row rather than its trigger, Radix focuses the menu
  // itself; put focus on the first item so Enter starts Claude.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      contentRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const startClaude = (resume?: ClaudeConversation) => {
    const name = resume
      ? resume.title.slice(0, MAX_RESUMED_NAME)
      : project.name;
    createSession({
      projectId: project.id,
      name,
      closeWhenEmpty: true,
      specs: [
        {
          module: "claudeCode",
          data: {
            ...data,
            claudeSessionName: name,
            ...(resume ? { claudeSessionId: resume.sessionId } : {}),
          },
        },
      ],
    });
    onShowCanvas();
  };

  const resumeConversation = (conversation: ClaudeConversation) => {
    const running = sessions.find(
      (s) =>
        isLive(s.status) && s.conversationIds.includes(conversation.sessionId),
    );
    if (running) openClaudeSession(running);
    else startClaude(conversation);
  };

  const startInBackground = () => {
    claudeSessionsApi()
      .create({ cwd: project.path, name: project.name, projectId: project.id })
      .then((view) => toast.success(`Started “${view.name}” in the background`))
      .catch((err: unknown) =>
        toast.error(
          isUntrustedWorkspaceError(err)
            ? `Run \`claude\` once in ${project.path} and accept the trust prompt first.`
            : "Couldn't start Claude in the background",
        ),
      );
  };

  const openModule = (module: (typeof OTHER_AGENTS)[number]) => {
    createSession({
      projectId: project.id,
      closeWhenEmpty: true,
      specs: [{ module, data: { ...data } }],
    });
    onShowCanvas();
  };

  const applyTemplate = (specs: WindowSpec[]) => {
    createSession({
      projectId: project.id,
      specs: specs.map((spec) =>
        moduleSupportsProject(spec.module)
          ? { ...spec, data: { ...spec.data, ...data } }
          : spec,
      ),
    });
    onShowCanvas();
  };

  const emptySession = () => {
    createSession({ projectId: project.id, specs: [] });
    onShowCanvas();
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      {/* Disabled: the anchor's own clicks belong to the row; the menu is
          opened by the parent through `open`. */}
      <DropdownMenuTrigger asChild disabled>
        <div>{children}</div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={contentRef}
        side="right"
        align="start"
        sideOffset={8}
        className="w-60 overflow-hidden rounded-xl border-white/10 bg-popover p-0 shadow-2xl"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-white/[0.06] px-3 py-2">
          <p className="truncate text-xs font-medium text-white/80">
            {project.name}
          </p>
          <p className="truncate text-11 text-white/40">
            {project.ssh_host
              ? `${project.ssh_host}:${project.path}`
              : shortenPath(project.path)}
          </p>
        </div>
        <div className="p-1.5">
          {isDesktop && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  close();
                  startClaude();
                }}
              >
                <ModuleIcon module="claudeCode" />
                Claude
                <DropdownMenuShortcut>⏎</DropdownMenuShortcut>
              </DropdownMenuItem>
              {isLocal && (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      close();
                      startInBackground();
                    }}
                  >
                    <MoonStar className="size-3.5" />
                    Claude in background
                  </DropdownMenuItem>
                  <ConversationsSubmenu
                    project={project}
                    onResume={(c) => {
                      close();
                      resumeConversation(c);
                    }}
                    onMoreOptions={() => {
                      close();
                      onMoreOptions();
                    }}
                  />
                </>
              )}
              <DropdownMenuSeparator />
              {OTHER_AGENTS.map((module) => (
                <DropdownMenuItem
                  key={module}
                  onSelect={() => {
                    close();
                    openModule(module);
                  }}
                >
                  <ModuleIcon module={module} />
                  {MODULE_REGISTRY[module].title}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          {templates.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LayoutTemplate className="size-3.5" />
                Templates
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {templates.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onSelect={() => {
                      close();
                      applyTemplate(templateToWindowSpecs(t));
                    }}
                    className="flex-col items-start gap-0"
                  >
                    <span className="w-full truncate">{t.name}</span>
                    <span className="w-full truncate text-11 text-white/40">
                      {widgetSummary(t.widgets)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuItem
            onSelect={() => {
              close();
              emptySession();
            }}
          >
            <SquareDashed className="size-3.5" />
            Empty session
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              close();
              onMoreOptions();
            }}
          >
            <SlidersHorizontal className="size-3.5" />
            More options…
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
