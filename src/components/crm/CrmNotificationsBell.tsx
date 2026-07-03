import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Bell, MessageCircle, UserPlus, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CrmNotification } from "@/hooks/useCrmNotifications";

const ICON: Record<CrmNotification["type"], typeof Bell> = {
  new_lead: UserPlus,
  new_message: MessageCircle,
  stage_changed: ArrowRightLeft,
  assignee_changed: UserPlus,
};

type Props = {
  items: CrmNotification[];
  unread: number;
  onDismiss: (id: string) => void;
  onClear: () => void;
  onOpenLead?: (leadId: string) => void;
};

export function CrmNotificationsBell({ items, unread, onDismiss, onClear, onOpenLead }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-1.5">
          <Bell className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Уведомления</span>
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold">Уведомления</span>
          {items.length > 0 && (
            <button type="button" onClick={onClear} className="text-[10px] text-muted-foreground hover:text-foreground">
              Очистить
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">Новых уведомлений нет</div>
          ) : (
            items.map((n) => {
              const Icon = ICON[n.type];
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (n.leadId) onOpenLead?.(n.leadId);
                    onDismiss(n.id);
                  }}
                  className={cn(
                    "flex w-full gap-2 border-b border-border/40 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-secondary/40",
                  )}
                >
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{n.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{n.body}</span>
                    <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground/80">
                      {format(new Date(n.at), "dd MMM, HH:mm", { locale: ru })}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
