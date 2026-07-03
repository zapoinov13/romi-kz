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
  {
    title: "Таблица РНП",
    hint: "РНП · Таблица показателей по дням",
    url: "/metrics",
    icon: Table2,
  },
  {
    title: "Аналитика продаж",
    hint: "Сквозная аналитика от рекламы до оплаты",
    url: "/analytics/sales",
    icon: BarChart3,
  },
];

const system: NavItem[] = [
  { title: "Настройки", url: "/settings", icon: Settings },
];

const GROUPS = [
  { label: "Маркетинг", items: marketing },
  { label: "Аналитика", items: analytics },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
      isActive
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-foreground/75 hover:bg-secondary hover:text-foreground",
    );

  const iconWrapClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
      isActive
        ? "bg-primary-foreground/15 text-primary-foreground"
        : "bg-secondary text-foreground/70 group-hover:bg-background group-hover:text-foreground",
    );

  const itemLabelClass =
    "min-w-0 flex-1 truncate leading-none normal-case tracking-normal";

  const renderItem = (item: NavItem, activeOverride?: boolean) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton asChild className="h-auto w-full p-0 hover:bg-transparent">
        <NavLink
          to={item.url}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
          onFocus={() => prefetchRoute(item.url)}
          onMouseEnter={() => prefetchRoute(item.url)}
          className={({ isActive }) =>
            itemClass({ isActive: activeOverride ?? isActive })
          }
          end={item.url === "/"}
        >
          {({ isActive }) => {
            const active = activeOverride ?? isActive;
            return (
              <>
                <span className={iconWrapClass({ isActive: active })}>
                  <item.icon className="h-[16px] w-[16px]" strokeWidth={2.2} />
                </span>
                {!collapsed && (
                  <span className={itemLabelClass} title={item.hint ?? item.title}>
                    {item.title}
                  </span>
                )}
              </>
            );
          }}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border bg-white text-foreground"
    >
      <SidebarHeader className="gap-3 border-b border-border bg-white p-3">
        <div className={cn("flex items-center", collapsed ? "justify-center px-0" : "px-1")}>
          <RomiLogo size={collapsed ? "sm" : "md"} />
        </div>
        <ProjectSwitcher collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent className="bg-white px-2 py-3">
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            {!collapsed && (
              <SidebarGroupLabel className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) =>
                  renderItem(
                    item,
                    item.url === "/ads" && pathname.startsWith("/create")
                      ? true
                      : undefined,
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border bg-white px-2 py-2">
        <SidebarMenu className="gap-1">
          {system.map((item) => renderItem(item))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
