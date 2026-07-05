import { useWindowEntry } from "@/components/canvas/window-manager";
import { TerminalWidget } from "@/components/terminal-widget";

function sshQuote(p: string): string {
  return "'" + p.replace(/'/g, "'\\''") + "'";
}

export function ClaudeCode() {
  const entry = useWindowEntry();
  const sshHost = entry?.data?.projectSshHost;
  const path = entry?.data?.projectPath;

  if (sshHost && path) {
    return (
      <TerminalWidget
        command="ssh"
        args={["-t", sshHost, `cd ${sshQuote(path)} && exec \${SHELL:-bash} -lc 'claude --dangerously-skip-permissions'`]}
        taskDropZone
      />
    );
  }

  return (
    <TerminalWidget
      command="claude"
      args={["--dangerously-skip-permissions"]}
      cwd={path}
      taskDropZone
    />
  );
}
