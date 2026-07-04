import {
  BarChart3,
  LayoutGrid,
  Settings,
  Table2,
  Target,
} from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import type { ModuleKey } from "@/hooks/useTeamStore";

type NavItem = {
  title: string;
  url: string;
  icon: typeof Target;
  hint?: string;
  module: ModuleKey;
  match?: (pathname: string) => boolean;
};

const sales: NavItem[] = [
  {
    title: "CRM",
    url: "/crm",
    icon: LayoutGrid,
    hint: "Воронка, чаты, сделки",
    module: "crm",
    match: (p) => p === "/crm" || p.startsWith("/crm/"),
  },
];

const marketing: NavItem[] = [
  {
    title: "Управление рекламой",
    url: "/ads",
    icon: Target,
    module: "ads",
    match: (p) => p === "/ads" || p.startsWith("/ads/") || p.startsWith("/create"),
  },
];

const analytics: NavItem[] = [
  {
    title: "Таблица РНП",
    hint: "Показатели по дням",
    url: "/metrics",
    icon: Table2,
    module: "metrics",
    match: (p) => p === "/metrics" || p.startsWith("/metrics/"),
  },
  {
    title: "Аналитика продаж",
    hint: "Сквозная аналитика",
    url: "/analytics/sales",
    icon: BarChart3,
    module: "sales_analytics",
    match: (p) => p.startsWith("/analytics/sales"),
  },
];

const system: NavItem[] = [
  {
    title: "Настройки",
    url: "/settings",
    icon: Settings,
    module: "settings",
    match: (p) => p.startsWith("/settings"),
  },
];

const GROUPS = [
  { label: "Маркетинг", items: marketing },
  { label: "Продажи", items: sales },
  { label: "Аналитика", items: analytics },
];

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname);
  return pathname === item.url || pathname.startsWith(`${item.url}/`);
}

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { hasModule, isAdmin } = useAuth();

  const canSee = (item: NavItem) => isAdmin || hasModule(item.module);

  const renderItem = (item: NavItem) => {
    const active = isItemActive(item, pathname);

    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          asChild
          tooltip={collapsed ? item.title : undefined}
          isActive={active}
          className="h-auto p-0 hover:bg-transparent data-[active=true]:bg-transparent"
        >
          <NavLink
            to={item.url}
            end={item.url === "/"}
            onClick={() => isMobile && setOpenMobile(false)}
            onFocus={() => prefetchRoute(item.url)}
            onMouseEnter={() => prefetchRoute(item.url)}
            title={item.hint ?? item.title}
            className={cn(
              "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-150",
              active
                ? "glass-surface text-primary shadow-sm ring-1 ring-border/50"
                : "text-foreground/75 hover:bg-white/45 hover:text-foreground hover:backdrop-blur-md",
            )}
          >
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary/80 text-foreground/55 group-hover:bg-secondary group-hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" strokeWidth={2.25} />
            </span>
            {!collapsed && <span className="min-w-0 flex-1 truncate leading-tight">{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      className="border-none bg-transparent [&_[data-sidebar=sidebar]]:glass-sidebar"
    >
      <SidebarHeader className="gap-3 border-b border-border/40 px-3 py-3.5">
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <RomiLogo size={collapsed ? "sm" : "md"} />
          {!collapsed && (
            <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
              Agency
            </span>
          )}
        </div>
        <ProjectSwitcher collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent className="px-2.5 py-3">
        {GROUPS.map((group) => {
          const items = group.items.filter(canSee);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label} className="py-1">
              {!collapsed && (
                <SidebarGroupLabel className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">{items.map((item) => renderItem(item))}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 px-2.5 py-2.5">
        <SidebarMenu className="gap-1">
          {system.filter(canSee).map((item) => renderItem(item))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
