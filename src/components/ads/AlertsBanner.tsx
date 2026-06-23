import { useEffect, useState } from "react";
import { AlertTriangle, AlertCircle, Check, Clock, Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  cabinet_id: string;
  campaign_id: string | null;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string | null;
  reasons: string[];
  metrics: Record<string, number | null>;
  fire_count: number;
  last_fired_at: string;
  snoozed_until: string | null;
};

export const AlertsBanner = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [pendingActions, setPendingActions] = useState<{ id: string; campaign_name: string | null; action_type: string; reason: string | null }[]>([]);
  const [applyingAll, setApplyingAll] = useState(false);

  const load = async () => {
    const [{ data: a }, { data: p }] = await Promise.all([
      supabase
      .from("ad_alerts")
      .select("id,cabinet_id,campaign_id,severity,title,body,reasons,metrics,fire_count,last_fired_at,snoozed_until")
      .is("resolved_at", null)
      .is("acknowledged_at", null)
      .order("last_fired_at", { ascending: false })
      .limit(50),
      supabase
        .from("ad_auto_actions")
        .select("id,campaign_name,action_type,reason")
        .eq("status", "pending")
        .eq("mode", "suggest")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setAlerts(((a as unknown) as Alert[]) || []);
    setPendingActions((p as any) || []);
  };

  useEffect(() => { void load(); }, []);

  const act = async (id: string, action: "ack" | "snooze") => {
    const patch =
      action === "ack"
        ? { acknowledged_at: new Date().toISOString(), snoozed_until: null }
        : { snoozed_until: new Date(Date.now() + 4 * 3600 * 1000).toISOString() };
    const { error } = await supabase.from("ad_alerts").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else {
      setAlerts((a) => a.filter((x) => x.id !== id));
      toast.success(action === "ack" ? "Подтверждено" : "Отложено на 4ч");
    }
  };

  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;

  if (alerts.length === 0 && pendingActions.length === 0) return null;

  const applyAll = async () => {
    setApplyingAll(true);
    let ok = 0, fail = 0;
    for (const a of pendingActions) {
      const { data, error } = await supabase.functions.invoke("ads-action-executor", { body: { action_id: a.id } });
      if (error || (data as any)?.error) fail++; else ok++;
    }
    setApplyingAll(false);
    toast.success(`Применено: ${ok}${fail ? `, ошибок: ${fail}` : ""}`);
    void load();
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60">
      {pendingActions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold">Предложения авто-режима</div>
              <div className="text-[11px] text-muted-foreground">
                {pendingActions.length} ожидают подтверждения
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={applyAll}
            disabled={applyingAll}
            className="flex h-8 items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {applyingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Применить все
          </button>
        </div>
      )}
      {alerts.length > 0 && (
        <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">Алерты по рекламе</div>
            <div className="text-[11px] text-muted-foreground">
              {critical > 0 && <span className="text-destructive">🔴 {critical} критичных</span>}
              {critical > 0 && warning > 0 && " • "}
              {warning > 0 && <span className="text-warning">🟡 {warning} предупреждений</span>}
            </div>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Скрыть" : "Показать"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 p-3">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between",
                a.severity === "critical"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-warning/30 bg-warning/5",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertCircle
                    className={cn(
                      "h-3.5 w-3.5",
                      a.severity === "critical" ? "text-destructive" : "text-warning",
                    )}
                  />
                  {a.title}
                  {a.fire_count > 1 && (
                    <span className="rounded-full bg-muted px-1.5 text-[10px]">×{a.fire_count}</span>
                  )}
                </div>
                {a.body && <div className="mt-1 text-[12px] text-muted-foreground">{a.body}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => act(a.id, "snooze")}
                  className="flex h-8 items-center gap-1 rounded-lg border border-border/60 bg-background px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Clock className="h-3 w-3" /> 4ч
                </button>
                <button
                  type="button"
                  onClick={() => act(a.id, "ack")}
                  className="flex h-8 items-center gap-1 rounded-lg border border-success/30 bg-success/10 px-2.5 text-xs font-semibold text-success hover:bg-success/20"
                >
                  <Check className="h-3 w-3" /> Подтвердить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default AlertsBanner;