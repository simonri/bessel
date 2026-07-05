import { useWindowEntry } from "@/components/canvas/window-manager";
import { TerminalWidget } from "@/components/terminal-widget";

function sshQuote(p: string): string {
  return "'" + p.replace(/'/g, "'\\''") + "'";
}

export function TerminalPage() {
  const entry = useWindowEntry();
  const sshHost = entry?.data?.projectSshHost;
  const path = entry?.data?.projectPath;

  if (sshHost && path) {
    return (
      <TerminalWidget
        command="ssh"
        args={["-t", sshHost, `cd ${sshQuote(path)} ; exec \${SHELL:-bash} -l`]}
      />
    );
  }

  return <TerminalWidget command="default-shell" args={[]} cwd={path} />;
}
