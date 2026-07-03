import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, RotateCcw, Play, Check, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AutoAction = {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  entity_name?: string | null;
  action_type: "pause" | "resume" | "budget_cut" | "budget_bump" | "duplicate_adset" | "pause_adset" | "pause_ad";
  trigger: "kpi_evaluator" | "manual" | "rollback";
  mode: "off" | "suggest" | "enforce";
  reason: string | null;
  before_value: Record<string, unknown>;
  after_value: Record<string, unknown>;
  status: "pending" | "applied" | "failed" | "skipped" | "rolled_back";
  error: string | null;
  created_at: string;
  applied_at: string | null;
};

const TYPE_LABEL: Record<AutoAction["action_type"], { icon: string; text: string }> = {
  pause: { icon: "⏸️", text: "Пауза кампании" },
  resume: { icon: "▶️", text: "Возобновить" },
  budget_cut: { icon: "⬇️", text: "Снизить бюджет" },
  budget_bump: { icon: "⬆️", text: "Поднять бюджет" },
  duplicate_adset: { icon: "📋", text: "Дубль группы" },
  pause_adset: { icon: "⏸️", text: "Пауза группы" },
  pause_ad: { icon: "⏸️", text: "Пауза объявления" },
};

const STATUS_STYLES: Record<AutoAction["status"], string> = {
  pending: "border-warning/40 bg-warning/10 text-warning",
  applied: "border-success/40 bg-success/10 text-success",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  skipped: "border-border/60 bg-muted/30 text-muted-foreground",
  rolled_back: "border-border/60 bg-muted/30 text-muted-foreground",
};

const STATUS_LABEL: Record<AutoAction["status"], string> = {
  pending: "Ожидает",
  applied: "Применено",
  failed: "Ошибка",
  skipped: "Пропущено",
  rolled_back: "Откачено",
};

export default function AutoActionsLog({ cabinetId }: { cabinetId: string }) {
  const [items, setItems] = useState<AutoAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data } = await supabase
      .from("ad_auto_actions")
      .select("id,campaign_id,campaign_name,entity_name,action_type,trigger,mode,reason,before_value,after_value,status,error,created_at,applied_at")
      .eq("cabinet_id", cabinetId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(((data as unknown) as AutoAction[]) || []);
    setLoading(false);
  }, [cabinetId]);

  useEffect(() => { void load(); }, [load]);

  const apply = async (id: string) => {
    setBusy(id);
    const { data, error } = await supabase.functions.invoke("ads-action-executor", { body: { action_id: id } });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Ошибка");
      return;
    }
    toast.success("Применено");
    void load();
  };

  const reject = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.from("ad_auto_actions").update({ status: "skipped" }).eq("id", id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Отклонено");
    void load();
  };

  const rollback = async (id: string) => {
    setBusy(id);
    const { data, error } = await supabase.functions.invoke("ads-action-rollback", { body: { action_id: id } });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Ошибка");
      return;
    }
    toast.success("Откачено");
    void load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
        Авто-действий за 7 дней не было.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Bot className="h-4 w-4 text-primary" />
        Авто-действия за 7 дней <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
      </div>
      {items.map((a) => {
        const meta = TYPE_LABEL[a.action_type];
        const before = (a.before_value as any)?.daily_budget;
        const after = (a.after_value as any)?.daily_budget;
        const budgetText = before && after ? ` ($${Math.round(Number(before)).toLocaleString("en-US")}→$${Math.round(Number(after)).toLocaleString("en-US")})` : "";
        return (
          <div key={a.id} className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span>{meta.icon}</span>
                  <span className="font-medium">{meta.text}{budgetText}</span>
                  <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", STATUS_STYLES[a.status])}>
                    {STATUS_LABEL[a.status]}
                  </span>
                  {a.mode === "suggest" && a.status === "pending" && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">предложение</span>
                  )}
                </div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  «{a.entity_name || a.campaign_name || a.campaign_id}»
                </div>
                {a.reason && <div className="mt-1 text-[11px] text-muted-foreground">{a.reason}</div>}
                {a.error && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3" /> {a.error}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {a.status === "pending" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => reject(a.id)} disabled={busy === a.id} className="h-7 gap-1 px-2 text-xs">
                      <X className="h-3 w-3" /> Откл.
                    </Button>
                    <Button size="sm" onClick={() => apply(a.id)} disabled={busy === a.id} className="h-7 gap-1 px-2 text-xs">
                      {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Применить
                    </Button>
                  </>
                )}
                {a.status === "applied" && (
                  <Button size="sm" variant="outline" onClick={() => rollback(a.id)} disabled={busy === a.id} className="h-7 gap-1 px-2 text-xs">
                    {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Откатить
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}