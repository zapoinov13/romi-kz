import { LayoutGrid, Target, Settings, Table2 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { prefetchRoute } from "@/lib/routePrefetch";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { RomiLogo } from "@/components/brand/RomiLogo";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutGrid;
  hint?: string;
};

const marketing: NavItem[] = [
  { title: "Управление рекламой", url: "/ads", icon: Target },
];

const analytics: NavItem[] = [
  {
    title: "Таблица РНП",
    hint: "РНП · Таблица показателей по дням",
    url: "/metrics",
    icon: Table2,
  },
];

const system: NavItem[] = [
  { title: "Настройки", url: "/settings", icon: Settings },
];

function buildGroups(_activeProjectId: string): { label: string; items: NavItem[] }[] {
  return [
    { label: "Маркетинг", items: marketing },
    { label: "Аналитика", items: analytics },
  ];
}

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const GROUPS = buildGroups("");

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
      isActive
        ? "bg-accent text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
    );

  const itemLabelClass =
    "min-w-0 flex-1 !overflow-visible !whitespace-normal leading-snug normal-case tracking-normal";

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[1px_0_0_hsl(var(--border))]"
    >
      <SidebarHeader className="gap-2 border-b border-sidebar-border bg-white p-3">
        <div className={cn("flex items-center", collapsed ? "justify-center px-0" : "px-0.5")}>
          <RomiLogo size={collapsed ? "sm" : "md"} />
        </div>
        <ProjectSwitcher collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent className="bg-white px-2 py-2">
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild className="h-auto p-0 hover:bg-transparent">
                      <NavLink
                        to={item.url}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                        onFocus={() => prefetchRoute(item.url)}
                        onMouseEnter={() => prefetchRoute(item.url)}
                        className={({ isActive }) =>
                          itemClass({
                            isActive:
                              isActive ||
                              (item.url === "/" && pathname.startsWith("/create")),
                          })
                        }
                        end={item.url === "/"}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {!collapsed && (
                          <span className={itemLabelClass} title={item.hint ?? item.title}>
                            {item.title}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border bg-white px-2 py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {system.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild className="h-auto p-0 hover:bg-transparent">
                    <NavLink
                      to={item.url}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                      onFocus={() => prefetchRoute(item.url)}
                      onMouseEnter={() => prefetchRoute(item.url)}
                      className={({ isActive }) => itemClass({ isActive })}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && (
                        <span className={itemLabelClass} title={item.hint ?? item.title}>
                          {item.title}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
