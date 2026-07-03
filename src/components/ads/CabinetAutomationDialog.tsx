import { useEffect, useState } from "react";
import {
  Bot,
  Copy,
  Gauge,
  Loader2,
  PauseCircle,
  Play,
  ShieldAlert,
  Sparkles,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_AUTOMATION_RULES,
  formatAutomationMoney,
  type AdAutomationRules,
  type AutoMode,
} from "@/lib/adAutomation";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cabinetId: string;
  cabinetName: string;
  currency?: string;
}

function MoneyInput({
  label,
  hint,
  value,
  onChange,
  currency,
  step = 0.5,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  currency: string;
  step?: number;
}) {
  const sym = "$";
  const isPrefix = sym === "$";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          min={0}
          step={step}
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            const n = Number(v);
            onChange(v === "" || !Number.isFinite(n) ? null : n);
          }}
          className="h-10 pr-10 tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {isPrefix ? sym : sym}
        </span>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RuleCard({
  icon,
  title,
  description,
  enabled,
  onEnabledChange,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--meta-border))] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2.5">
          <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">{icon}</div>
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-muted-foreground">{description}</div>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled && <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>}
    </div>
  );
}

export default function CabinetAutomationDialog({
  open,
  onOpenChange,
  cabinetId,
  cabinetName,
  currency = "USD",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [rowId, setRowId] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [rules, setRules] = useState<AdAutomationRules>(DEFAULT_AUTOMATION_RULES);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cab }, { data }] = await Promise.all([
        supabase.from("ad_cabinets").select("project_id, currency").eq("id", cabinetId).maybeSingle(),
        supabase
          .from("ad_kpi_targets")
          .select(
            "id, auto_mode, auto_duplicate_adset_enabled, auto_duplicate_stable_days, auto_duplicate_max_cpl, auto_duplicate_min_leads, auto_smart_pause_enabled, auto_pause_spend_threshold, auto_pause_min_ctr_pct, auto_pause_max_cpm, auto_pause_scope, cooldown_minutes, daily_action_limit, target_cpl_kzt, max_cpl_kzt",
          )
          .eq("cabinet_id", cabinetId)
          .is("campaign_id", null)
          .is("adset_id", null)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setProjectId((cab?.project_id as string | null) ?? null);
      const cur = (cab?.currency as string) || currency;
      if (data) {
        const d = data as Record<string, unknown>;
        setRowId(d.id as string);
        setRules({
          ...DEFAULT_AUTOMATION_RULES,
          auto_mode: (d.auto_mode as AutoMode) ?? "suggest",
          auto_duplicate_adset_enabled: Boolean(d.auto_duplicate_adset_enabled),
          auto_duplicate_stable_days: Number(d.auto_duplicate_stable_days ?? 3),
          auto_duplicate_max_cpl:
            d.auto_duplicate_max_cpl != null
              ? Number(d.auto_duplicate_max_cpl)
              : cur === "USD"
                ? 2
                : 900,
          auto_duplicate_min_leads: Number(d.auto_duplicate_min_leads ?? 3),
          auto_smart_pause_enabled: Boolean(d.auto_smart_pause_enabled),
          auto_pause_spend_threshold:
            d.auto_pause_spend_threshold != null ? Number(d.auto_pause_spend_threshold) : cur === "USD" ? 5 : 2250,
          auto_pause_min_ctr_pct: Number(d.auto_pause_min_ctr_pct ?? 0.8),
          auto_pause_max_cpm: d.auto_pause_max_cpm != null ? Number(d.auto_pause_max_cpm) : null,
          auto_pause_scope: (d.auto_pause_scope as "adset" | "ad") ?? "adset",
          cooldown_minutes: Number(d.cooldown_minutes ?? 360),
          daily_action_limit: Number(d.daily_action_limit ?? 5),
          target_cpl_kzt: d.target_cpl_kzt != null ? Number(d.target_cpl_kzt) : null,
          max_cpl_kzt: d.max_cpl_kzt != null ? Number(d.max_cpl_kzt) : null,
        });
      } else {
        setRowId(undefined);
        setRules({
          ...DEFAULT_AUTOMATION_RULES,
          auto_duplicate_max_cpl: cur === "USD" ? 2 : 900,
          auto_pause_spend_threshold: cur === "USD" ? 5 : 2250,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cabinetId, currency]);

  const patch = <K extends keyof AdAutomationRules>(k: K, v: AdAutomationRules[K]) =>
    setRules((prev) => ({ ...prev, [k]: v }));

  const onSave = async () => {
    if (!projectId) {
      toast.error("Не определён проект кабинета");
      return;
    }
    setSaving(true);
    const payload = {
      cabinet_id: cabinetId,
      project_id: projectId,
      campaign_id: null,
      adset_id: null,
      auto_mode: rules.auto_mode,
      auto_duplicate_adset_enabled: rules.auto_duplicate_adset_enabled,
      auto_duplicate_stable_days: rules.auto_duplicate_stable_days,
      auto_duplicate_max_cpl: rules.auto_duplicate_max_cpl,
      auto_duplicate_min_leads: rules.auto_duplicate_min_leads,
      auto_smart_pause_enabled: rules.auto_smart_pause_enabled,
      auto_pause_spend_threshold: rules.auto_pause_spend_threshold,
      auto_pause_min_ctr_pct: rules.auto_pause_min_ctr_pct,
      auto_pause_max_cpm: rules.auto_pause_max_cpm,
      auto_pause_scope: rules.auto_pause_scope,
      cooldown_minutes: rules.cooldown_minutes,
      daily_action_limit: rules.daily_action_limit,
    };
    const { error } = rowId
      ? await supabase.from("ad_kpi_targets").update(payload).eq("id", rowId)
      : await supabase.from("ad_kpi_targets").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Правила автоматизации сохранены");
    onOpenChange(false);
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("kpi-evaluator", {
      body: { cabinet_id: cabinetId },
    });
    setRunning(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = (data ?? {}) as { ok?: boolean; adset_actions?: number };
    toast.success(r.adset_actions ? `Проверка завершена · ${r.adset_actions} действий` : "Проверка завершена");
  };

  const modeBadge =
    rules.auto_mode === "enforce"
      ? "bg-[hsl(var(--meta-create))]/15 text-[hsl(var(--meta-create))]"
      : rules.auto_mode === "suggest"
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground";

  const cur = currency.toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(720px,96vw)] max-w-[720px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-[hsl(var(--meta-border))] bg-white px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            Автоматизация
            <span className="truncate font-normal text-muted-foreground">· {cabinetName}</span>
            <Badge variant="outline" className={`ml-auto text-[10px] ${modeBadge}`}>
              {rules.auto_mode === "enforce" ? "Авто" : rules.auto_mode === "suggest" ? "С подтверждением" : "Выкл"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Автоправила для групп объявлений: масштабирование удачных связок и отключение «пустых» трат при нормальном CTR/CPM.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[hsl(var(--meta-bg))] px-5 py-4">
            <div className="rounded-lg border border-[hsl(var(--meta-border))] bg-white p-4">
              <Label className="text-xs text-muted-foreground">Режим применения</Label>
              <Select value={rules.auto_mode} onValueChange={(v) => patch("auto_mode", v as AutoMode)}>
                <SelectTrigger className="mt-1.5 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Выкл — только мониторинг</SelectItem>
                  <SelectItem value="suggest">Предлагать — ждать «Применить» в журнале</SelectItem>
                  <SelectItem value="enforce">Автоматически — сразу в Meta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <RuleCard
              icon={<Copy className="h-4 w-4" />}
              title="Дублировать успешные группы"
              description="Если CPL стабильно ниже порога — создать копию ad set для масштабирования"
              enabled={rules.auto_duplicate_adset_enabled}
              onEnabledChange={(v) => patch("auto_duplicate_adset_enabled", v)}
            >
              <MoneyInput
                label="Макс. CPL за окно"
                hint="Напр. $2 — дешевле = хороший результат"
                value={rules.auto_duplicate_max_cpl}
                onChange={(v) => patch("auto_duplicate_max_cpl", v)}
                currency={cur}
              />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Стабильность, дней подряд</Label>
                <Input
                  type="number"
                  min={2}
                  max={14}
                  className="h-10 tabular-nums"
                  value={rules.auto_duplicate_stable_days}
                  onChange={(e) => patch("auto_duplicate_stable_days", Number(e.target.value) || 3)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Мин. заявок за окно</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-10 tabular-nums"
                  value={rules.auto_duplicate_min_leads}
                  onChange={(e) => patch("auto_duplicate_min_leads", Number(e.target.value) || 1)}
                />
              </div>
              <div className="sm:col-span-2 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />
                Условие: за {rules.auto_duplicate_stable_days} дн. суммарный CPL ≤{" "}
                {formatAutomationMoney(rules.auto_duplicate_max_cpl, cur)} и ≥ {rules.auto_duplicate_min_leads} заявок.
                Копия создаётся в статусе PAUSED.
              </div>
            </RuleCard>

            <RuleCard
              icon={<PauseCircle className="h-4 w-4" />}
              title="Умная пауза без заявок"
              description="Отключить, если потратили порог и 0 лидов, но CTR нормальный (проблема не в креативе)"
              enabled={rules.auto_smart_pause_enabled}
              onEnabledChange={(v) => patch("auto_smart_pause_enabled", v)}
            >
              <MoneyInput
                label="Порог трат без заявок"
                hint="Напр. $5 на группу/объявление"
                value={rules.auto_pause_spend_threshold}
                onChange={(v) => patch("auto_pause_spend_threshold", v)}
                currency={cur}
              />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Мин. CTR, % (креатив «цепляет»)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  className="h-10 tabular-nums"
                  value={rules.auto_pause_min_ctr_pct}
                  onChange={(e) => patch("auto_pause_min_ctr_pct", Number(e.target.value) || 0.8)}
                />
              </div>
              <MoneyInput
                label="Макс. CPM (опционально)"
                hint="Если CPM выше — не паузим (дорогая аудитория)"
                value={rules.auto_pause_max_cpm}
                onChange={(v) => patch("auto_pause_max_cpm", v)}
                currency={cur}
                step={1}
              />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Уровень</Label>
                <Select
                  value={rules.auto_pause_scope}
                  onValueChange={(v) => patch("auto_pause_scope", v as "adset" | "ad")}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adset">Группа объявлений</SelectItem>
                    <SelectItem value="ad">Объявление (если в группе 1 ad)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
                Низкий CTR → не отключаем (меняйте креатив). Высокий CPM → не отключаем (сужайте аудиторию).
              </div>
            </RuleCard>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[hsl(var(--meta-border))] bg-white p-3">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Cooldown, мин
                </Label>
                <Input
                  type="number"
                  min={60}
                  step={60}
                  className="mt-1.5 h-10"
                  value={rules.cooldown_minutes}
                  onChange={(e) => patch("cooldown_minutes", Number(e.target.value) || 360)}
                />
              </div>
              <div className="rounded-lg border border-[hsl(var(--meta-border))] bg-white p-3">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Gauge className="h-3 w-3" /> Макс. действий / сутки
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  className="mt-1.5 h-10"
                  value={rules.daily_action_limit}
                  onChange={(e) => patch("daily_action_limit", Number(e.target.value) || 5)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 border-t border-[hsl(var(--meta-border))] bg-white px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button variant="outline" onClick={runNow} disabled={running || loading || rules.auto_mode === "off"} className="gap-1.5">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Проверить сейчас
          </Button>
          <Button onClick={onSave} disabled={saving || loading} className="min-w-[120px]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
