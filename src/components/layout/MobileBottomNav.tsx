import { Target, Settings, Menu } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { prefetchRoute } from "@/lib/routePrefetch";

type NavItem = { title: string; url: string; icon: typeof Target; primary?: boolean };
const ITEMS: readonly NavItem[] = [
  { title: "Реклама", url: "/ads", icon: Target, primary: true },
  { title: "Настройки", url: "/settings", icon: Settings },
];




export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();

  if (!isMobile) return null;

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl md:hidden"
    >
      <div className="mx-auto grid h-[60px] max-w-lg grid-cols-5 px-1.5">
        {ITEMS.map((item) => {
          const active =
            pathname === item.url ||
            (item.url === "/" && pathname.startsWith("/create"));

          if (item.primary) {
            return (
              <NavLink
                key={item.url}
                to={item.url}
                onMouseEnter={() => prefetchRoute(item.url)}
                className="flex min-w-0 items-center justify-center"
                aria-label={item.title}
              >
                <span
                  className={cn(
                    "relative -mt-6 grid h-[56px] w-[56px] place-items-center rounded-[20px] bg-gradient-primary text-primary-foreground shadow-glow transition-transform duration-150 active:scale-90",
                    active && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
                  )}
                >
                  <item.icon className="h-[26px] w-[26px]" strokeWidth={2.25} />
                </span>
              </NavLink>
            );
          }

          return (
            <NavLink
              key={item.url}
              to={item.url}
              onMouseEnter={() => prefetchRoute(item.url)}
              className={cn(
                "group relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold transition-all duration-150 active:scale-90",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-11 place-items-center rounded-full transition-colors",
                  active ? "bg-primary/15" : "bg-transparent group-hover:bg-secondary/60",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 2} />
              </span>
              <span className="max-w-full truncate leading-none tracking-tight">{item.title}</span>
              {active && (
                <span className="pointer-events-none absolute -bottom-0.5 h-[3px] w-6 rounded-full bg-primary" />
              )}
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="group flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold text-muted-foreground transition-all duration-150 active:scale-90"
          aria-label="Открыть меню"
        >
          <span className="grid h-7 w-11 place-items-center rounded-full transition-colors group-hover:bg-secondary/60">
            <Menu className="h-5 w-5 shrink-0" />
          </span>
          <span className="leading-none tracking-tight">Ещё</span>
        </button>
      </div>
    </nav>
  );
}
