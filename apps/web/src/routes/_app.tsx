import { createFileRoute } from "@tanstack/react-router";
import { WindowManager } from "@/components/canvas/window-manager";
import { CanvasShell } from "@/components/canvas/canvas-shell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <WindowManager>
      <CanvasShell />
    </WindowManager>
  );
}
