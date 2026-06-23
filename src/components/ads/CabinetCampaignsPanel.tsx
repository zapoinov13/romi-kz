import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw, Power, ExternalLink, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { StatusBadge, type CampaignHealth } from "@/components/ads/StatusBadge";
import AutoActionsLog from "@/components/ads/AutoActionsLog";

type MetaCampaign = {
  id: string;
  campaign_id: string;
  name: string;
  objective: string | null;
  destination_type: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  last_synced_at: string | null;
};

type LaunchCampaign = {
  id: string;
  goal: string | null;
  status: string | null;
  status_step: string | null;
  status_message: string | null;
  last_error: string | null;
  launch_id: string | null;
  meta_campaign_id: string | null;
  created_at: string;
  status_updated_at: string | null;
};

const statusColor = (s: string | null) => {
  const v = (s ?? "").toUpperCase();
  if (v === "ACTIVE") return "border-success/30 bg-success/10 text-success";
  if (v === "PAUSED") return "border-muted-foreground/30 bg-muted/30 text-muted-foreground";
  if (v.includes("DISAPPROVED") || v.includes("REJECTED") || v === "WITH_ISSUES")
    return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-warning/30 bg-warning/10 text-warning";
};

const statusLabel = (s: string | null) => {
  const v = (s ?? "").toUpperCase();
  const map: Record<string, string> = {
    ACTIVE: "Активна",
    PAUSED: "На паузе",
    DELETED: "Удалена",
    ARCHIVED: "Архив",
    IN_PROCESS: "Запускается",
    WITH_ISSUES: "С ошибками",
    DISAPPROVED: "Отклонена",
    PENDING_REVIEW: "На модерации",
    PREAPPROVED: "Предварительно одобрена",
    CAMPAIGN_PAUSED: "Кампания на паузе",
  };
  return map[v] ?? v ?? "—";
};

const isLaunchStale = (s: string | null, updatedAt?: string | null) => {
  const v = (s ?? "queued").toLowerCase();
  return ["queued", "running"].includes(v) && !!updatedAt && Date.now() - new Date(updatedAt).getTime() > 10 * 60 * 1000;
};

const launchStatus = (s: string | null, updatedAt?: string | null) => {
  const v = (s ?? "queued").toLowerCase();
  if (isLaunchStale(s, updatedAt)) return { label: "Нет финального статуса", icon: AlertCircle, cls: "border-destructive/30 bg-destructive/10 text-destructive" };
  if (v === "success") return { label: "Отправлено в Meta", icon: CheckCircle2, cls: "border-success/30 bg-success/10 text-success" };
  if (v === "error") return { label: "Ошибка запуска", icon: AlertCircle, cls: "border-destructive/30 bg-destructive/10 text-destructive" };
  if (v === "running") return { label: "Создаётся", icon: Loader2, cls: "border-warning/30 bg-warning/10 text-warning" };
  return { label: "Отправлено", icon: Clock3, cls: "border-warning/30 bg-warning/10 text-warning" };
};

const launchDetail = (l: LaunchCampaign) => {
  if (isLaunchStale(l.status, l.status_updated_at || l.created_at)) {
    return l.last_error || "Запуск ушёл в n8n, но n8n не вернул статус. Проверьте workflow ai-target-launch: он должен быть включён и отправлять callbackUrl с X-Callback-Secret.";
  }
  return l.last_error || l.status_message || l.status_step || (l.meta_campaign_id ? `Meta ID: ${l.meta_campaign_id}` : `Launch ID: ${l.launch_id}`);
};

