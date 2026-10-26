import { useWindowEntry } from "@/components/canvas/window-manager";
import { TerminalWidget } from "@/components/terminal-widget";
import { sshQuote, sshTerminalArgs } from "@/lib/ssh";
import { decodeCommands } from "@/lib/widget-commands";

export function Grok() {
  const entry = useWindowEntry();
  const sshHost = entry?.data?.projectSshHost;
  const path = entry?.data?.projectPath;
  const commands = decodeCommands(entry?.data?.commands);

  if (sshHost && path) {
    return (
      <TerminalWidget
        command="ssh"
        args={sshTerminalArgs(
          sshHost,
          `cd ${sshQuote(path)} && exec \${SHELL:-bash} -lc 'grok'`,
        )}
        taskDropZone
        commands={commands}
      />
    );
  }

  return (
    <TerminalWidget
      command="grok"
      args={[]}
      cwd={path}
      taskDropZone
      commands={commands}
    />
  );
}
