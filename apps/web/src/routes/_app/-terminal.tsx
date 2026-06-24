import { useWindowEntry } from "@/components/canvas/window-manager";
import { TerminalWidget } from "@/components/terminal-widget";

export function TerminalPage() {
  const entry = useWindowEntry();
  return (
    <TerminalWidget
      command="default-shell"
      args={[]}
      cwd={entry?.data?.projectPath}
    />
  );
}
