import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trash2, MessageSquare, ShoppingCart, ListChecks, User, History, EyeOff, MessageSquareLock } from "lucide-react";
import type { ChatMessage, Lead, LeadStage, PaymentMethod, WhatsAppConfig } from "@/types/crm";
import type { TeamMember } from "@/hooks/useTeamStore";
import { supabase } from "@/integrations/supabase/client";
import { LeadHeader } from "./lead/LeadHeader";
import { LeadActionPanel } from "./lead/LeadActionPanel";
import { LeadChatPanel } from "./lead/LeadChatPanel";
import { LeadDealTab } from "./lead/LeadDealTab";
import { LeadTasksTab } from "./lead/LeadTasksTab";
import { LeadProfileTab } from "./lead/LeadProfileTab";
import { LeadLogTab } from "./lead/LeadLogTab";
import { LeadCommentsTab, type InternalComment } from "./lead/LeadCommentsTab";
import { useLeadChatSync } from "@/hooks/useLeadChatSync";

interface Props {
  lead: Lead | null;
  stages: LeadStage[];
  members: TeamMember[];
  chats: ChatMessage[];
  whatsapp: WhatsAppConfig;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdate: (id: string, patch: Partial<Lead>) => void;
  onDelete: (id: string) => void;
  onMarkPersonal: (id: string) => void;
  onTogglePin: (id: string) => void;
  onAssign: (id: string, assigneeId?: string) => void;
  onSendMessage: (id: string, text: string) => void;
  onRefreshLeadChats?: (leadId: string) => void;
  onMarkCall: (id: string, opts?: { direction?: "outgoing" | "incoming"; status?: "answered" | "missed"; durationSec?: number; note?: string }) => void;
  onLogCallAttempt?: (id: string, info: { provider: string; ok: boolean; phone?: string; warning?: string; error?: string }) => void;
  onMarkPaid: (id: string, method: PaymentMethod, amount: number, opts?: { note?: string }) => void;
  onSetVisit: (id: string, iso: string) => void;
  onAddTask: (id: string, title: string, dueAt: string) => void;
  onToggleTask: (id: string, taskId: string) => void;
  onRemoveTask: (id: string, taskId: string) => void;
  onRequestReject: (id: string) => void;
  /** Перевод сделки в этап «Оплачен» — обязательно через диалог суммы. */
  onRequestPay: (id: string) => void;
  /** Перевод в «Запись на диагностику» — диалог стоимости диагностики (можно 0). */
  onRequestDiagnostic?: (id: string) => void;
  /** Other leads' booked visits (ISO timestamps) — used by visit popover. */
  busySlots?: { iso: string; leadName?: string }[];
}

