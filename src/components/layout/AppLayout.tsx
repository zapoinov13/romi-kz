import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import AppSidebar from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { MetaTopBar } from "./MetaTopBar";
import { PublishUpdateBanner } from "./PublishUpdateBanner";
import { TaskReminderToast } from "@/components/crm/TaskReminderToast";
import { ContentFactoryGalleryProvider } from "@/contexts/ContentFactoryGalleryContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <ContentFactoryGalleryProvider>
      <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-svh w-full bg-white">
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 flex-col bg-white">
            <PublishUpdateBanner />
            <MetaTopBar />
            <main className="mobile-main min-w-0 flex-1 overflow-x-hidden bg-[hsl(var(--meta-bg))]">
              {children}
            </main>
            <MobileBottomNav />
          </SidebarInset>
        </div>
        <TaskReminderToast />
      </SidebarProvider>
    </ContentFactoryGalleryProvider>
  );
};

export default AppLayout;
