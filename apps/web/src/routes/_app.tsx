import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@metron/ui/components/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider defaultOpen={false} className="h-svh">
      <AppSidebar />
      <SidebarInset className="overflow-y-auto">
        <div className="p-4 pb-28 md:p-8 md:pb-16">
          <Outlet />
        </div>
      </SidebarInset>
      <MobileNav />
    </SidebarProvider>
  );
}
