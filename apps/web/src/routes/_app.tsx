import { createFileRoute } from "@tanstack/react-router";
import { WindowManager } from "@/components/canvas/window-manager";
import { CanvasShell } from "@/components/canvas/canvas-shell";
import { SettingsProvider } from "@/hooks/use-settings";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <SettingsProvider>
      <WindowManager>
        <CanvasShell />
      </WindowManager>
    </SettingsProvider>
  );
}
