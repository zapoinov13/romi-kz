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
    hint: "Кабинеты и кампании",
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
    hint: "Проект и интеграции",
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
          className="h-auto overflow-visible p-0 hover:bg-transparent data-[active=true]:bg-transparent [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible"
        >
          <NavLink
            to={item.url}
            end={item.url === "/"}
            onClick={() => isMobile && setOpenMobile(false)}
            onFocus={() => prefetchRoute(item.url)}
            onMouseEnter={() => prefetchRoute(item.url)}
            title={item.hint ?? item.title}
            className={cn(
              "group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 transition-all duration-150",
              active
                ? "bg-primary/[0.08] text-primary ring-1 ring-primary/15"
                : "text-foreground/80 hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/80 text-muted-foreground group-hover:bg-muted group-hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            {!collapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <span className="block text-[13px] font-medium leading-snug">{item.title}</span>
                {item.hint ? (
                  <span
                    className={cn(
                      "mt-0.5 block text-[11px] leading-snug",
                      active ? "text-primary/70" : "text-muted-foreground",
                    )}
                  >
                    {item.hint}
                  </span>
                ) : null}
              </div>
            )}
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
      <SidebarHeader className="gap-2.5 border-b border-border/40 px-3 py-3">
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <RomiLogo size={collapsed ? "sm" : "md"} />
          {!collapsed && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Agency
            </span>
          )}
        </div>
        <ProjectSwitcher collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {GROUPS.map((group) => {
          const items = group.items.filter(canSee);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label} className="py-1.5">
              {!collapsed && (
                <SidebarGroupLabel className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">{items.map((item) => renderItem(item))}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 px-2 py-2">
        <SidebarMenu className="gap-0.5">
          {system.filter(canSee).map((item) => renderItem(item))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
