import { useEffect, useState } from "react";
import { Loader2, Target, Wallet, Bot, Sparkles, Gauge, Clock, ShieldAlert } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cabinetId: string;
  cabinetName: string;
}

type KpiRow = {
  id?: string;
  goal_type: string | null;
  target_cpl_kzt: number | null;
  max_cpl_kzt: number | null;
  min_daily_leads: number | null;
  min_daily_spend_kzt: number | null;
  max_daily_spend_kzt: number | null;

  auto_mode: "off" | "suggest" | "enforce";
  auto_pause_enabled: boolean;
  auto_budget_cut_enabled: boolean;
  budget_cut_pct: number;
  auto_budget_bump_enabled: boolean;
  budget_bump_pct: number;
  bump_max_daily_kzt: number | null;
  cooldown_minutes: number;
  daily_action_limit: number;
};

const EMPTY: KpiRow = {
  goal_type: null,
  target_cpl_kzt: null,
  max_cpl_kzt: null,
  min_daily_leads: 1,
  min_daily_spend_kzt: null,
  max_daily_spend_kzt: null,
  auto_mode: "suggest",
  auto_pause_enabled: true,
  auto_budget_cut_enabled: true,
  budget_cut_pct: 20,
  auto_budget_bump_enabled: false,
  budget_bump_pct: 20,
  bump_max_daily_kzt: null,
  cooldown_minutes: 360,
  daily_action_limit: 5,
};

const GOAL_DEFAULTS: Record<string, { target: number; max: number }> = {
  whatsapp: { target: 2000, max: 4000 },
  "site-leads": { target: 5000, max: 10000 },
  "meta-form": { target: 3000, max: 6000 },
  traffic: { target: 500, max: 1500 },
};

const GOAL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  "site-leads": "Лиды на сайте",
  "meta-form": "Лид-форма Meta",
  traffic: "Трафик",
};

