import { useAuth0 } from "@auth0/auth0-react";
import { getMeV1AuthMeGetOptions } from "@bessel/client";
import { Spinner } from "@bessel/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { EventReminders } from "@/components/calendar/event-reminders";
import { WindowManager } from "@/components/canvas/window-manager";
import { SettingsProvider } from "@/hooks/use-settings";
import { WorkspaceTemplatesProvider } from "@/hooks/use-workspace-templates";
import { client } from "@/lib/client";

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
      <EventReminders />
      <WindowManager>
        <WorkspaceTemplatesProvider>
          <AppShell />
        </WorkspaceTemplatesProvider>
      </WindowManager>
    </SettingsProvider>
  );
}
