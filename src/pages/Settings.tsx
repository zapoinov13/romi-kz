import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Edit2, Facebook, Megaphone, MessageCircle, Plus, Search, Sparkles, Trash2, Users2, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddMemberDialog } from "@/components/settings/AddMemberDialog";
import { MetaConnectSettings } from "@/components/settings/MetaConnectSettings";
import { GreenApiSettings } from "@/components/settings/GreenApiSettings";
import { ProjectAdsTelegramSettings } from "@/components/settings/ProjectAdsTelegramSettings";
import { OpenAiKeySettings } from "@/components/settings/OpenAiKeySettings";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ROLE_LABELS,
  TeamMember,
  useTeamStore,
} from "@/hooks/useTeamStore";

import { toast } from "sonner";

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-destructive/15 text-destructive border-destructive/40",
  director: "bg-warning/15 text-warning border-warning/40",
  manager: "bg-primary/15 text-primary border-primary/40",
  marketer: "bg-success/15 text-success border-success/40",
  viewer: "bg-muted text-muted-foreground border-border",
};

const SETTINGS_TABS = ["team", "meta", "whatsapp", "telegram-ads", "openai"] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number];


export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const defaultTab: SettingsTab = SETTINGS_TABS.includes(tabParam as SettingsTab)
    ? (tabParam as SettingsTab)
    : "team";
  const { members, removeMember } = useTeamStore();
  
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [query, setQuery] = useState("");
  const [confirmDel, setConfirmDel] = useState<TeamMember | null>(null);

  const handleEdit = (m: TeamMember) => { setEditing(m); setOpen(true); };
  const handleAdd = () => { setEditing(null); setOpen(true); };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    );
  }, [members, query]);

  const confirmDelete = () => {
    if (!confirmDel) return;
    removeMember(confirmDel.id);
    toast.success(`Сотрудник «${confirmDel.name}» удалён`);
    setConfirmDel(null);
  };

  useEffect(() => {
    const status = searchParams.get("meta_oauth");
    if (!status) return;

    if (status === "success") {
      const name = searchParams.get("fb_name");
      toast.success(name ? `Facebook подключён: ${name}` : "Facebook успешно подключён");
    } else if (status === "error") {
      const message = searchParams.get("message");
      toast.error(message ?? "Не удалось подключить Facebook");
    }

    const next = new URLSearchParams(searchParams);
    next.delete("meta_oauth");
    next.delete("fb_name");
    next.delete("message");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <PageContainer>
      <PageHeader
        icon={SettingsIcon}
        title="Настройки"
        description="Команда, Meta, Green API WhatsApp и интеграции"
      />

      <Tabs defaultValue={defaultTab} key={defaultTab} className="mt-6 w-full">
        <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 bg-card/40 p-1">
          <TabsTrigger value="team" className="gap-2"><Users2 className="h-3.5 w-3.5" /> Команда</TabsTrigger>
          <TabsTrigger value="meta" className="gap-2"><Facebook className="h-3.5 w-3.5" /> Facebook / Meta</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2"><MessageCircle className="h-3.5 w-3.5" /> Green API</TabsTrigger>
          <TabsTrigger value="telegram-ads" className="gap-2"><Megaphone className="h-3.5 w-3.5" /> Telegram для рекламы</TabsTrigger>
          <TabsTrigger value="openai" className="gap-2"><Sparkles className="h-3.5 w-3.5" /> OpenAI</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="mt-0">
      <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-success/15 text-success">
              <Users2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Сотрудники</h2>
              <p className="text-xs text-muted-foreground">
                {members.length} активных{query && ` · найдено ${filtered.length}`}
              </p>
            </div>
          </div>
          <Button onClick={handleAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Добавить сотрудника
          </Button>
        </div>

        {members.length > 0 && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени, email или логину…"
              className="pl-9"
            />
          </div>
        )}

        {members.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-border/60 py-14 text-center">
            <Users2 className="mb-3 h-8 w-8 text-muted-foreground/60" />
            <div className="text-sm font-medium">Сотрудников пока нет</div>
            <div className="mb-4 max-w-sm text-xs text-muted-foreground">
              Добавьте сотрудника, выберите роль и отметьте модули, к которым у него будет доступ.
            </div>
            <Button onClick={handleAdd} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Пригласить
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-border/60 py-10 text-center text-xs text-muted-foreground">
            По запросу «{query}» ничего не найдено
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => (
              <div
                key={m.id}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border border-border/60 bg-background/40 p-3.5 transition-colors hover:bg-secondary/30"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-success/15 text-sm font-bold text-success">
                  {m.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{m.name}</span>
                    <Badge variant="outline" className={ROLE_COLOR[m.role]}>{ROLE_LABELS[m.role]}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.email}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] text-success">
                      Управление рекламой
                    </span>
                    {m.role === "admin" ? (
                      <span className="rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] text-success">
                        Все кабинеты
                      </span>
                    ) : (
                      <span className="rounded-md border border-border/60 bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {m.cabinets.length} кабинет(ов)
                      </span>
                    )}
                  </div>

                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEdit(m)} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Редактировать">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setConfirmDel(m)} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
        </TabsContent>

        <TabsContent value="meta" className="mt-0">
          <MetaConnectSettings />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-0">
          <GreenApiSettings />
        </TabsContent>

        <TabsContent value="telegram-ads" className="mt-0">
          <ProjectAdsTelegramSettings />
        </TabsContent>

        <TabsContent value="openai" className="mt-0">
          <OpenAiKeySettings />
        </TabsContent>

      </Tabs>


      <AddMemberDialog open={open} onOpenChange={setOpen} editing={editing} />

      <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить сотрудника?</AlertDialogTitle>
            <AlertDialogDescription>
              Сотрудник «{confirmDel?.name}» потеряет доступ к выбранным модулям. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
