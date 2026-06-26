import { Home, Target, Settings, Table2 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { prefetchRoute } from "@/lib/routePrefetch";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { RomiLogo } from "@/components/brand/RomiLogo";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type NavItem = {
  title: string;
  url: string;
  icon: typeof Target;
};

const mainNav: NavItem[] = [
  { title: "Кампании", url: "/ads", icon: Target },
  { title: "Таблица РНП", url: "/metrics", icon: Table2 },
];

const bottomNav: NavItem[] = [
  { title: "Настройки", url: "/settings", icon: Settings },
];

function NavIcon({ item }: { item: NavItem }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();

  const isActive =
    pathname === item.url ||
    pathname.startsWith(`${item.url}/`) ||
    (item.url === "/ads" && pathname.startsWith("/create"));

  const link = (
    <NavLink
      to={item.url}
      onClick={() => {
        if (isMobile) setOpenMobile(false);
      }}
      onFocus={() => prefetchRoute(item.url)}
      onMouseEnter={() => prefetchRoute(item.url)}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
        isActive
          ? "bg-sidebar-accent text-white"
          : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-white",
        isActive &&
          "before:absolute before:-left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-primary",
      )}
      end={item.url === "/"}
    >
      <item.icon className="h-[20px] w-[20px]" strokeWidth={isActive ? 2.25 : 2} />
    </NavLink>
  );

  if (isMobile) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {item.title}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar() {
  const { isMobile } = useSidebar();

  return (
    <TooltipProvider delayDuration={0}>
      <Sidebar
        collapsible="icon"
        className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-sidebar-border">
          <RomiLogo size="sm" />
        </div>

        <SidebarContent className="flex flex-col items-center gap-1 bg-sidebar px-2 py-3">
          {!isMobile && (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-auto p-0 hover:bg-transparent">
                  <a
                    href="/ads"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-white"
                    aria-label="Главная"
                  >
                    <Home className="h-[20px] w-[20px]" />
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}

          <SidebarMenu className="flex flex-col items-center gap-1">
            {mainNav.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild className="h-auto p-0 hover:bg-transparent">
                  <NavIcon item={item} />
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border bg-sidebar px-2 py-3">
          <SidebarMenu className="flex flex-col items-center gap-1">
            {bottomNav.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild className="h-auto p-0 hover:bg-transparent">
                  <NavIcon item={item} />
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}

export default AppSidebar;
