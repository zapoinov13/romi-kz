import { Bell, RefreshCw } from "lucide-react";
import { useLocation } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<string, string> = {
  "/ads": "Кампании",
  "/metrics": "Отчёты",
  "/rnp": "Отчёты",
  "/settings": "Настройки",
  "/dashboard": "Обзор",
};

function resolveTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const base = `/${pathname.split("/")[1]}`;
  return PAGE_TITLES[base] ?? "ROMI";
}

interface MetaTopBarProps {
  onRefresh?: () => void;
  refreshing?: boolean;
  updatedLabel?: string;
}

export function MetaTopBar({ onRefresh, refreshing, updatedLabel = "Обновлено только что" }: MetaTopBarProps) {
  const { pathname } = useLocation();
  const title = resolveTitle(pathname);

  return (
    <header className="glass-nav sticky top-0 z-40 flex h-[52px] shrink-0 items-center gap-2 px-2 pt-[env(safe-area-inset-top)] sm:gap-3 sm:px-4">
      <SidebarTrigger
        className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-[hsl(var(--meta-header-bg))]"
        aria-label="Меню"
      />

      <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-foreground">{title}</h1>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:hidden">
        <ProjectSwitcher collapsed={false} metaStyle />
      </div>

      <div className="hidden shrink-0 items-center gap-1 sm:gap-2 md:flex">
        {onRefresh && (
          <>
            <span className="hidden text-[12px] text-muted-foreground lg:inline">{updatedLabel}</span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Обновить"
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-[hsl(var(--meta-header-bg))] disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </button>
          </>
        )}
        <button
          type="button"
          aria-label="Уведомления"
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-[hsl(var(--meta-header-bg))]"
        >
          <Bell className="h-[17px] w-[17px]" />
        </button>
      </div>
    </header>
  );
}

export default MetaTopBar;
