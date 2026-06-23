import { useEffect, useState } from "react";
import { Megaphone, CheckCircle2, XCircle, Loader2, Trash2, History, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectsStore } from "@/hooks/useProjectsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface BotRow {
  id: string;
  bot_username: string | null;
  chat_id: string;
  chat_title: string | null;
  allowed_chat_ids: string[];
  default_cabinet_id: string | null;
  default_destination: string;
  default_goal: string | null;
  default_daily_budget: number | null;
  default_country: string | null;
  default_city: string | null;
  default_geo: string[] | null;
  default_age_min: number | null;
  default_age_max: number | null;
  default_gender: string | null;
  default_objective: string | null;
  is_active: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
}

interface CabinetRow { id: string; name: string }
interface BotCabinetRow { cabinet_id: string; alias: string; is_default: boolean }
interface CommandRow {
  id: string;
  created_at: string;
  parsed_destination: string | null;
  status: string;
  command_text: string | null;
  media_kind: string | null;
  error: string | null;
}

const DEST_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Messenger" },
  { value: "site", label: "Сайт" },
  { value: "traffic", label: "Трафик" },
];

export function ProjectAdsTelegramSettings() {
  const { activeId: projectId, active } = useProjectsStore();
  const activeName = active?.name ?? null;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [bot, setBot] = useState<BotRow | null>(null);
  const [cabinets, setCabinets] = useState<CabinetRow[]>([]);
  const [history, setHistory] = useState<CommandRow[]>([]);

  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [chatTitle, setChatTitle] = useState("");
  const [allowedExtra, setAllowedExtra] = useState("");
  const [destination, setDestination] = useState<string>("whatsapp");
  const [dailyBudget, setDailyBudget] = useState<string>("");
  const [geoInput, setGeoInput] = useState<string>("");
  const [geoList, setGeoList] = useState<string[]>([]);
  const [ageMin, setAgeMin] = useState<string>("");
  const [ageMax, setAgeMax] = useState<string>("");
  const [gender, setGender] = useState<string>("all");
  const [objective, setObjective] = useState<string>("");
  const [botCabinets, setBotCabinets] = useState<BotCabinetRow[]>([]);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    const [{ data: botData, error: botErr }, { data: cabData }, { data: histData }] = await Promise.all([
      supabase
        .from("project_ads_telegram_bots")
        .select("id, bot_username, chat_id, chat_title, allowed_chat_ids, default_cabinet_id, default_destination, default_goal, default_daily_budget, default_country, default_city, default_geo, default_age_min, default_age_max, default_gender, default_objective, is_active, last_test_at, last_test_ok, last_test_error")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("ad_cabinets")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name"),
      supabase
        .from("ads_telegram_commands")
        .select("id, created_at, parsed_destination, status, command_text, media_kind, error")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    setLoading(false);
    if (botErr) {
      toast.error("Не удалось загрузить настройки", { description: botErr.message });
      return;
    }
    setCabinets((cabData ?? []) as CabinetRow[]);
    setHistory((histData ?? []) as CommandRow[]);
    if (botData) {
      const b = botData as unknown as BotRow;
      setBot(b);
      setChatId(b.chat_id);
      setChatTitle(b.chat_title ?? "");
      setAllowedExtra((b.allowed_chat_ids ?? []).filter((id) => id !== b.chat_id).join(", "));
      setDestination(b.default_destination ?? "whatsapp");
      setDailyBudget(b.default_daily_budget != null ? String(b.default_daily_budget) : "");
      const geo = (b.default_geo ?? []).filter(Boolean);
      if (geo.length === 0) {
        const legacy = [b.default_city, b.default_country].filter(Boolean) as string[];
        setGeoList(legacy);
      } else {
        setGeoList(geo);
      }
      setAgeMin(b.default_age_min != null ? String(b.default_age_min) : "");
      setAgeMax(b.default_age_max != null ? String(b.default_age_max) : "");
      setGender(b.default_gender ?? "all");
      setObjective(b.default_objective ?? "");
      setToken("");
      // load bot cabinets
      const { data: bcabs } = await supabase
        .from("ads_telegram_bot_cabinets")
        .select("cabinet_id, alias, is_default")
        .eq("bot_id", b.id);
      setBotCabinets((bcabs ?? []) as BotCabinetRow[]);
    } else {
      setBot(null);
      setToken(""); setChatId(""); setChatTitle("");
      setAllowedExtra(""); setDestination("whatsapp");
      setDailyBudget(""); setGeoList([]); setAgeMin(""); setAgeMax("");
      setGender("all"); setObjective(""); setBotCabinets([]);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const addGeo = () => {
    const v = geoInput.trim();
    if (!v) return;
    if (geoList.includes(v)) { setGeoInput(""); return; }
    setGeoList([...geoList, v]);
    setGeoInput("");
  };

  const toggleCabinet = (cabinet_id: string) => {
    const exists = botCabinets.find((c) => c.cabinet_id === cabinet_id);
    if (exists) {
      setBotCabinets(botCabinets.filter((c) => c.cabinet_id !== cabinet_id));
    } else {
      const name = cabinets.find((c) => c.id === cabinet_id)?.name ?? "cab";
      const alias = name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 24) || `cab${botCabinets.length + 1}`;
      setBotCabinets([...botCabinets, { cabinet_id, alias, is_default: botCabinets.length === 0 }]);
    }
  };

  const updateAlias = (cabinet_id: string, alias: string) => {
    setBotCabinets(botCabinets.map((c) => c.cabinet_id === cabinet_id ? { ...c, alias } : c));
  };

  const setDefaultCabinet = (cabinet_id: string) => {
    setBotCabinets(botCabinets.map((c) => ({ ...c, is_default: c.cabinet_id === cabinet_id })));
  };

  const handleSave = async () => {
    if (!projectId) return;
    if (!token.trim() && !bot) return toast.error("Введите токен бота");
    if (!chatId.trim()) return toast.error("Введите Chat ID");
    // Validate aliases unique + non-empty
    const aliases = botCabinets.map((c) => c.alias.trim().toLowerCase()).filter(Boolean);
    if (aliases.length !== botCabinets.length) return toast.error("У каждого кабинета должен быть алиас");
    if (new Set(aliases).size !== aliases.length) return toast.error("Алиасы кабинетов должны быть уникальны");
    setSaving(true);
    const allowed = allowedExtra
      .split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const defaultCab = botCabinets.find((c) => c.is_default)?.cabinet_id ?? botCabinets[0]?.cabinet_id ?? null;
    const { data, error } = await supabase.functions.invoke("ads-telegram-bot-save", {
      body: {
        project_id: projectId,
        bot_token: token.trim() || undefined,
        chat_id: chatId.trim(),
        chat_title: chatTitle.trim() || null,
        allowed_chat_ids: allowed,
        default_cabinet_id: defaultCab,
        default_destination: destination,
        default_daily_budget: dailyBudget ? Number(dailyBudget) : null,
        default_geo: geoList,
        default_age_min: ageMin ? Number(ageMin) : null,
        default_age_max: ageMax ? Number(ageMax) : null,
        default_gender: gender,
        default_objective: objective.trim() || null,
        cabinets: botCabinets,
      },
    });
    setSaving(false);
    if (error || (data as { error?: string })?.error) {
      toast.error("Не сохранили", { description: (data as { error?: string })?.error ?? error?.message });
      return;
    }
    toast.success(`Бот @${(data as { bot_username?: string }).bot_username ?? "—"} подключён`);
    setToken("");
    await load();
  };

  const handleTest = async () => {
    if (!projectId) return;
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("ads-telegram-bot-test", {
      body: { project_id: projectId },
    });
    setTesting(false);
    if (error || (data as { ok?: boolean })?.ok !== true) {
      toast.error("Тест провалился", {
        description: (data as { error?: string })?.error ?? error?.message,
      });
    } else {
      toast.success("Сообщение отправлено в чат ✅");
    }
    await load();
  };

  const handleDelete = async () => {
    if (!projectId || !bot) return;
    if (!confirm("Отключить бота управления рекламой от проекта?")) return;
    const { error } = await supabase.from("project_ads_telegram_bots").delete().eq("project_id", projectId);
    if (error) return toast.error("Не отключили", { description: error.message });
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
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-warning/15 text-warning">
          <Megaphone className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Telegram для управления рекламой</h2>
          <p className="text-xs text-muted-foreground">
            Отдельный бот для проекта «{activeName ?? "—"}». Шлёшь в чат фото/видео + «<code>запусти whatsapp</code>» — медиа и команда уходят в платформу, запуск идёт через привязанный кабинет.
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
                Chat ID: {bot.chat_id}{bot.chat_title ? ` · ${bot.chat_title}` : ""}
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

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label className="text-xs">Bot Token {bot && <span className="text-muted-foreground">(пусто = не менять)</span>}</Label>
          <Input type="password" placeholder="123456789:AAH..." value={token} onChange={(e) => setToken(e.target.value)} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Создай отдельного бота у <a className="underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> (не используй того же, что для контент-завода).
          </p>
        </div>
        <div>
          <Label className="text-xs">Chat ID (основной)</Label>
          <Input placeholder="-1001234567890" value={chatId} onChange={(e) => setChatId(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Название</Label>
          <Input placeholder="Реклама проекта X" value={chatTitle} onChange={(e) => setChatTitle(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Доп. разрешённые Chat ID (через запятую)</Label>
          <Input placeholder="-100..., 123456789" value={allowedExtra} onChange={(e) => setAllowedExtra(e.target.value)} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Только сообщения из этих чатов будут обрабатываться. Личный чат с ботом — твой user_id.
          </p>
        </div>

        <div>
          <Label className="text-xs">Цель по умолчанию</Label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEST_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Дневной бюджет, ₸</Label>
          <Input type="number" placeholder="5000" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Возраст от</Label>
            <Input type="number" min={13} max={65} placeholder="25" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Возраст до</Label>
            <Input type="number" min={13} max={65} placeholder="45" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Пол</Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="male">Мужской</SelectItem>
              <SelectItem value="female">Женский</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Цель кампании (objective)</Label>
          <Input placeholder="OUTCOME_ENGAGEMENT / LEADS / ..." value={objective} onChange={(e) => setObjective(e.target.value)} />
        </div>

        <div className="md:col-span-2">
          <Label className="text-xs">Гео (города/страны)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Алматы"
              value={geoInput}
              onChange={(e) => setGeoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGeo(); } }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addGeo}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {geoList.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {geoList.map((g) => (
                <span key={g} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {g}
                  <button type="button" onClick={() => setGeoList(geoList.filter((x) => x !== g))} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-2 rounded-xl border border-border/60 bg-background/30 p-3">
          <div className="mb-2 text-xs font-medium">Кабинеты, доступные боту</div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Отметь кабинеты, в которые бот может запускать. Алиас — короткое имя для команды: <code>/launch &lt;alias&gt; whatsapp</code>.
          </p>
          {cabinets.length === 0 && (
            <div className="text-xs text-muted-foreground">В проекте ещё нет рекламных кабинетов. Добавь их в разделе «Реклама».</div>
          )}
          <div className="space-y-2">
            {cabinets.map((c) => {
              const bc = botCabinets.find((b) => b.cabinet_id === c.id);
              const enabled = !!bc;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-card/40 p-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={enabled} onChange={() => toggleCabinet(c.id)} />
                    <span className="font-medium">{c.name}</span>
                  </label>
                  {enabled && bc && (
                    <>
                      <Input
                        className="h-7 w-32 text-xs"
                        placeholder="alias"
                        value={bc.alias}
                        onChange={(e) => updateAlias(c.id, e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                      />
                      <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                        <input
                          type="radio"
                          name="default-cabinet"
                          checked={bc.is_default}
                          onChange={() => setDefaultCabinet(c.id)}
                        />
                        по умолчанию
                      </label>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Сохраняем</> : bot ? "Обновить" : "Подключить"}
        </Button>
        {bot && (
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Отправляем</> : "Отправить тест"}
          </Button>
        )}
      </div>

      {history.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium">
            <History className="h-3.5 w-3.5" /> Последние команды
          </div>
          <div className="space-y-1.5 text-xs">
            {history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-baseline gap-2 border-b border-border/40 pb-1.5 last:border-0">
                <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString("ru")}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{h.status}</span>
                {h.parsed_destination && <span className="text-primary">{h.parsed_destination}</span>}
                {h.media_kind && <span className="text-muted-foreground">[{h.media_kind}]</span>}
                {h.command_text && <span className="truncate text-foreground/80">«{h.command_text}»</span>}
                {h.error && <span className="text-destructive">{h.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}