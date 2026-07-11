import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMeV1AuthMeGetOptions } from "@bessel/client";
import { Spinner } from "@bessel/ui/components/spinner";
import { client } from "@/lib/client";
import { WindowManager } from "@/components/canvas/window-manager";
import { CanvasShell } from "@/components/canvas/canvas-shell";
import { SettingsProvider } from "@/hooks/use-settings";
import { WorkspaceTemplatesProvider } from "@/hooks/use-workspace-templates";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { isLoading, isAuthenticated } = useAuth0();
  const navigate = useNavigate();

  const { isLoading: isUserLoading } = useQuery({
    ...getMeV1AuthMeGetOptions({ client }),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || isUserLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Spinner className="size-6 text-white" />
      </div>
    );
  }

  return (
    <SettingsProvider>
      <WindowManager>
        <WorkspaceTemplatesProvider>
          <CanvasShell />
        </WorkspaceTemplatesProvider>
      </WindowManager>
    </SettingsProvider>
  );
}
