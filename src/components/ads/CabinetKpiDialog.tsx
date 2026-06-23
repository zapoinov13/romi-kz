import { useEffect, useState } from "react";
import { Loader2, Target } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";

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
  target_roas: number | null;
  min_roas: number | null;
  max_frequency_7d: number | null;
  min_ctr_pct: number | null;
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
  target_roas: null,
  min_roas: null,
  max_frequency_7d: 3.5,
  min_ctr_pct: 0.8,
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

// Дефолты по типу цели (₸). Используются как подсказки в плейсхолдерах.
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

export default function CabinetKpiDialog({ open, onOpenChange, cabinetId, cabinetName }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<KpiRow>(EMPTY);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cab }, { data }] = await Promise.all([
        supabase.from("ad_cabinets").select("project_id").eq("id", cabinetId).maybeSingle(),
        supabase
        .from("ad_kpi_targets")
        .select("id, goal_type, target_cpl_kzt, max_cpl_kzt, min_daily_leads, min_daily_spend_kzt, max_daily_spend_kzt, target_roas, min_roas, max_frequency_7d, min_ctr_pct, auto_mode, auto_pause_enabled, auto_budget_cut_enabled, budget_cut_pct, auto_budget_bump_enabled, budget_bump_pct, bump_max_daily_kzt, cooldown_minutes, daily_action_limit")
        .eq("cabinet_id", cabinetId)
        .is("campaign_id", null)
        .is("adset_id", null)
        .maybeSingle(),
      ]);
      if (!cancelled) {
        setProjectId((cab?.project_id as string | null) ?? null);
        setRow(data ? { ...EMPTY, ...(data as any) } : EMPTY);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, cabinetId]);

  const updateField = <K extends keyof KpiRow>(k: K, v: KpiRow[K]) =>
    setRow((prev) => ({ ...prev, [k]: v }));

  const num = (v: string): number | null => {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && v.trim() !== "" ? n : null;
  };

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
      target_roas: row.target_roas,
      min_roas: row.min_roas,
      max_frequency_7d: row.max_frequency_7d,
      min_ctr_pct: row.min_ctr_pct,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            KPI кабинета · {cabinetName}
          </DialogTitle>
          <DialogDescription>
            Целевая и максимальная стоимость лида, лимиты бюджета и пороги для авто-оптимизации.
            Применяются ко всем кампаниям кабинета по умолчанию (потом можно переопределить на уровне кампании / adset).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Тип цели (опц.)</Label>
                <Select
                  value={row.goal_type ?? "all"}
                  onValueChange={(v) => updateField("goal_type", v === "all" ? null : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все цели</SelectItem>
                    {Object.entries(GOAL_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Мин. лидов в день</Label>
                <Input
                  type="number" min={0}
                  value={row.min_daily_leads ?? ""}
                  onChange={(e) => updateField("min_daily_leads", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>🎯 Целевой CPL, ₸</Label>
                <Input
                  type="number" min={0} step={100}
                  placeholder={goalDefaults ? String(goalDefaults.target) : "напр. 2000"}
                  value={row.target_cpl_kzt ?? ""}
                  onChange={(e) => updateField("target_cpl_kzt", num(e.target.value))}
                />
              </div>
              <div>
                <Label>🚨 Макс. CPL (жёсткий потолок), ₸</Label>
                <Input
                  type="number" min={0} step={100}
                  placeholder={goalDefaults ? String(goalDefaults.max) : "напр. 4000"}
                  value={row.max_cpl_kzt ?? ""}
                  onChange={(e) => updateField("max_cpl_kzt", num(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Мин. дневной spend, ₸</Label>
                <Input
                  type="number" min={0} step={500}
                  value={row.min_daily_spend_kzt ?? ""}
                  onChange={(e) => updateField("min_daily_spend_kzt", num(e.target.value))}
                />
              </div>
              <div>
                <Label>Макс. дневной spend, ₸</Label>
                <Input
                  type="number" min={0} step={500}
                  value={row.max_daily_spend_kzt ?? ""}
                  onChange={(e) => updateField("max_daily_spend_kzt", num(e.target.value))}
                />
              </div>
            </div>



            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              💡 На основе KPI бот будет автоматически рассчитывать статус каждой кампании (🟢 / 🟡 / 🔴),
              слать алерты в Telegram при превышении max CPL и предлагать действия (pause, изменение бюджета).
              Авто-pause требует подтверждения через Telegram-бота.
            </div>

            <Separator className="my-2" />

            <div>
              <div className="mb-2 text-sm font-semibold">🤖 Авто-режим</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Режим</Label>
                  <Select value={row.auto_mode} onValueChange={(v) => updateField("auto_mode", v as KpiRow["auto_mode"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Выкл — только алерты</SelectItem>
                      <SelectItem value="suggest">Предлагать (ждать подтверждения)</SelectItem>
                      <SelectItem value="enforce">Применять автоматически</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cooldown между действиями, мин</Label>
                  <Input
                    type="number" min={15} step={15}
                    value={row.cooldown_minutes}
                    onChange={(e) => updateField("cooldown_minutes", Number(e.target.value) || 360)}
                  />
                </div>
              </div>

              <div className="mt-3 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">⏸️ Авто-пауза</div>
                    <div className="text-[11px] text-muted-foreground">Останавливать кампанию при CPL &gt; max ×1.5 или 0 лидов с большими тратами</div>
                  </div>
                  <Switch checked={row.auto_pause_enabled} onCheckedChange={(v) => updateField("auto_pause_enabled", v)} />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">⬇️ Авто-сокращение бюджета</div>
                    <div className="text-[11px] text-muted-foreground">При CPL выше target на 20–50%</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={5} max={50} step={5}
                      className="w-16"
                      value={row.budget_cut_pct}
                      onChange={(e) => updateField("budget_cut_pct", Number(e.target.value) || 20)}
                      disabled={!row.auto_budget_cut_enabled}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <Switch checked={row.auto_budget_cut_enabled} onCheckedChange={(v) => updateField("auto_budget_cut_enabled", v)} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">⬆️ Авто-увеличение бюджета</div>
                    <div className="text-[11px] text-muted-foreground">При стабильно зелёном статусе и pace &gt; 50%</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={5} max={100} step={5}
                      className="w-16"
                      value={row.budget_bump_pct}
                      onChange={(e) => updateField("budget_bump_pct", Number(e.target.value) || 20)}
                      disabled={!row.auto_budget_bump_enabled}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <Switch checked={row.auto_budget_bump_enabled} onCheckedChange={(v) => updateField("auto_budget_bump_enabled", v)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Потолок бюджета при росте, ₸/день</Label>
                    <Input
                      type="number" min={0} step={1000}
                      placeholder="без ограничения"
                      value={row.bump_max_daily_kzt ?? ""}
                      onChange={(e) => updateField("bump_max_daily_kzt", num(e.target.value))}
                      disabled={!row.auto_budget_bump_enabled}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Макс. действий/сутки на кабинет</Label>
                    <Input
                      type="number" min={1} max={50}
                      value={row.daily_action_limit}
                      onChange={(e) => updateField("daily_action_limit", Number(e.target.value) || 5)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}