import type { ProjectSchema } from "@bessel/client";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Bot,
  Power,
  RotateCcw,
  Smartphone,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  EmptyState,
  IconButton,
  Panel,
  SectionLabel,
  SoftButton,
} from "@/components/ui-kit";
import { useProjects } from "@/hooks/use-projects";
import {
  claudeSessionsApi,
  isLive,
  STATUS_LABEL,
  toAgentStatus,
  useClaudeSessions,
} from "./claude-sessions-store";
import type {
  ClaudeSessionView,
  ExternalClaudeSession,
} from "./claude-sessions-types";
import { RemoteLinkPopover } from "./remote-link-popover";
import { useShowCanvas } from "./show-canvas-context";
import { StatusDot } from "./status-dot";
import { useEndClaudeSession } from "./use-end-session";
import { useOpenClaudeSession } from "./use-open-claude-session";

export function shortenPath(path: string): string {
  return path.replace(/^\/(?:home|Users)\/[^/]+(?=\/|$)/, "~");
}

function projectFor(
  projects: readonly ProjectSchema[] | undefined,
  projectId: string | null,
  cwd: string,
): ProjectSchema | undefined {
  return (
    projects?.find((p) => p.id === projectId) ??
    projects?.find((p) => p.path === cwd && !p.ssh_host)
  );
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function Meta({
  status,
  project,
  cwd,
  since,
}: {
  status: string;
  project?: string;
  cwd: string;
  since: number;
}) {
  return (
    <p className="mt-0.5 truncate text-11 text-white/45">
      {status}
      {project ? ` - ${project}` : ""} - {shortenPath(cwd)}
      {since > 0 && ` - ${formatDistanceToNow(since, { addSuffix: true })}`}
    </p>
  );
}

function SessionRow({
  session,
  project,
  onOpen,
  onEnd,
}: {
  session: ClaudeSessionView;
  project?: ProjectSchema;
  onOpen: (session: ClaudeSessionView) => void;
  onEnd: (session: ClaudeSessionView) => void;
}) {
  const live = isLive(session.status);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusDot status={toAgentStatus(session.status)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 text-white/85">{session.name}</p>
        <Meta
          status={STATUS_LABEL[session.status]}
          project={project?.name}
          cwd={session.cwd}
          since={session.endedAt ?? session.createdAt}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {live ? (
          <>
            <RemoteLinkPopover
              sessionKey={session.key}
              side="left"
              align="center"
            >
              <IconButton title="Open on phone" aria-label="Open on phone">
                <Smartphone />
              </IconButton>
            </RemoteLinkPopover>
            <IconButton
              destructive
              title="End session"
              aria-label="End session"
              onClick={() => onEnd(session)}
            >
              <Power />
            </IconButton>
            <SoftButton onClick={() => onOpen(session)}>
              <SquareArrowOutUpRight />
              Open
            </SoftButton>
          </>
        ) : (
          <>
            <IconButton
              destructive
              title="Remove"
              aria-label="Remove"
              onClick={() =>
                claudeSessionsApi()
                  .remove(session.key)
                  .catch((err: unknown) =>
                    toast.error(
                      errorMessage(err, "Couldn't remove the session"),
                    ),
                  )
              }
            >
              <Trash2 />
            </IconButton>
            <SoftButton
              onClick={() =>
                claudeSessionsApi()
                  .resume(session.key)
                  .then(onOpen)
                  .catch((err: unknown) =>
                    toast.error(
                      errorMessage(err, "Couldn't resume the session"),
                    ),
                  )
              }
            >
              <RotateCcw />
              Resume
            </SoftButton>
          </>
        )}
      </div>
    </div>
  );
}

function ExternalRow({
  session,
  project,
  onOpen,
}: {
  session: ExternalClaudeSession;
  project?: ProjectSchema;
  onOpen: (session: ClaudeSessionView) => void;
}) {
  const { bgId } = session;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusDot status={toAgentStatus(session.status)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 text-white/75">
          {session.name ?? session.sessionId.slice(0, 8)}
        </p>
        <Meta
          status={
            bgId
              ? `Background - ${STATUS_LABEL[session.status]}`
              : "Running in a terminal"
          }
          project={project?.name}
          cwd={session.cwd}
          since={session.startedAt}
        />
      </div>
      {bgId && (
        <SoftButton
          onClick={() =>
            claudeSessionsApi()
              .adopt(bgId, project?.id)
              .then(onOpen)
              .catch((err: unknown) =>
                toast.error(errorMessage(err, "Couldn't open the session")),
              )
          }
        >
          <SquareArrowOutUpRight />
          Open
        </SoftButton>
      )}
    </div>
  );
}

/** Every Claude session on this machine: Bessel's own, then everything else. */
export function SessionsPage() {
  const { sessions, external, available } = useClaudeSessions();
  const { data: projects } = useProjects();
  const openSession = useOpenClaudeSession(useShowCanvas());
  const { requestEnd, endDialog } = useEndClaudeSession();

  const { live, ended } = useMemo(() => {
    const live = sessions
      .filter(
        (s) =>
          isLive(s.status) || s.status === "stopped" || s.status === "missing",
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    const ended = sessions
      .filter((s) => s.status === "ended")
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    return { live, ended };
  }, [sessions]);

  const others = useMemo(
    () => [...external].sort((a, b) => b.startedAt - a.startedAt),
    [external],
  );

  const renderSession = (session: ClaudeSessionView) => (
    <SessionRow
      key={session.key}
      session={session}
      project={projectFor(projects, session.projectId, session.cwd)}
      onOpen={openSession}
      onEnd={requestEnd}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {!available && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-12 text-amber-200/80">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          Couldn't run the claude CLI — is Claude Code installed and on PATH?
        </div>
      )}

      <section>
        <SectionLabel>Bessel sessions</SectionLabel>
        {live.length > 0 ? (
          <Panel>{live.map(renderSession)}</Panel>
        ) : (
          <EmptyState icon={<Bot />} title="No sessions running">
            Start one from a project's "+" in the sidebar. Sessions keep running
            when you close Bessel.
          </EmptyState>
        )}
      </section>

      {ended.length > 0 && (
        <section>
          <SectionLabel>Ended</SectionLabel>
          <Panel>{ended.map(renderSession)}</Panel>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <SectionLabel>Other sessions on this machine</SectionLabel>
          <Panel>
            {others.map((session) => (
              <ExternalRow
                key={
                  session.bgId ?? `${session.sessionId}-${session.startedAt}`
                }
                session={session}
                project={projectFor(projects, null, session.cwd)}
                onOpen={openSession}
              />
            ))}
          </Panel>
        </section>
      )}

      {endDialog}
    </div>
  );
}