const Panel = ({ cabinetId, currency }: { cabinetId: string; currency: string }) => {
  const [items, setItems] = useState<MetaCampaign[]>([]);
  const [launches, setLaunches] = useState<LaunchCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"active" | "paused" | "all">("active");
  const [health, setHealth] = useState<Record<string, CampaignHealth>>({});

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("meta_campaigns")
      .select("id,campaign_id,name,objective,destination_type,status,effective_status,daily_budget,lifetime_budget,last_synced_at")
      .eq("cabinet_id", cabinetId)
      .order("last_synced_at", { ascending: false });
    if (filter === "active") q = q.eq("status", "ACTIVE");
    else if (filter === "paused") q = q.eq("status", "PAUSED");
    const [{ data, error }, launchRes] = await Promise.all([
      q,
      supabase
        .from("ad_campaigns")
        .select("id,goal,status,status_step,status_message,last_error,launch_id,meta_campaign_id,created_at,status_updated_at")
        .eq("cabinet_id", cabinetId)
        .in("status", ["running", "success"])
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (error) {
      toast.error(error.message);
    } else {
      setItems((data ?? []) as MetaCampaign[]);
    }
    if (launchRes.error) toast.error(launchRes.error.message);
    else {
      // Прячем «зависшие» запуски без финального статуса — показываем только
      // активно создающиеся (running) и успешно завершённые (success).
      const rows = (launchRes.data ?? []) as LaunchCampaign[];
      const visible = rows.filter((l) => {
        const s = (l.status ?? "").toLowerCase();
        if (s === "success") return true;
        if (s === "running" && !isLaunchStale(l.status, l.status_updated_at || l.created_at)) return true;
        return false;
      });
      setLaunches(visible);
    }
    setLoading(false);
  }, [cabinetId, filter]);

  useEffect(() => { void load(); }, [load]);

  // Подгружаем последние снапшоты статусов из v_latest_campaign_status
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("v_latest_campaign_status" as never)
        .select("campaign_id,status,reasons,metrics,evaluated_at")
        .eq("cabinet_id", cabinetId);
      if (cancelled || !data) return;
      const map: Record<string, CampaignHealth> = {};
      for (const r of data as unknown as Array<{ campaign_id: string } & CampaignHealth>) {
        map[r.campaign_id] = r;
      }
      setHealth(map);
    })();
    return () => { cancelled = true; };
  }, [cabinetId, items.length]);

  const evaluateNow = async () => {
    const t = toast.loading("Оцениваем кампании…");
    try {
      const { data, error } = await supabase.functions.invoke("kpi-evaluator", {
        body: { cabinet_id: cabinetId },
      });
      if (error) throw error;
      const r = data as { evaluated?: number };
      toast.success(`Оценено кампаний: ${r?.evaluated ?? 0}`, { id: t });
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Ошибка", { id: t });
    }
  };

  useEffect(() => {
    const onLaunchUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ cabinetId?: string }>).detail;
      if (!detail?.cabinetId || detail.cabinetId === cabinetId) void load();
    };
    window.addEventListener("ads:campaign-launch-updated", onLaunchUpdated);
    return () => window.removeEventListener("ads:campaign-launch-updated", onLaunchUpdated);
  }, [cabinetId, load]);

  const sync = async () => {
    setSyncing(true);
    const t = toast.loading("Обновляем кампании из Meta…");
    try {
      const { data, error } = await supabase.functions.invoke("meta-structure-sync", {
        body: { cabinet_id: cabinetId },
      });
      if (error) throw error;
      const res = (data as { results?: Array<{ ok?: boolean; campaigns?: number; error?: string }> })?.results?.[0];
      if (res && !res.ok) throw new Error(res.error || "Meta вернула ошибку");
      toast.success(`Загружено кампаний: ${res?.campaigns ?? 0}`, { id: t });
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Не удалось обновить", { id: t, duration: 8000 });
    } finally {
      setSyncing(false);
    }
  };

  const toggle = async (c: MetaCampaign) => {
    const next = (c.status ?? "").toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setToggling((s) => ({ ...s, [c.campaign_id]: true }));
    const t = toast.loading(next === "ACTIVE" ? "Запускаем кампанию…" : "Ставим на паузу…");
    try {
      const { data, error } = await supabase.functions.invoke("meta-campaign-toggle", {
        body: { campaign_id: c.campaign_id, status: next },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error || "Meta вернула ошибку");
      setItems((arr) => arr.map((x) => x.campaign_id === c.campaign_id ? { ...x, status: next, effective_status: next } : x));
      toast.success(next === "ACTIVE" ? "Кампания запущена" : "Кампания на паузе", { id: t });
    } catch (e) {
      toast.error((e as Error).message || "Ошибка", { id: t, duration: 8000 });
    } finally {
      setToggling((s) => ({ ...s, [c.campaign_id]: false }));
    }
  };

  const fmtBudget = (n: number | null) => {
    if (!n || n <= 0) return "—";
    return `${Math.round(n).toLocaleString("ru-RU")} ${currency}`;
  };

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Кампании в Meta</div>
          <div className="text-[11px] text-muted-foreground">
            {loading
              ? "Загрузка…"
              : filter === "active"
                ? `Активных: ${items.length}`
                : filter === "paused"
                  ? `На паузе: ${items.length}`
                  : `Всего: ${items.length}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 items-center rounded-lg border border-border/60 bg-card/40 p-0.5 text-[11px] font-medium">
            {([
              { key: "active", label: "Активные", icon: Eye },
              { key: "paused", label: "На паузе", icon: EyeOff },
              { key: "all", label: "Все", icon: null },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2 transition-colors",
                  filter === opt.key
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.icon ? <opt.icon className="h-3 w-3" /> : null}
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={sync}
            disabled={syncing}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Обновить из Meta
          </button>
          <button
            type="button"
            onClick={evaluateNow}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Пересчитать статусы кампаний"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Оценить KPI
          </button>
        </div>
      </div>

      {launches.length > 0 && (
        <div className="mb-3 space-y-2 rounded-lg border border-border/60 bg-card/30 p-3">
          <div className="text-xs font-semibold">Последние запуски</div>
          {launches.map((l) => {
            const st = launchStatus(l.status, l.status_updated_at || l.created_at);
            const Icon = st.icon;
            const isSpinning = (l.status ?? "").toLowerCase() === "running";
            return (
              <div key={l.id} className="flex flex-col gap-1 border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", st.cls)}>
                    <Icon className={cn("h-3 w-3", isSpinning && "animate-spin")} />
                    {st.label}
                  </span>
                  <span className="text-xs font-medium">{l.goal || "Кампания"}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(l.status_updated_at || l.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {launchDetail(l)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          {filter === "active"
            ? "Активных кампаний нет. После запуска кампания появляется здесь через 1–2 минуты."
            : filter === "paused"
              ? "Нет кампаний на паузе."
              : "Кампаний нет. Нажмите «Обновить из Meta»."}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => {
            const isActive = (c.status ?? "").toUpperCase() === "ACTIVE";
            const eff = c.effective_status ?? c.status;
            return (
              <div
                key={c.id}
                className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Power className={cn("h-3.5 w-3.5", isActive ? "text-success" : "text-muted-foreground")} />
                    <div className="truncate text-sm font-semibold">{c.name || "Без названия"}</div>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", statusColor(eff))}>
                      {statusLabel(eff)}
                    </span>
                    {health[c.campaign_id] && <StatusBadge health={health[c.campaign_id]} />}
                    {c.objective && (
                      <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {c.objective}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span>ID: {c.campaign_id}</span>
                    <span>Дневной бюджет: {fmtBudget(c.daily_budget)}</span>
                    {c.last_synced_at && (
                      <span>Обновлено: {new Date(c.last_synced_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 self-end sm:self-center">
                  <a
                    href={`https://business.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${c.campaign_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title="Открыть в Ads Manager"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Switch
                    checked={isActive}
                    disabled={!!toggling[c.campaign_id]}
                    onCheckedChange={() => toggle(c)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 border-t border-border/60 pt-3">
        <AutoActionsLog cabinetId={cabinetId} />
      </div>
    </div>
  );
};

export default Panel;