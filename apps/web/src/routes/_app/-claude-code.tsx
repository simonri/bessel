import { useEffect, useRef } from "react";
import {
  useWindowActions,
  useWindowEntry,
} from "@/components/canvas/window-manager";
import { TerminalWidget } from "@/components/terminal-widget";
import { decodeCommands } from "@/lib/widget-commands";

function sshQuote(p: string): string {
  return "'" + p.replace(/'/g, "'\\''") + "'";
}

export function ClaudeCode() {
  const entry = useWindowEntry();
  const { updateWindowData } = useWindowActions();
  const sshHost = entry?.data?.projectSshHost;
  const path = entry?.data?.projectPath;
  const commands = decodeCommands(entry?.data?.commands);

  // Captured once per widget instance: an existing id resumes across app
  // restarts via `--resume`; a fresh one is handed to the CLI via
  // `--session-id` so it becomes resumable too, and persisted onto the
  // window entry so the next restart finds it.
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

  if (sshHost && path) {
    // sessionArgs are always a flag name plus a crypto.randomUUID() — safe to
    // splice into the single-quoted remote command literally, same as the
    // static "claude --dangerously-skip-permissions" below used to be.
    const remoteCommand = ["claude", "--dangerously-skip-permissions", ...sessionArgs].join(" ");
    return (
      <TerminalWidget
        command="ssh"
        args={["-t", sshHost, `cd ${sshQuote(path)} && exec \${SHELL:-bash} -lc '${remoteCommand}'`]}
        taskDropZone
        commands={commands}
      />
    );
  }

  return (
    <TerminalWidget
      command="claude"
      args={["--dangerously-skip-permissions", ...sessionArgs]}
      cwd={path}
      taskDropZone
      commands={commands}
    />
  );
}
