import { useRef } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@metron/ui/components/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    const sidebar = sidebarRef.current?.querySelector(
      '[data-slot="sidebar"]',
    ) as HTMLElement | null;
    if (sidebar?.dataset.state === "collapsed") {
      sidebar.dataset.collapsible = "";
      sidebar.dataset.hover = "";
    }
  };

  const handleMouseLeave = () => {
    const sidebar = sidebarRef.current?.querySelector(
      '[data-slot="sidebar"]',
    ) as HTMLElement | null;
    if (sidebar) {
      sidebar.dataset.collapsible = "icon";
      delete sidebar.dataset.hover;
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div
        ref={sidebarRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <AppSidebar />
      </div>
      <SidebarInset>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
