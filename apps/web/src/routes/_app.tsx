import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@metron/ui/components/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider defaultOpen={false} className="!min-h-0 h-svh">
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-auto">
        <div className="flex min-h-0 flex-1 flex-col p-4 pb-24 md:p-6 md:pb-6">
          <Outlet />
        </div>
      </SidebarInset>
      <MobileNav />
    </SidebarProvider>
  );
}
