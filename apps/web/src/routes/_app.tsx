import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { WindowManager } from "@/components/canvas/window-manager";
import { CanvasShell } from "@/components/canvas/canvas-shell";
import { SettingsProvider } from "@/hooks/use-settings";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { isLoading, isAuthenticated } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <SettingsProvider>
      <WindowManager>
        <CanvasShell />
      </WindowManager>
    </SettingsProvider>
  );
}
