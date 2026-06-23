import { useEffect, useState } from "react";
import { Send, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface BotRow {
  id: string;
  bot_username: string | null;
  chat_id: string;
  chat_title: string | null;
  is_active: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  bot_token_present?: boolean;
}

export function ProjectTelegramSettings() {
  const { activeId: projectId, active } = useProjectsStore();
  const activeName = active?.name ?? null;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [bot, setBot] = useState<BotRow | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [chatTitle, setChatTitle] = useState("");

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("project_telegram_bots")
      .select("id, bot_username, chat_id, chat_title, is_active, last_test_at, last_test_ok, last_test_error")
      .eq("project_id", projectId)
      .maybeSingle();
    setLoading(false);
    if (error) {
      toast.error("Не удалось загрузить настройки Telegram", { description: error.message });
      return;
    }
    if (data) {
      setBot({ ...data, bot_token_present: true });
      setChatId(data.chat_id);
      setChatTitle(data.chat_title ?? "");
      setToken("");
    } else {
      setBot(null);
      setToken("");
      setChatId("");
      setChatTitle("");
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const handleSave = async () => {
    if (!projectId) return;
    if (!token.trim() && !bot) {
      toast.error("Введите токен бота");
      return;
    }
    if (!chatId.trim()) {
      toast.error("Введите Chat ID группы");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("telegram-bot-save", {
      body: {
        project_id: projectId,
        bot_token: token.trim() || undefined,
        chat_id: chatId.trim(),
        chat_title: chatTitle.trim() || null,
      },
    });
    setSaving(false);
    if (error || (data as { error?: string })?.error) {
      toast.error("Не удалось сохранить", {
        description: (data as { error?: string })?.error ?? error?.message,
      });
      return;
    }
    toast.success(`Бот @${(data as { bot_username?: string }).bot_username ?? "—"} подключён`);
    setToken("");
    await load();
  };

  const handleTest = async () => {
    if (!projectId) return;
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("telegram-bot-test", {
      body: { project_id: projectId },
    });
    setTesting(false);
    if (error || (data as { ok?: boolean })?.ok !== true) {
      toast.error("Тест провалился", {
        description: (data as { error?: string })?.error ?? error?.message,
      });
    } else {
      toast.success("Сообщение отправлено в группу ✅");
    }
    await load();
  };

  const handleDelete = async () => {
    if (!projectId || !bot) return;
    if (!confirm("Отключить Telegram-бота от этого проекта?")) return;
    const { error } = await supabase.from("project_telegram_bots").delete().eq("project_id", projectId);
    if (error) {
      toast.error("Не удалось отключить", { description: error.message });
      return;
    }
    toast.success("Бот отключён");
    await load();
  };

  if (!projectId) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Выберите проект, чтобы настроить Telegram-бота
      </div>
    );
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-card/40 p-5">
      <header className="flex items-start gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
          <Send className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Telegram-бот для контента</h2>
          <p className="text-xs text-muted-foreground">
            Готовые креативы из контент-завода будут падать в указанную группу. Один бот на проект «{activeName ?? "—"}».
          </p>
        </div>
      </header>

      {bot && (
        <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">
                Бот: <span className="text-primary">@{bot.bot_username ?? "—"}</span>
              </div>
              <div className="mt-0.5 text-muted-foreground">
                Chat ID: {bot.chat_id} {bot.chat_title ? `· ${bot.chat_title}` : ""}
              </div>
              {bot.last_test_at && (
                <div className="mt-1 flex items-center gap-1.5">
                  {bot.last_test_ok ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-success" /> <span className="text-success">Тест ОК</span></>
                  ) : (
                    <><XCircle className="h-3.5 w-3.5 text-destructive" /> <span className="text-destructive">{bot.last_test_error}</span></>
                  )}
                  <span className="text-muted-foreground">· {new Date(bot.last_test_at).toLocaleString("ru")}</span>
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Отключить
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        <div>
          <Label className="text-xs">Bot Token {bot && <span className="text-muted-foreground">(оставьте пустым, чтобы не менять)</span>}</Label>
          <Input
            type="password"
            placeholder="123456789:AAH..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Получите у <a className="underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> командой /newbot.
          </p>
        </div>
        <div>
          <Label className="text-xs">Chat ID группы или канала</Label>
          <Input
            placeholder="-1001234567890"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Добавьте бота в группу как админа, затем напишите в группе сообщение и вызовите{" "}
            <code className="text-foreground/80">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> — в ответе будет chat.id.
          </p>
        </div>
        <div>
          <Label className="text-xs">Название (для удобства)</Label>
          <Input
            placeholder="Креативы проекта X"
            value={chatTitle}
            onChange={(e) => setChatTitle(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Сохраняем</> : bot ? "Обновить" : "Подключить"}
        </Button>
        {bot && (
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Отправляем</> : "Отправить тестовое сообщение"}
          </Button>
        )}
      </div>
    </section>
  );
}