export function LeadDetailSheet({
  lead, stages, members, chats, whatsapp, open, onOpenChange,
  onUpdate, onDelete, onMarkPersonal, onTogglePin, onAssign, onSendMessage, onRefreshLeadChats,
  onMarkCall, onLogCallAttempt, onMarkPaid, onSetVisit, onAddTask, onToggleTask, onRemoveTask, onRequestReject, onRequestPay, onRequestDiagnostic,
  busySlots,
}: Props) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("deal");
  const [comments, setComments] = useState<InternalComment[]>([]);
  const [chatFocusToken, setChatFocusToken] = useState(0);

  useLeadChatSync(lead?.id, open, onRefreshLeadChats);

  useEffect(() => {
    if (!lead?.id || !open) {
      setComments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("communications")
        .select("id, lead_id, content, created_by, created_at")
        .eq("lead_id", lead.id)
        .eq("type", "note")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setComments(
        (data ?? []).map((row) => {
          const r = row as { id: string; lead_id: string; content: string | null; created_by: string | null; created_at: string };
          return {
            id: r.id,
            leadId: r.lead_id,
            text: r.content ?? "",
            authorId: r.created_by,
            authorName: members.find((m) => m.id === r.created_by)?.name ?? "Менеджер",
            createdAt: r.created_at,
          };
        }),
      );
    })();
    return () => { cancelled = true; };
  }, [lead?.id, open, members]);

  if (!lead) return null;

  const stageTitle = stages.find((s) => s.id === lead.stageId)?.title;
  const leadChats = chats.filter((c) => c.leadId === lead.id);
  const openChat = () => {
    if (isMobile) setTab("chat");
    setChatFocusToken((n) => n + 1);
  };

  const handleChangeStage = (sid: string) => {
    if (sid === lead.stageId) return;
    if (sid === "rejected") {
      onRequestReject(lead.id);
      onUpdate(lead.id, { stageId: sid });
      return;
    }
    if (sid === "paid") {
      onRequestPay(lead.id);
      return;
    }
    if (sid === "scheduled" && onRequestDiagnostic) {
      onRequestDiagnostic(lead.id);
      return;
    }
    onUpdate(lead.id, { stageId: sid });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden border-l border-border/70 bg-background p-0 pb-[env(safe-area-inset-bottom)] sm:max-w-none"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{lead.name}</SheetTitle>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(420px,540px)_1fr]">
          {/* LEFT: lead fields */}
          <div className="flex min-h-0 flex-col border-r border-border/60 bg-background">
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 pt-5">
                <LeadHeader
                  lead={lead}
                  stages={stages}
                  members={members}
                  onUpdate={(patch) => onUpdate(lead.id, patch)}
                  onTogglePin={() => onTogglePin(lead.id)}
                  onAssign={(aid) => onAssign(lead.id, aid)}
                  onChangeStage={handleChangeStage}
                  onOpenChat={openChat}
                />
              </div>

              <div className="px-5 pt-3">
                <LeadActionPanel
                  lead={lead}
                  onCall={(opts) => onMarkCall(lead.id, opts)}
                  onCallAttempt={onLogCallAttempt ? (info) => onLogCallAttempt(lead.id, info) : undefined}
                  onScheduleVisit={(iso) => onSetVisit(lead.id, iso)}
                  onMarkPaid={(method, amount, opts) => onMarkPaid(lead.id, method, amount, opts)}
                  onClose={() => onRequestReject(lead.id)}
                  onOpenChat={openChat}
                  busySlots={busySlots}
                />
              </div>

              <Tabs value={tab} onValueChange={setTab} className="flex flex-col px-5 pt-3 pb-4">
                <TabsList className={cn(
                  "grid h-auto w-full gap-0.5 rounded-xl bg-secondary/50 p-1",
                  isMobile ? "grid-cols-6" : "grid-cols-5",
                )}>
                  <TabsTrigger value="deal" className="gap-1 rounded-lg px-1 py-2 text-[10px] data-[state=active]:shadow-sm sm:text-xs">
                    <ShoppingCart className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Сделка</span>
                  </TabsTrigger>
                  <TabsTrigger value="tasks" className="gap-1 rounded-lg px-1 py-2 text-[10px] data-[state=active]:shadow-sm sm:text-xs">
                    <ListChecks className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Задачи</span>
                  </TabsTrigger>
                  <TabsTrigger value="comments" className="gap-1 rounded-lg px-1 py-2 text-[10px] data-[state=active]:shadow-sm sm:text-xs">
                    <MessageSquareLock className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Коммент.</span>
                  </TabsTrigger>
                  <TabsTrigger value="profile" className="gap-1 rounded-lg px-1 py-2 text-[10px] data-[state=active]:shadow-sm sm:text-xs">
                    <User className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Профиль</span>
                  </TabsTrigger>
                  <TabsTrigger value="log" className="gap-1 rounded-lg px-1 py-2 text-[10px] data-[state=active]:shadow-sm sm:text-xs">
                    <History className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Лог</span>
                  </TabsTrigger>
                  {isMobile && (
                    <TabsTrigger value="chat" className="gap-1 rounded-lg px-1 py-2 text-[10px] data-[state=active]:shadow-sm sm:text-xs">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Чат</span>
                    </TabsTrigger>
                  )}
                </TabsList>

                <div className="mt-3">
                  <TabsContent value="deal" className="m-0 data-[state=inactive]:hidden">
                    <LeadDealTab lead={lead} stages={stages} onUpdate={(p) => onUpdate(lead.id, p)} onChangeStage={handleChangeStage} />
                  </TabsContent>
                  <TabsContent value="tasks" className="m-0 data-[state=inactive]:hidden">
                    <LeadTasksTab
                      tasks={lead.tasks ?? []}
                      onAdd={(title, due) => onAddTask(lead.id, title, due)}
                      onToggle={(tid) => onToggleTask(lead.id, tid)}
                      onRemove={(tid) => onRemoveTask(lead.id, tid)}
                    />
                  </TabsContent>
                  <TabsContent value="comments" className="m-0 data-[state=inactive]:hidden">
                    <LeadCommentsTab
                      leadId={lead.id}
                      comments={comments}
                      members={members}
                      onAdded={(c) => setComments((prev) => [...prev, c])}
                    />
                  </TabsContent>
                  <TabsContent value="profile" className="m-0 data-[state=inactive]:hidden">
                    <LeadProfileTab lead={lead} onUpdate={(p) => onUpdate(lead.id, p)} />
                  </TabsContent>
                  <TabsContent value="log" className="m-0 data-[state=inactive]:hidden">
                    <LeadLogTab lead={lead} stages={stages} />
                  </TabsContent>
                  {isMobile && (
                    <TabsContent value="chat" className="m-0 min-h-[50dvh] data-[state=inactive]:hidden">
                      <LeadChatPanel
                        lead={lead}
                        chats={leadChats}
                        whatsappConnected={whatsapp.connected}
                        stageTitle={stageTitle}
                        onSend={(txt) => onSendMessage(lead.id, txt)}
                        focusToken={chatFocusToken}
                      />
                    </TabsContent>
                  )}
                </div>
              </Tabs>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-card/40 px-5 py-3 backdrop-blur-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("Удалить лида?")) {
                      onDelete(lead.id);
                      onOpenChange(false);
                    }
                  }}
                  className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />Удалить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    if (confirm(
                      "Убрать в личные?\n\nЭто не клиент — заявка пришла из вашей личной переписки. " +
                      "После подтверждения лид полностью исчезнет из CRM: воронки, чатов, базы и аналитики. " +
                      "Восстановить из интерфейса нельзя.",
                    )) {
                      onMarkPersonal(lead.id);
                      onOpenChange(false);
                    }
                  }}
                  title="Скрыть лид как личную переписку — он не будет учитываться нигде в CRM и аналитике"
                >
                  <EyeOff className="h-4 w-4" />Убрать в личные
                </Button>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Закрыть</Button>
            </div>
          </div>

          <div className="hidden min-h-0 flex-col bg-gradient-to-b from-muted/30 to-muted/10 lg:flex">
            <div className="flex items-center gap-2 border-b border-border/60 bg-background/60 px-5 py-3 backdrop-blur-sm">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#25D366]/15 text-[#128C7E]">
                <MessageSquare className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Чат с клиентом</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {lead.phone || "без номера"}
                  {whatsapp.connected ? " · WhatsApp online" : " · WhatsApp offline"}
                </div>
              </div>
              {stageTitle && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  {stageTitle}
                </span>
              )}
              <span className="rounded-full bg-secondary px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
                {leadChats.length} сообщ.
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <LeadChatPanel
                lead={lead}
                chats={leadChats}
                whatsappConnected={whatsapp.connected}
                stageTitle={stageTitle}
                onSend={(t) => onSendMessage(lead.id, t)}
                focusToken={chatFocusToken}
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
