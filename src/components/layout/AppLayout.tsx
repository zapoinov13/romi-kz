import { Bell, Search } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import AppSidebar from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { TaskReminderToast } from "@/components/crm/TaskReminderToast";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { ContentFactoryGalleryProvider } from "@/contexts/ContentFactoryGalleryContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const { active } = useProjectsStore();

  return (
    <ContentFactoryGalleryProvider>
      <SidebarProvider>
        <div className="flex min-h-svh w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 flex-col bg-background">
            <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white px-3 pt-[env(safe-area-inset-top)] shadow-sm sm:px-5">
              <SidebarTrigger
                className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-secondary hover:text-primary md:hidden"
                aria-label="Открыть меню"
              />
              <div className="min-w-0 flex-1 md:hidden">
                <div className="truncate text-[15px] font-semibold leading-tight text-foreground">
                  {active?.name ?? "ROMI"}
                </div>
                <div className="truncate text-[11px] leading-tight text-muted-foreground">
                  Рекламный кабинет
                </div>
              </div>
              <div className="relative hidden min-w-0 flex-1 md:mx-auto md:block md:max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Поиск по кампаниям и кабинетам…"
                  disabled
                  className="h-9 w-full rounded-md border border-input bg-secondary/50 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="button"
                aria-label="Уведомления"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-primary"
              >
                <Bell className="h-[18px] w-[18px]" />
              </button>
            </header>
            <main className="mobile-main min-w-0 flex-1 overflow-x-hidden">{children}</main>
            <MobileBottomNav />
          </SidebarInset>
        </div>
        <TaskReminderToast />
      </SidebarProvider>
    </ContentFactoryGalleryProvider>
  );
};

export default AppLayout;
