import { Spinner } from "@bessel/ui/components/spinner";
import { useEffect, useRef, useState } from "react";
import {
  useWindowActions,
  useWindowEntry,
  useWindowStatus,
  useWorkspaceMeta,
} from "@/components/canvas/window-manager";
import {
  claudeSessionsApi,
  isRunning,
  isUntrustedWorkspaceError,
  toAgentStatus,
  useClaudeSession,
  useClaudeSessionsLoaded,
} from "@/components/claude-sessions/claude-sessions-store";
import { CLAUDE_SESSION_KEY } from "@/components/claude-sessions/use-open-claude-session";
import { TerminalWidget } from "@/components/terminal-widget";
import { decodeCommands } from "@/lib/widget-commands";

function sshQuote(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`;
}

const PANEL_BUTTON =
  "rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-white/75 transition-colors hover:border-white/20 hover:text-white/95";

function Panel({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#06060e] px-6 text-center">
      <p className="text-sm text-white/80">{title}</p>
      {detail && (
        <p className="max-w-sm text-xs leading-relaxed text-white/50">
          {detail}
        </p>
      )}
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

function Starting({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#06060e]">
      <Spinner className="size-5 text-white/50" />
      <p className="text-xs text-white/45">{label}</p>
    </div>
  );
}

type StartError = { untrusted: boolean; message: string };

// SSH projects keep the old foreground behaviour: a background session must
// run on the remote host itself, which this doesn't manage.
function RemoteClaude({ sshHost, path }: { sshHost: string; path: string }) {
  const entry = useWindowEntry();
  const { updateWindowData } = useWindowActions();
  const commands = decodeCommands(entry?.data?.commands);
  const existingSessionId = entry?.data?.claudeSessionId;
  const freshSessionId = useRef(crypto.randomUUID()).current;
  const sessionArgs = existingSessionId
    ? ["--resume", existingSessionId]
    : ["--session-id", freshSessionId];

  useEffect(() => {
    if (!existingSessionId && entry) {
      updateWindowData(entry.id, { claudeSessionId: freshSessionId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sessionArgs are always a flag name plus a UUID — safe to splice into the
  // single-quoted remote command literally.
  const remoteCommand = [
    "claude",
    "--dangerously-skip-permissions",
    ...sessionArgs,
  ].join(" ");
  return (
    <TerminalWidget
      command="ssh"
      args={[
        "-t",
        sshHost,
        `cd ${sshQuote(path)} && exec \${SHELL:-bash} -lc '${remoteCommand}'`,
      ]}
      taskDropZone
      commands={commands}
      detectAgentStatus
      // The args switch from --session-id to --resume once the id is saved;
      // it's still the same process, so a remount must reattach to it.
      sessionKey={JSON.stringify([
        sshHost,
        path,
        existingSessionId ?? freshSessionId,
      ])}
    />
  );
}

/**
 * A view of one background Claude session. The session itself runs in
 * Claude's background service: closing this window only detaches, and the
 * session stays reachable from claude.ai and the Claude app.
 */
function BackgroundClaude() {
  const entry = useWindowEntry();
  const { updateWindowData, closeWindow } = useWindowActions();
  const setWindowStatus = useWindowStatus();
  const { workspaces } = useWorkspaceMeta();
  const projectId = workspaces.find(
    (ws) => ws.id === entry?.workspaceId,
  )?.projectId;
  const sessionKey = entry?.data?.[CLAUDE_SESSION_KEY] || undefined;
  const session = useClaudeSession(sessionKey);
  const loaded = useClaudeSessionsLoaded();
  const [error, setError] = useState<StartError | null>(null);
  const [busy, setBusy] = useState(false);
  // Queued commands belong to a fresh session; replaying them on every
  // re-attach would re-run them.
  const [startedHere, setStartedHere] = useState(false);
  const creating = useRef(false);

  const start = () => {
    if (!entry || creating.current) return;
    creating.current = true;
    setError(null);
    setBusy(true);
    claudeSessionsApi()
      .create({
        cwd: entry.data?.projectPath ?? "",
        name:
          entry.data?.claudeSessionName || entry.data?.projectName || "Claude",
        projectId,
        // Windows from before background sessions carry a conversation id;
        // continue that conversation rather than starting over.
        resumeSessionId: entry.data?.claudeSessionId || undefined,
      })
      .then((view) => {
        setStartedHere(true);
        updateWindowData(entry.id, {
          [CLAUDE_SESSION_KEY]: view.key,
          claudeSessionId: "",
          claudeSessionName: "",
        });
      })
      .catch((err: unknown) =>
        setError({
          untrusted: isUntrustedWorkspaceError(err),
          message: err instanceof Error ? err.message : String(err),
        }),
      )
      .finally(() => {
        creating.current = false;
        setBusy(false);
      });
  };

  useEffect(() => {
    if (!sessionKey) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const status = session?.status ?? null;
  useEffect(() => {
    setWindowStatus?.(status ? toAgentStatus(status) : null);
  }, [status, setWindowStatus]);

  if (error?.untrusted) {
    return (
      <Panel
        title="Trust this folder first"
        detail={`Claude only runs in the background in folders you've trusted. Run \`claude\` once in ${entry?.data?.projectPath || "your home folder"} and accept the prompt, then try again.`}
      >
        <button type="button" className={PANEL_BUTTON} onClick={start}>
          Try again
        </button>
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel title="Claude didn't start" detail={error.message}>
        <button type="button" className={PANEL_BUTTON} onClick={start}>
          Try again
        </button>
      </Panel>
    );
  }
  if (!sessionKey || busy) return <Starting label="Starting Claude…" />;
  if (!loaded) return <Starting label="Connecting…" />;

  if (!session) {
    return (
      <Panel
        title="Session not found"
        detail="It may have been removed. Start a new one here instead."
      >
        <button
          type="button"
          className={PANEL_BUTTON}
          onClick={() =>
            entry && updateWindowData(entry.id, { [CLAUDE_SESSION_KEY]: "" })
          }
        >
          New session
        </button>
      </Panel>
    );
  }

  // Claude is still bringing it up (just created, or woken after a restart):
  // attaching now would race that, or hit an id about to be replaced.
  if (session.status === "starting")
    return <Starting label="Starting Claude…" />;

  if (!isRunning(session.status)) {
    const ended = session.status === "ended";
    return (
      <Panel
        title={ended ? "This session has ended" : "This session isn't running"}
        detail={
          ended
            ? "Resume it to pick up the conversation where it left off."
            : "It stopped, for example when the computer restarted. Resume it to pick up where it left off."
        }
      >
        <button
          type="button"
          className={PANEL_BUTTON}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            claudeSessionsApi()
              .resume(session.key)
              .catch((err: unknown) =>
                setError({
                  untrusted: isUntrustedWorkspaceError(err),
                  message: err instanceof Error ? err.message : String(err),
                }),
              )
              .finally(() => setBusy(false));
          }}
        >
          Resume
        </button>
        <button
          type="button"
          className={PANEL_BUTTON}
          onClick={() => entry && closeWindow(entry.id)}
        >
          Close
        </button>
      </Panel>
    );
  }

  return (
    // Re-attach whenever Claude gives the session a new id (a resume).
    <TerminalWidget
      key={session.bgId}
      command="claude"
      args={["attach", session.bgId]}
      cwd={session.cwd}
      taskDropZone
      commands={startedHere ? decodeCommands(entry?.data?.commands) : []}
      ignoreTitle
      blockSuspend
    />
  );
}

export function ClaudeCode() {
  const entry = useWindowEntry();
  const sshHost = entry?.data?.projectSshHost;
  const path = entry?.data?.projectPath;
  if (sshHost && path) return <RemoteClaude sshHost={sshHost} path={path} />;
  return <BackgroundClaude />;
}
