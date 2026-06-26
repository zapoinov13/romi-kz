import { Target, Settings, Menu, Table2 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { prefetchRoute } from "@/lib/routePrefetch";

type NavItem = { title: string; url: string; icon: typeof Target };
const ITEMS: readonly NavItem[] = [
  { title: "Реклама", url: "/ads", icon: Target },
  { title: "РНП", url: "/metrics", icon: Table2 },
  { title: "Настройки", url: "/settings", icon: Settings },
];

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();

  if (!isMobile) return null;

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.08)] md:hidden"
    >
      <div className="mx-auto grid h-14 max-w-lg grid-cols-4 px-1">
        {ITEMS.map((item) => {
          const active = pathname === item.url || pathname.startsWith(`${item.url}/`);

          return (
            <NavLink
              key={item.url}
              to={item.url}
              onMouseEnter={() => prefetchRoute(item.url)}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-10 place-items-center rounded-md",
                  active ? "bg-accent" : "bg-transparent",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 2} />
              </span>
              <span className="max-w-full truncate leading-none">{item.title}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[10px] font-medium text-muted-foreground"
          aria-label="Открыть меню"
        >
          <span className="grid h-8 w-10 place-items-center rounded-md">
            <Menu className="h-5 w-5 shrink-0" />
          </span>
          <span className="leading-none">Ещё</span>
        </button>
      </div>
    </nav>
  );
}
