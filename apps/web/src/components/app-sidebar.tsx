import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  PieChart,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@metron/ui/components/sidebar";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/" as const },
  { title: "Transactions", icon: ArrowLeftRight, href: "/transactions" as const },
  { title: "Accounts", icon: Landmark, href: "/accounts" as const },
  { title: "Reports", icon: PieChart, href: "/reports" as string },
];

export function AppSidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Metron" asChild>
              <Link to="/">
                <img
                  src="/logo.jpeg"
                  alt="Metron"
                  className="size-4 rounded"
                />
                <span className="font-semibold">Metron</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={currentPath === item.href}
                    asChild
                  >
                    <Link to={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              isActive={currentPath === "/settings"}
              asChild
            >
              <Link to={"/settings" as string}>
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
