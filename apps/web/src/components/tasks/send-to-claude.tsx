import type { TaskSchema } from "@bessel/client";
import {
  GlassDialog,
  GlassDialogContent,
  GlassDialogDescription,
  GlassDialogTitle,
} from "@bessel/ui/components/glass-dialog";
import { Spinner } from "@bessel/ui/components/spinner";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  type ProjectWithPath,
  useProjectsWithPath,
} from "@/components/canvas/project-picker-menu";
import {
  claudeSessionsApi,
  getClaudeSessionsSnapshot,
  isRunning,
  isUntrustedWorkspaceError,
  STATUS_LABEL,
  toAgentStatus,
  useClaudeSessions,
} from "@/components/claude-sessions/claude-sessions-store";
import type { ClaudeSessionView } from "@/components/claude-sessions/claude-sessions-types";
import { useShowCanvas } from "@/components/claude-sessions/show-canvas-context";
import { StatusDot } from "@/components/claude-sessions/status-dot";
import { useOpenClaudeSession } from "@/components/claude-sessions/use-open-claude-session";
import { useTaskStatusActions } from "@/hooks/use-task-status-actions";
import { buildBatchPrompt } from "@/lib/task-batch";
import { cn } from "@/lib/utils";

const READY_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 500;

const ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-13 transition-colors duration-150";

/** Why a session can't take tasks right now, or null when it can. */
function busyReason(session: ClaudeSessionView): string | null {
  if (session.status === "idle") return null;
  if (session.status === "working") return "Working on something";
  if (session.status === "waiting") return "Waiting for your answer";
  return STATUS_LABEL[session.status];
}

/** Resolves once a freshly started session is up and can take a message. */
async function untilRunning(key: string): Promise<ClaudeSessionView> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const session = getClaudeSessionsSnapshot().sessions.find(
      (s) => s.key === key,
    );
    if (session && isRunning(session.status)) return session;
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
  throw new Error("Claude took too long to start");
}

function projectsOf(
  tasks: readonly TaskSchema[],
  projects: readonly ProjectWithPath[],
): ProjectWithPath[] {
  const names = new Set(tasks.map((t) => t.project).filter(Boolean));
  return projects.filter((p) => !p.ssh_host && names.has(p.name));
}

/**
 * Picks a free Claude session (or starts one) and sends it the selected
 * tasks; Claude moves each to In review through the Bessel tools when done.
 */
export function SendToClaudeDialog({
  open,
  onOpenChange,
  tasks,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: readonly TaskSchema[];
  onSent: () => void;
}) {
  const { sessions } = useClaudeSessions();
  const projects = useProjectsWithPath();
  const openSession = useOpenClaudeSession(useShowCanvas());
  const actions = useTaskStatusActions();
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const taskProjects = projectsOf(tasks, projects);
  const inTaskProject = (s: ClaudeSessionView) =>
    taskProjects.some((p) => p.id === s.projectId || p.path === s.cwd);
  const candidates = sessions
    .filter((s) => s.status !== "ended")
    .sort(
      (a, b) =>
        Number(inTaskProject(b)) - Number(inTaskProject(a)) ||
        Number(busyReason(a) !== null) - Number(busyReason(b) !== null) ||
        a.name.localeCompare(b.name),
    );
  const startIn =
    taskProjects.length > 0
      ? taskProjects
      : projects.filter((p) => !p.ssh_host);
  const count = tasks.length;
  const noun = count === 1 ? "task" : `${count} tasks`;

  const deliver = async (session: ClaudeSessionView) => {
    await claudeSessionsApi().send(session.key, buildBatchPrompt(tasks));
    for (const task of tasks) if (task.status === "todo") actions.start(task);
    toast.success(`Sent ${noun} to “${session.name}”`, {
      description: "Each moves to In review as Claude finishes it.",
      action: { label: "Open", onClick: () => openSession(session) },
    });
    onSent();
    onOpenChange(false);
  };

  const run = async (id: string, work: () => Promise<void>) => {
    setSendingTo(id);
    try {
      await work();
    } catch (err) {
      toast.error(
        isUntrustedWorkspaceError(err)
          ? "Run `claude` once in that folder and accept the trust prompt first."
          : err instanceof Error
            ? err.message
            : "Couldn't send the tasks",
      );
    } finally {
      setSendingTo(null);
    }
  };

  const startNew = (project: ProjectWithPath) =>
    run(`new-${project.id}`, async () => {
      const created = await claudeSessionsApi().create({
        cwd: project.path,
        name: project.name,
        projectId: project.id,
      });
      await deliver(await untilRunning(created.key));
    });

  return (
    <GlassDialog
      open={open}
      onOpenChange={(next) => !sendingTo && onOpenChange(next)}
    >
      <GlassDialogContent className="flex max-h-[80vh] w-full max-w-md flex-col gap-0 p-0">
        <div className="px-5 pt-4 pb-3">
          <GlassDialogTitle>Send {noun} to Claude</GlassDialogTitle>
          <GlassDialogDescription className="mt-1 text-13 text-white/50">
            Claude works through them one at a time and moves each to In review
            when it's done.
          </GlassDialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {candidates.length > 0 && (
            <p className="px-3 pt-1 pb-1 text-12 text-white/40">
              Your sessions
            </p>
          )}
          {candidates.map((session) => {
            const reason = busyReason(session);
            const busy = sendingTo === session.key;
            return (
              <button
                key={session.key}
                type="button"
                disabled={reason !== null || sendingTo !== null}
                onClick={() => run(session.key, () => deliver(session))}
                className={cn(
                  ROW,
                  reason === null
                    ? "text-white/85 hover:bg-white/[0.06]"
                    : "cursor-not-allowed text-white/40",
                )}
              >
                <StatusDot status={toAgentStatus(session.status)} />
                <span className="min-w-0 flex-1 truncate">{session.name}</span>
                {busy ? (
                  <Spinner className="size-3.5 text-white/50" />
                ) : (
                  <span className="shrink-0 text-12 text-white/40">
                    {reason ?? "Free"}
                  </span>
                )}
              </button>
            );
          })}

          {startIn.length > 0 && (
            <p className="px-3 pt-3 pb-1 text-12 text-white/40">
              {candidates.some((s) => busyReason(s) === null)
                ? "Or start a new session"
                : "No session is free. Start a new one"}
            </p>
          )}
          {startIn.map((project) => (
            <button
              key={project.id}
              type="button"
              disabled={sendingTo !== null}
              onClick={() => startNew(project)}
              className={cn(ROW, "text-white/75 hover:bg-white/[0.06]")}
            >
              <Plus className="size-3.5 shrink-0 text-white/40" />
              <span className="min-w-0 flex-1 truncate">In {project.name}</span>
              {sendingTo === `new-${project.id}` && (
                <span className="flex shrink-0 items-center gap-2 text-12 text-white/45">
                  <Spinner className="size-3.5" /> Starting…
                </span>
              )}
            </button>
          ))}
        </div>
      </GlassDialogContent>
    </GlassDialog>
  );
}
