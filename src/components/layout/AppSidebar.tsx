import { BarChart3, Settings, Table2, Target } from "lucide-react";
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
  icon: typeof Target;
  hint?: string;
};

const marketing: NavItem[] = [
  { title: "Управление рекламой", url: "/ads", icon: Target },
];

const analytics: NavItem[] = [
  { title: "Таблица РНП", hint: "РНП - показатели по дням", url: "/metrics", icon: Table2 },
  { title: "Аналитика продаж", hint: "Сквозная аналитика", url: "/analytics/sales", icon: BarChart3 },
];

const system: NavItem[] = [{ title: "Настройки", url: "/settings", icon: Settings }];

const GROUPS = [
  { label: "Маркетинг", items: marketing },
  { label: "Аналитика", items: analytics },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  const renderItem = (item: NavItem, activeOverride?: boolean) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton
        asChild
        tooltip={collapsed ? item.title : undefined}
        className="h-9 w-full p-0 hover:bg-transparent data-[active=true]:bg-transparent"
      >
        <NavLink
          to={item.url}
          end={item.url === "/"}
          onClick={() => isMobile && setOpenMobile(false)}
          onFocus={() => prefetchRoute(item.url)}
          onMouseEnter={() => prefetchRoute(item.url)}
          className={({ isActive }) => {
            const active = activeOverride ?? isActive;
            return cn(
              "group relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-foreground/70 hover:bg-secondary hover:text-foreground",
            );
          }}
          title={item.hint ?? item.title}
        >
          {({ isActive }) => {
            const active = activeOverride ?? isActive;
            return (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-opacity",
                    active ? "bg-primary opacity-100" : "opacity-0",
                  )}
                />
                <item.icon
                  className={cn(
                    "h-[17px] w-[17px] shrink-0 transition-colors",
                    active ? "text-primary" : "text-foreground/55 group-hover:text-foreground",
                  )}
                  strokeWidth={2}
                />
                {!collapsed && <span className="min-w-0 flex-1 truncate">{item.title}</span>}
              </>
            );
          }}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-white">
      <SidebarHeader className="gap-3 border-b border-border bg-white px-3 py-3">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "px-0.5")}>
          <RomiLogo size={collapsed ? "sm" : "md"} />
        </div>
        <ProjectSwitcher collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent className="bg-white px-2 py-2">
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="py-1.5">
            {!collapsed && (
              <SidebarGroupLabel className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) =>
                  renderItem(
                    item,
                    item.url === "/ads" && pathname.startsWith("/create") ? true : undefined,
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border bg-white px-2 py-2">
        <SidebarMenu className="gap-0.5">{system.map((item) => renderItem(item))}</SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
