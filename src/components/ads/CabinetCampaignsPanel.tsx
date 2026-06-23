import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock3,
  Copy, ExternalLink, Eye, EyeOff, Loader2, Power, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { StatusBadge, type CampaignHealth } from "@/components/ads/StatusBadge";
import AutoActionsLog from "@/components/ads/AutoActionsLog";

type EntityKind = "campaign" | "adset" | "ad";

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

type MetaChild = {
  id: string;             // Meta numeric id
  name: string;
  status: string | null;
  effective_status: string | null;
  daily_budget?: number | null;
  lifetime_budget?: number | null;
  destination_type?: string | null;
  optimization_goal?: string | null;
  adset_id?: string | null;
  thumbnail_url?: string | null;
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

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активна", PAUSED: "На паузе", DELETED: "Удалена", ARCHIVED: "Архив",
  IN_PROCESS: "Запускается", WITH_ISSUES: "С ошибками",
  DISAPPROVED: "Отклонена", PENDING_REVIEW: "На модерации",
  PREAPPROVED: "Предварительно одобрена", CAMPAIGN_PAUSED: "Кампания на паузе",
  ADSET_PAUSED: "Группа на паузе",
};
const statusLabel = (s: string | null) =>
  STATUS_LABELS[(s ?? "").toUpperCase()] ?? s ?? "—";

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

async function toggleEntity(entity: EntityKind, metaId: string, nextStatus: "ACTIVE" | "PAUSED") {
  const { data, error } = await supabase.functions.invoke("meta-entity-toggle", {
    body: { entity, meta_id: metaId, status: nextStatus },
  });
  if (error) throw error;
  const payload = (data ?? {}) as { ok?: boolean; error?: string };
  if (!payload.ok) throw new Error(payload.error || "Meta вернула ошибку");
}

async function browseChildren(cabinetId: string, level: "adsets" | "ads", parentId: string): Promise<MetaChild[]> {
  const { data, error } = await supabase.functions.invoke("meta-structure-browse", {
    body: { cabinet_id: cabinetId, level, parent_id: parentId },
  });
  if (error) throw error;
  const payload = (data ?? {}) as { ok?: boolean; error?: string; items?: MetaChild[] };
  if (!payload.ok) throw new Error(payload.error || "Meta вернула ошибку");
  return payload.items ?? [];
}

// ------------------ Duplicate dialog ------------------

type DuplicateState = {
  entity: EntityKind;
  metaId: string;
  baseName: string;
};

type EntityDetails = {
  name?: string;
  daily_budget?: number | string | null;
  lifetime_budget?: number | string | null;
  status?: string;
  effective_status?: string;
  objective?: string;
  destination_type?: string;
  optimization_goal?: string;
  start_time?: string;
  end_time?: string;
  stop_time?: string;
  targeting?: {
    geo_locations?: { countries?: string[] };
    age_min?: number;
    age_max?: number;
    genders?: number[];
  };
  campaign_id?: string;
  adset_id?: string;
  creative?: {
    body?: string;
    title?: string;
    call_to_action_type?: string;
    object_url?: string;
  };
};

const GENDER_LABEL = (g: number[] | undefined) => {
  if (!g || g.length === 0 || g.length === 2) return "all";
  if (g[0] === 1) return "male";
  if (g[0] === 2) return "female";
  return "all";
};

