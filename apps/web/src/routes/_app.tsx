import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@metron/ui/components/sidebar";
import { Separator } from "@metron/ui/components/separator";
import { AppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider defaultOpen={false} className="!min-h-0 h-svh">
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-2 md:hidden border-b shrink-0">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">Metron</span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
