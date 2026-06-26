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
  /** Полное название во всплывающей подсказке */
  hint?: string;
};

// HIDDEN: «Дашборд» (/dashboard, LayoutGrid) — скрыт по запросу пользователя.
// Маршрут оставлен в роутере, можно вернуть пункт меню при необходимости.

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
      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
      isActive
        ? "bg-success/10 text-success before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-success"
        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
    );

  const itemLabelClass =
    "min-w-0 flex-1 !overflow-visible !whitespace-normal leading-snug normal-case tracking-normal";

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarHeader className="gap-3 p-3">
        <div className={cn("flex items-center", collapsed ? "justify-center px-0" : "px-1")}>
          <RomiLogo size={collapsed ? "sm" : "md"} />
        </div>
        <ProjectSwitcher collapsed={collapsed} />
      </SidebarHeader>


      <SidebarContent className="px-2">
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        onClick={() => { if (isMobile) setOpenMobile(false); }}
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
                        <item.icon className="h-4 w-4 shrink-0" />
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

      <SidebarFooter className="px-2 pb-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {system.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      onClick={() => { if (isMobile) setOpenMobile(false); }}
                      onFocus={() => prefetchRoute(item.url)}
                      onMouseEnter={() => prefetchRoute(item.url)}
                      className={({ isActive }) => itemClass({ isActive })}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
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