const DuplicateDialog = ({
  state, onClose, onDuplicated,
}: {
  state: DuplicateState | null;
  onClose: () => void;
  onDuplicated: () => void;
}) => {
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [details, setDetails] = useState<EntityDetails | null>(null);
  const [currency, setCurrency] = useState("USD");

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"PAUSED" | "ACTIVE">("PAUSED");
  // campaign / adset
  const [dailyBudget, setDailyBudget] = useState<string>("");
  // adset
  const [countries, setCountries] = useState<string>("");
  const [ageMin, setAgeMin] = useState<string>("");
  const [ageMax, setAgeMax] = useState<string>("");
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  const [busy, setBusy] = useState(false);

  // Reset & fetch when dialog opens for a new entity
  useEffect(() => {
    if (!state) return;
    setDetails(null);
    setName(`${state.baseName} - копия`);
    setStatus("PAUSED");
    setDailyBudget("");
    setCountries("");
    setAgeMin("");
    setAgeMax("");
    setGender("all");
    setStartTime("");
    setEndTime("");
    setLoadingDetails(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("meta-entity-get", {
          body: { entity: state.entity, meta_id: state.metaId },
        });
        if (error) throw error;
        const payload = (data ?? {}) as { ok?: boolean; error?: string; data?: EntityDetails; currency?: string };
        if (!payload.ok) throw new Error(payload.error || "Не удалось получить настройки");
        const d = payload.data || {};
        setDetails(d);
        setCurrency(payload.currency || "USD");
        if (d.daily_budget != null) {
          setDailyBudget(String(Math.round(Number(d.daily_budget) / 100)));
        }
        const t = d.targeting;
        if (t?.geo_locations?.countries) setCountries(t.geo_locations.countries.join(", "));
        if (t?.age_min != null) setAgeMin(String(t.age_min));
        if (t?.age_max != null) setAgeMax(String(t.age_max));
        setGender(GENDER_LABEL(t?.genders) as "all" | "male" | "female");
        if (d.start_time) setStartTime(d.start_time.slice(0, 16));
        if (d.end_time) setEndTime(d.end_time.slice(0, 16));
      } catch (e) {
        toast.error((e as Error).message || "Не удалось загрузить текущие настройки");
      } finally {
        setLoadingDetails(false);
      }
    })();
  }, [state?.metaId, state?.entity]);

  const submit = async () => {
    if (!state) return;
    setBusy(true);
    const t = toast.loading("Дублируем в Meta...");
    try {
      const edits: Record<string, unknown> = {};
      if (state.entity === "campaign" || state.entity === "adset") {
        const v = Number(dailyBudget);
        if (Number.isFinite(v) && v > 0) edits.daily_budget = v;
      }
      if (state.entity === "adset") {
        const list = countries.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
        if (list.length > 0) edits.targeting_countries = list;
        const aMin = Number(ageMin); if (Number.isFinite(aMin) && aMin > 0) edits.age_min = aMin;
        const aMax = Number(ageMax); if (Number.isFinite(aMax) && aMax > 0) edits.age_max = aMax;
        if (gender === "male") edits.genders = [1];
        else if (gender === "female") edits.genders = [2];
        else edits.genders = [];
        if (startTime) edits.start_time = new Date(startTime).toISOString();
        if (endTime) edits.end_time = new Date(endTime).toISOString();
      }

      const { data, error } = await supabase.functions.invoke("meta-copy-entity", {
        body: {
          entity: state.entity,
          meta_id: state.metaId,
          new_name: name.trim() || undefined,
          status_option: status,
          edits,
        },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { ok?: boolean; error?: string; copied_id?: string | null; warnings?: string[] };
      if (!payload.ok) throw new Error(payload.error || "Meta вернула ошибку");
      toast.success(
        `Дубль создан${payload.copied_id ? ` · ID ${payload.copied_id}` : ""}`,
        { id: t },
      );
      if (payload.warnings?.length) {
        toast.warning(`Часть правок не применилась: ${payload.warnings.join("; ")}`, { duration: 10000 });
      }
      onDuplicated();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Ошибка", { id: t, duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const title = state?.entity === "campaign"
    ? "Дублировать кампанию"
    : state?.entity === "adset"
      ? "Дублировать группу объявлений"
      : "Дублировать объявление";

  const showBudget = state?.entity === "campaign" || state?.entity === "adset";
  const showAdsetFields = state?.entity === "adset";

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Текущие настройки подтянуты из Meta. Поменяйте что нужно - дубль создастся с этими значениями.
          </DialogDescription>
        </DialogHeader>

        {loadingDetails ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Тянем настройки из Meta...
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="dup-name">Название копии</Label>
              <Input id="dup-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </div>

            {showBudget && (
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="dup-budget">Дневной бюджет ({currency})</Label>
                <Input
                  id="dup-budget"
                  type="number"
                  inputMode="numeric"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                  placeholder="напр. 50"
                />
                {details?.lifetime_budget && Number(details.lifetime_budget) > 0 && (
                  <div className="text-[11px] text-warning">
                    В оригинале задан общий бюджет, не дневной. Введите дневной или оставьте пусто.
                  </div>
                )}
              </div>
            )}

            {showAdsetFields && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="dup-geo">Страны (ISO-2 через запятую)</Label>
                  <Input
                    id="dup-geo"
                    value={countries}
                    onChange={(e) => setCountries(e.target.value)}
                    placeholder="KZ, RU"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="dup-age-min">Возраст от</Label>
                    <Input id="dup-age-min" type="number" min={13} max={65} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="dup-age-max">до</Label>
                    <Input id="dup-age-max" type="number" min={13} max={65} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Пол</Label>
                    <Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все</SelectItem>
                        <SelectItem value="male">Мужчины</SelectItem>
                        <SelectItem value="female">Женщины</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="dup-start">Старт</Label>
                    <Input id="dup-start" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="dup-end">Окончание</Label>
                    <Input id="dup-end" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Статус копии</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "PAUSED" | "ACTIVE")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAUSED">На паузе (рекомендуется)</SelectItem>
                  <SelectItem value="ACTIVE">Сразу активна</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {details && (
              <details className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                <summary className="cursor-pointer">Что сохраняется без изменений</summary>
                <ul className="mt-2 space-y-0.5">
                  {details.objective && <li>Цель: {details.objective}</li>}
                  {details.optimization_goal && <li>Оптимизация: {details.optimization_goal}</li>}
                  {details.destination_type && <li>Назначение: {details.destination_type}</li>}
                  {state?.entity === "campaign" && <li>Все группы и объявления (deep copy)</li>}
                  {state?.entity === "adset" && <li>Креативы из оригинальной группы</li>}
                  {state?.entity === "ad" && <li>Креатив, ссылки, CTA</li>}
                </ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button onClick={submit} disabled={busy || loadingDetails}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
            Дублировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ------------------ Ads list (inside an adset) ------------------

const AdsList = ({
  cabinetId, adsetId, onDuplicate, refreshKey,
}: {
  cabinetId: string;
  adsetId: string;
  onDuplicate: (s: DuplicateState) => void;
  refreshKey: number;
}) => {
  const [items, setItems] = useState<MetaChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await browseChildren(cabinetId, "ads", adsetId);
      setItems(items);
    } catch (e) {
      toast.error((e as Error).message || "Не удалось загрузить объявления");
    } finally { setLoading(false); }
  }, [cabinetId, adsetId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const toggle = async (ad: MetaChild) => {
    const next = (ad.status ?? "").toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setToggling((s) => ({ ...s, [ad.id]: true }));
    const t = toast.loading(next === "ACTIVE" ? "Запускаем объявление..." : "Ставим на паузу...");
    try {
      await toggleEntity("ad", ad.id, next);
      setItems((arr) => arr.map((x) => x.id === ad.id ? { ...x, status: next, effective_status: next } : x));
      toast.success(next === "ACTIVE" ? "Объявление запущено" : "Объявление на паузе", { id: t });
    } catch (e) {
      toast.error((e as Error).message || "Ошибка", { id: t, duration: 8000 });
    } finally {
      setToggling((s) => ({ ...s, [ad.id]: false }));
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Загружаем объявления...
    </div>;
  }
  if (items.length === 0) {
    return <div className="px-3 py-2 text-[11px] text-muted-foreground">В этой группе нет объявлений.</div>;
  }
  return (
    <div className="space-y-1.5 pl-2">
      {items.map((ad) => {
        const isActive = (ad.status ?? "").toUpperCase() === "ACTIVE";
        const eff = ad.effective_status ?? ad.status;
        return (
          <div key={ad.id} className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
            {ad.thumbnail_url
              ? <img src={ad.thumbnail_url} alt="" className="h-8 w-8 rounded object-cover" />
              : <div className="h-8 w-8 rounded bg-muted/40" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Power className={cn("h-3 w-3", isActive ? "text-success" : "text-muted-foreground")} />
                <div className="truncate text-xs font-medium">{ad.name || "Без названия"}</div>
                <span className={cn("rounded-full border px-1.5 py-0 text-[9px] font-semibold uppercase", statusColor(eff))}>
                  {statusLabel(eff)}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">ID: {ad.id}</div>
            </div>
            <button
              type="button"
              onClick={() => onDuplicate({ entity: "ad", metaId: ad.id, baseName: ad.name })}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Дублировать объявление"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <Switch
              checked={isActive}
              disabled={!!toggling[ad.id]}
              onCheckedChange={() => toggle(ad)}
            />
          </div>
        );
      })}
    </div>
  );
};

// ------------------ Adsets list (inside a campaign) ------------------

const AdsetsList = ({
  cabinetId, campaignId, currency, onDuplicate, refreshKey,
}: {
  cabinetId: string;
  campaignId: string;
  currency: string;
  onDuplicate: (s: DuplicateState) => void;
  refreshKey: number;
}) => {
  const [items, setItems] = useState<MetaChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [childKey, setChildKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await browseChildren(cabinetId, "adsets", campaignId);
      setItems(items);
    } catch (e) {
      toast.error((e as Error).message || "Не удалось загрузить группы");
    } finally { setLoading(false); }
  }, [cabinetId, campaignId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const toggle = async (adset: MetaChild) => {
    const next = (adset.status ?? "").toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setToggling((s) => ({ ...s, [adset.id]: true }));
    const t = toast.loading(next === "ACTIVE" ? "Запускаем группу..." : "Ставим группу на паузу...");
    try {
      await toggleEntity("adset", adset.id, next);
      setItems((arr) => arr.map((x) => x.id === adset.id ? { ...x, status: next, effective_status: next } : x));
      toast.success(next === "ACTIVE" ? "Группа запущена" : "Группа на паузе", { id: t });
    } catch (e) {
      toast.error((e as Error).message || "Ошибка", { id: t, duration: 8000 });
    } finally {
      setToggling((s) => ({ ...s, [adset.id]: false }));
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Загружаем группы объявлений...
    </div>;
  }
  if (items.length === 0) {
    return <div className="px-3 py-2 text-[11px] text-muted-foreground">В этой кампании нет групп объявлений.</div>;
  }
  return (
    <div className="space-y-1.5 pl-3">
      {items.map((adset) => {
        const isActive = (adset.status ?? "").toUpperCase() === "ACTIVE";
        const eff = adset.effective_status ?? adset.status;
        const isOpen = !!expanded[adset.id];
        return (
          <div key={adset.id} className="rounded-md border border-border/50 bg-background/30">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button
                type="button"
                onClick={() => setExpanded((s) => ({ ...s, [adset.id]: !s[adset.id] }))}
                className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Развернуть группу"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Power className={cn("h-3 w-3", isActive ? "text-success" : "text-muted-foreground")} />
                  <div className="truncate text-xs font-semibold">{adset.name || "Без названия"}</div>
                  <span className={cn("rounded-full border px-1.5 py-0 text-[9px] font-semibold uppercase", statusColor(eff))}>
                    {statusLabel(eff)}
                  </span>
                  {adset.optimization_goal && (
                    <span className="rounded-full border border-border/60 px-1.5 py-0 text-[9px] uppercase text-muted-foreground">
                      {adset.optimization_goal}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  ID: {adset.id}
                  {adset.daily_budget ? ` · Бюджет: ${Math.round(adset.daily_budget).toLocaleString("ru-RU")} ${currency}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDuplicate({ entity: "adset", metaId: adset.id, baseName: adset.name })}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Дублировать группу"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <Switch
                checked={isActive}
                disabled={!!toggling[adset.id]}
                onCheckedChange={() => toggle(adset)}
              />
            </div>
            {isOpen && (
              <div className="border-t border-border/40 px-2 py-2">
                <AdsList
                  cabinetId={cabinetId}
                  adsetId={adset.id}
                  onDuplicate={(s) => { onDuplicate(s); setChildKey((k) => k + 1); }}
                  refreshKey={childKey}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ------------------ Main panel ------------------

const Panel = ({ cabinetId, currency }: { cabinetId: string; currency: string }) => {
  const [items, setItems] = useState<MetaCampaign[]>([]);
  const [launches, setLaunches] = useState<LaunchCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"active" | "paused" | "all">("active");
  const [health, setHealth] = useState<Record<string, CampaignHealth>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [duplicateState, setDuplicateState] = useState<DuplicateState | null>(null);
  const [childRefreshKey, setChildRefreshKey] = useState(0);

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
      supabase.from("ad_campaigns")
        .select("id,goal,status,status_step,status_message,last_error,launch_id,meta_campaign_id,created_at,status_updated_at")
        .eq("cabinet_id", cabinetId)
        .in("status", ["running", "success"])
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (error) toast.error(error.message);
    else setItems((data ?? []) as MetaCampaign[]);
    if (launchRes.error) toast.error(launchRes.error.message);
    else {
      const rows = (launchRes.data ?? []) as LaunchCampaign[];
      setLaunches(rows.filter((l) => {
        const s = (l.status ?? "").toLowerCase();
        if (s === "success") return true;
        if (s === "running" && !isLaunchStale(l.status, l.status_updated_at || l.created_at)) return true;
        return false;
      }));
    }
    setLoading(false);
  }, [cabinetId, filter]);

  useEffect(() => { void load(); }, [load]);

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
    const t = toast.loading("Оцениваем кампании...");
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
    const t = toast.loading("Обновляем кампании из Meta...");
    try {
      const { data, error } = await supabase.functions.invoke("meta-structure-sync", {
        body: { cabinet_id: cabinetId },
      });
      if (error) throw error;
      const res = (data as { results?: Array<{ ok?: boolean; campaigns?: number; error?: string }> })?.results?.[0];
      if (res && !res.ok) throw new Error(res.error || "Meta вернула ошибку");
      toast.success(`Загружено кампаний: ${res?.campaigns ?? 0}`, { id: t });
      await load();
      setChildRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error((e as Error).message || "Не удалось обновить", { id: t, duration: 8000 });
    } finally {
      setSyncing(false);
    }
  };

  const toggle = async (c: MetaCampaign) => {
    const next = (c.status ?? "").toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setToggling((s) => ({ ...s, [c.campaign_id]: true }));
    const t = toast.loading(next === "ACTIVE" ? "Запускаем кампанию..." : "Ставим на паузу...");
    try {
      await toggleEntity("campaign", c.campaign_id, next);
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
              ? "Загрузка..."
              : filter === "active" ? `Активных: ${items.length}`
                : filter === "paused" ? `На паузе: ${items.length}`
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
                  {l.last_error || l.status_message || l.status_step || (l.meta_campaign_id ? `Meta ID: ${l.meta_campaign_id}` : `Launch ID: ${l.launch_id}`)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          {filter === "active"
            ? "Активных кампаний нет. После запуска кампания появляется здесь через 1-2 минуты."
            : filter === "paused"
              ? "Нет кампаний на паузе."
              : "Кампаний нет. Нажмите «Обновить из Meta»."}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => {
            const isActive = (c.status ?? "").toUpperCase() === "ACTIVE";
            const eff = c.effective_status ?? c.status;
            const isOpen = !!expanded[c.campaign_id];
            return (
              <div key={c.id} className="rounded-lg border border-border/60 bg-card/40">
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => ({ ...s, [c.campaign_id]: !s[c.campaign_id] }))}
                      className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label="Развернуть кампанию"
                      title="Показать группы объявлений"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
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
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => setDuplicateState({ entity: "campaign", metaId: c.campaign_id, baseName: c.name })}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                      title="Дублировать кампанию"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
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
                {isOpen && (
                  <div className="border-t border-border/40 px-3 py-2">
                    <AdsetsList
                      cabinetId={cabinetId}
                      campaignId={c.campaign_id}
                      currency={currency}
                      onDuplicate={setDuplicateState}
                      refreshKey={childRefreshKey}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 border-t border-border/60 pt-3">
        <AutoActionsLog cabinetId={cabinetId} />
      </div>

      <DuplicateDialog
        state={duplicateState}
        onClose={() => setDuplicateState(null)}
        onDuplicated={() => {
          // Refresh children that may now show the new entity, and resync campaigns from Meta.
          setChildRefreshKey((k) => k + 1);
          void sync();
        }}
      />
    </div>
  );
};

export default Panel;