// Поле с подписью + суффиксом валюты, выглядит аккуратно
function MoneyField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  step = 100,
  disabled,
}: {
  label: React.ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  hint?: string;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          min={0}
          step={step}
          placeholder={placeholder}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            const n = Number(v);
            onChange(v === "" || !Number.isFinite(n) ? null : n);
          }}
          className="h-10 pr-10 text-base tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">₸</span>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{title}</div>
          {description && <div className="text-[11px] text-muted-foreground">{description}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
  right,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          {description && <div className="text-[11px] leading-snug text-muted-foreground">{description}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

export default function CabinetKpiDialog({ open, onOpenChange, cabinetId, cabinetName }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<KpiRow>(EMPTY);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tab, setTab] = useState<"goals" | "auto">("goals");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cab }, { data }] = await Promise.all([
        supabase.from("ad_cabinets").select("project_id").eq("id", cabinetId).maybeSingle(),
        supabase
          .from("ad_kpi_targets")
          .select("id, goal_type, target_cpl_kzt, max_cpl_kzt, min_daily_leads, min_daily_spend_kzt, max_daily_spend_kzt, auto_mode, auto_pause_enabled, auto_budget_cut_enabled, budget_cut_pct, auto_budget_bump_enabled, budget_bump_pct, bump_max_daily_kzt, cooldown_minutes, daily_action_limit")
          .eq("cabinet_id", cabinetId)
          .is("campaign_id", null)
          .is("adset_id", null)
          .maybeSingle(),
      ]);
      if (!cancelled) {
        setProjectId((cab?.project_id as string | null) ?? null);
        setRow(data ? { ...EMPTY, ...(data as any) } : EMPTY);
        setLoading(false);
        setTab("goals");
      }
    })();
    return () => { cancelled = true; };
  }, [open, cabinetId]);

  const updateField = <K extends keyof KpiRow>(k: K, v: KpiRow[K]) =>
    setRow((prev) => ({ ...prev, [k]: v }));

  const onSave = async () => {
    if (!projectId) {
      toast.error("Не определён проект кабинета");
      return;
    }
    setSaving(true);
    const payload = {
      cabinet_id: cabinetId,
      project_id: projectId,
      campaign_id: null as string | null,
      adset_id: null as string | null,
      goal_type: row.goal_type,
      target_cpl_kzt: row.target_cpl_kzt,
      max_cpl_kzt: row.max_cpl_kzt,
      min_daily_leads: row.min_daily_leads,
      min_daily_spend_kzt: row.min_daily_spend_kzt,
      max_daily_spend_kzt: row.max_daily_spend_kzt,
      auto_mode: row.auto_mode,
      auto_pause_enabled: row.auto_pause_enabled,
      auto_budget_cut_enabled: row.auto_budget_cut_enabled,
      budget_cut_pct: row.budget_cut_pct,
      auto_budget_bump_enabled: row.auto_budget_bump_enabled,
      budget_bump_pct: row.budget_bump_pct,
      bump_max_daily_kzt: row.bump_max_daily_kzt,
      cooldown_minutes: row.cooldown_minutes,
      daily_action_limit: row.daily_action_limit,
    };
    const { error } = row.id
      ? await supabase.from("ad_kpi_targets").update(payload).eq("id", row.id)
      : await supabase.from("ad_kpi_targets").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(`Ошибка: ${error.message}`);
      return;
    }
    toast.success("KPI сохранены");
    onOpenChange(false);
  };

  const goalDefaults = row.goal_type ? GOAL_DEFAULTS[row.goal_type] : null;

  const autoModeBadge =
    row.auto_mode === "enforce" ? { label: "Авто", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
    : row.auto_mode === "suggest" ? { label: "Подсказки", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
    : { label: "Выкл", cls: "bg-muted text-muted-foreground border-border" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(720px,96vw)] max-w-[720px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            KPI кабинета
            <span className="truncate text-muted-foreground font-normal">· {cabinetName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Цели по стоимости лида и правила авто-оптимизации. Применяются ко всем кампаниям кабинета по умолчанию.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border/60 px-5 pt-3">
              <TabsList className="h-9 bg-muted/40">
                <TabsTrigger value="goals" className="gap-1.5 text-xs">
                  <Target className="h-3.5 w-3.5" /> Цели и лимиты
                </TabsTrigger>
                <TabsTrigger value="auto" className="gap-1.5 text-xs">
                  <Bot className="h-3.5 w-3.5" /> Авто-режим
                  <Badge variant="outline" className={`ml-1 h-5 border px-1.5 text-[10px] ${autoModeBadge.cls}`}>
                    {autoModeBadge.label}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <TabsContent value="goals" className="mt-0 space-y-4">
                <SectionCard
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Тип цели"
                  description="Подсказки CPL подстраиваются под выбранную цель"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Цель кампаний</Label>
                      <Select
                        value={row.goal_type ?? "all"}
                        onValueChange={(v) => updateField("goal_type", v === "all" ? null : v)}
                      >
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все цели</SelectItem>
                          {Object.entries(GOAL_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Мин. лидов в день</Label>
                      <Input
                        type="number" min={0}
                        className="h-10 text-base tabular-nums"
                        value={row.min_daily_leads ?? ""}
                        onChange={(e) => updateField("min_daily_leads", e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  icon={<Gauge className="h-4 w-4" />}
                  title="Стоимость лида (CPL)"
                  description="Целевая - ориентир для авто-логики, максимальная - жёсткий потолок"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <MoneyField
                      label={<span className="flex items-center gap-1.5"><Target className="h-3 w-3 text-emerald-500" /> Целевой CPL</span>}
                      value={row.target_cpl_kzt}
                      onChange={(v) => updateField("target_cpl_kzt", v)}
                      placeholder={goalDefaults ? String(goalDefaults.target) : "напр. 2000"}
                    />
                    <MoneyField
                      label={<span className="flex items-center gap-1.5"><ShieldAlert className="h-3 w-3 text-red-500" /> Макс. CPL (потолок)</span>}
                      value={row.max_cpl_kzt}
                      onChange={(v) => updateField("max_cpl_kzt", v)}
                      placeholder={goalDefaults ? String(goalDefaults.max) : "напр. 4000"}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  icon={<Wallet className="h-4 w-4" />}
                  title="Дневной бюджет"
                  description="Границы расхода в сутки на кабинет"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <MoneyField
                      label="Мин. дневной spend"
                      value={row.min_daily_spend_kzt}
                      onChange={(v) => updateField("min_daily_spend_kzt", v)}
                      placeholder="не задано"
                      step={500}
                    />
                    <MoneyField
                      label="Макс. дневной spend"
                      value={row.max_daily_spend_kzt}
                      onChange={(v) => updateField("max_daily_spend_kzt", v)}
                      placeholder="не задано"
                      step={500}
                    />
                  </div>
                </SectionCard>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-[11px] leading-snug text-muted-foreground">
                  💡 На основе KPI бот рассчитывает статус каждой кампании (🟢 / 🟡 / 🔴), шлёт алерты в Telegram при превышении max CPL и предлагает действия. Авто-pause требует подтверждения через Telegram-бота.
                </div>
              </TabsContent>

              <TabsContent value="auto" className="mt-0 space-y-4">
                <SectionCard
                  icon={<Bot className="h-4 w-4" />}
                  title="Режим работы"
                  description="Что делать боту при отклонениях от KPI"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Режим</Label>
                      <Select value={row.auto_mode} onValueChange={(v) => updateField("auto_mode", v as KpiRow["auto_mode"])}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">Выкл - только алерты</SelectItem>
                          <SelectItem value="suggest">Предлагать (ждать подтверждения)</SelectItem>
                          <SelectItem value="enforce">Применять автоматически</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3 w-3" /> Cooldown между действиями, мин
                      </Label>
                      <Input
                        type="number" min={15} step={15}
                        className="h-10 text-base tabular-nums"
                        value={row.cooldown_minutes}
                        onChange={(e) => updateField("cooldown_minutes", Number(e.target.value) || 360)}
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Автоматические действия"
                  description="Включайте только то, чему доверяете боту"
                >
                  <div className="space-y-2.5">
                    <ToggleRow
                      title="⏸️ Авто-пауза"
                      description="Останавливать кампанию при CPL > max ×1.5 или 0 лидов с большими тратами"
                      checked={row.auto_pause_enabled}
                      onCheckedChange={(v) => updateField("auto_pause_enabled", v)}
                    />

                    <ToggleRow
                      title="⬇️ Авто-сокращение бюджета"
                      description="При CPL выше target на 20-50%"
                      checked={row.auto_budget_cut_enabled}
                      onCheckedChange={(v) => updateField("auto_budget_cut_enabled", v)}
                      right={
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min={5} max={50} step={5}
                            className="h-8 w-16 text-sm tabular-nums"
                            value={row.budget_cut_pct}
                            onChange={(e) => updateField("budget_cut_pct", Number(e.target.value) || 20)}
                            disabled={!row.auto_budget_cut_enabled}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      }
                    />

                    <ToggleRow
                      title="⬆️ Авто-увеличение бюджета"
                      description="При стабильно зелёном статусе и pace > 50%"
                      checked={row.auto_budget_bump_enabled}
                      onCheckedChange={(v) => updateField("auto_budget_bump_enabled", v)}
                      right={
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min={5} max={100} step={5}
                            className="h-8 w-16 text-sm tabular-nums"
                            value={row.budget_bump_pct}
                            onChange={(e) => updateField("budget_bump_pct", Number(e.target.value) || 20)}
                            disabled={!row.auto_budget_bump_enabled}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      }
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  icon={<ShieldAlert className="h-4 w-4" />}
                  title="Защитные лимиты"
                  description="Не дают боту разогнаться сверх ожиданий"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <MoneyField
                      label="Потолок бюджета при росте, ₸/день"
                      value={row.bump_max_daily_kzt}
                      onChange={(v) => updateField("bump_max_daily_kzt", v)}
                      placeholder="без ограничения"
                      step={1000}
                      disabled={!row.auto_budget_bump_enabled}
                    />
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Макс. действий/сутки на кабинет</Label>
                      <Input
                        type="number" min={1} max={50}
                        className="h-10 text-base tabular-nums"
                        value={row.daily_action_limit}
                        onChange={(e) => updateField("daily_action_limit", Number(e.target.value) || 5)}
                      />
                    </div>
                  </div>
                </SectionCard>
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="gap-2 border-t border-border/60 bg-background/60 px-5 py-3 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
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
