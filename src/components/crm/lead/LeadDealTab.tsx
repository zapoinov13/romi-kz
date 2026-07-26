import { useEffect, useState } from "react";
import { Calendar, Megaphone, CreditCard, Wallet, Layers, BadgeCheck, Stethoscope } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSalesServices } from "@/hooks/useSalesServices";
import type { Lead, LeadStage, PaymentMethod } from "@/types/crm";

const SOURCE_PRESETS: { id: string; label: string }[] = [
  { id: "meta", label: "Meta" },
  { id: "google", label: "Google" },
  { id: "tiktok", label: "TikTok" },
  { id: "sarafan", label: "Сарафан" },
];
const PRESET_IDS = new Set(SOURCE_PRESETS.map((s) => s.id));

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "kaspi", label: "Kaspi" },
  { id: "card", label: "Карта" },
  { id: "cash", label: "Наличные" },
  { id: "transfer", label: "Перевод" },
];

function toLocalInputValue(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatKzt(n: number) {
  if (!n) return "";
  return n.toLocaleString("ru-RU");
}

interface Props {
  lead: Lead;
  stages?: LeadStage[];
  onUpdate: (patch: Partial<Lead>) => void;
  onChangeStage?: (stageId: string) => void;
}

export function LeadDealTab({ lead, stages, onUpdate, onChangeStage }: Props) {
  const { activeServices } = useSalesServices();
  const sourceKey = (lead.source ?? "").toLowerCase();
  const activePreset = PRESET_IDS.has(sourceKey) ? sourceKey : null;

  const [pendingStage, setPendingStage] = useState<string>(lead.stageId);
  const [amountDraft, setAmountDraft] = useState(lead.amount ? formatKzt(lead.amount) : "");

  useEffect(() => { setPendingStage(lead.stageId); }, [lead.stageId, lead.id]);
  useEffect(() => { setAmountDraft(lead.amount ? formatKzt(lead.amount) : ""); }, [lead.amount, lead.id]);

  const applyStage = (sid: string) => {
    setPendingStage(sid);
    if (sid !== lead.stageId) onChangeStage?.(sid);
  };

  return (
    <div className="space-y-3">
      {/* Этап — быстрые чипы */}
      {stages && stages.length > 0 && onChangeStage && (
        <div className="rounded-2xl border border-border/60 bg-card/50 p-3 shadow-sm shadow-black/[0.02]">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" /> Этап сделки
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {stages.map((s) => {
              const active = s.id === lead.stageId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => applyStage(s.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "border-border/60 bg-background/80 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {s.title}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Select value={pendingStage} onValueChange={setPendingStage}>
              <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              disabled={pendingStage === lead.stageId}
              onClick={() => onChangeStage(pendingStage)}
              className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              Перенести
            </button>
          </div>
        </div>
      )}

      {/* Квал + сумма */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" /> Квал
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                lead.isQualified === true && "bg-success/15 text-success",
                lead.isQualified === false && "bg-destructive/10 text-destructive",
                lead.isQualified == null && "bg-secondary text-muted-foreground",
              )}>
                {lead.isQualified === true ? "да" : lead.isQualified === false ? "нет" : "авто"}
              </span>
              <Switch
                checked={lead.isQualified === true}
                onCheckedChange={(v) => onUpdate({ isQualified: v })}
              />
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Синхрон с «Аналитика продаж». Переключите, чтобы зафиксировать да/нет.
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3.5 w-3.5 text-primary" /> Сумма сделки
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              value={amountDraft}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d\s]/g, "");
                setAmountDraft(raw);
                const digits = raw.replace(/\s/g, "");
                onUpdate({ amount: digits ? Number(digits) : 0 });
              }}
              onBlur={() => setAmountDraft(lead.amount ? formatKzt(lead.amount) : "")}
              placeholder="0"
              className="text-xl font-bold tabular-nums"
              aria-label="Сумма сделки"
            />
            <span className="shrink-0 rounded-lg bg-secondary/80 px-2 py-1 text-xs font-bold text-muted-foreground">₸</span>
          </div>
        </div>
      </div>

      {/* Тип услуги */}
      {activeServices.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Stethoscope className="h-3.5 w-3.5 text-primary" /> Тип услуги
          </div>
          <Select
            value={lead.serviceId ?? "unset"}
            onValueChange={(v) => {
              if (v === "unset") {
                onUpdate({ serviceId: null, service: undefined });
                return;
              }
              const svc = activeServices.find((s) => s.id === v);
              onUpdate({
                serviceId: v,
                service: svc?.name,
                amount: svc && !lead.amount ? svc.defaultPrice : lead.amount,
              });
            }}
          >
            <SelectTrigger className="mt-2"><SelectValue placeholder="Выберите услугу" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">—</SelectItem>
              {activeServices.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.defaultPrice ? ` · ${formatKzt(s.defaultPrice)} ₸` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Источник и визит */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Megaphone className="h-3.5 w-3.5 text-primary" /> Источник
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {SOURCE_PRESETS.map((s) => {
              const active = activePreset === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onUpdate({ source: s.id })}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-xs font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary/15 text-primary shadow-sm"
                      : "border-border/60 bg-background/70 hover:border-primary/40 hover:bg-primary/5",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {!activePreset && lead.source && (
            <div className="mt-2 text-[10px] text-muted-foreground">
              Сейчас: <span className="font-mono text-foreground/80">{lead.source}</span>
              <span className="ml-1 opacity-70">(из UTM — выберите вручную, чтобы перезаписать)</span>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-warning" /> Планируемый визит
          </div>
          <Input
            type="datetime-local"
            value={toLocalInputValue(lead.nextVisitAt)}
            onChange={(e) => onUpdate({ nextVisitAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className="mt-2"
          />
          {lead.nextVisitAt && (
            <div className="mt-1.5 text-[11px] font-medium text-foreground/80">
              {new Date(lead.nextVisitAt).toLocaleString("ru-RU", {
                day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
              })}
            </div>
          )}
        </div>
      </div>

      {/* Оплата */}
      <div className={cn(
        "rounded-2xl border p-3",
        lead.paid ? "border-success/30 bg-success/5" : "border-border/60 bg-card/50",
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5 text-success" /> Оплата
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("font-semibold", lead.paid ? "text-success" : "text-muted-foreground")}>
              {lead.paid ? "оплачено" : "не оплачено"}
            </span>
            <Switch
              checked={!!lead.paid}
              onCheckedChange={(v) =>
                onUpdate({
                  paid: v,
                  paidAt: v ? (lead.paidAt ?? new Date().toISOString()) : undefined,
                })
              }
            />
          </div>
        </div>
        {lead.paid && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Способ</label>
              <Select
                value={lead.paymentMethod ?? "kaspi"}
                onValueChange={(v) => onUpdate({ paymentMethod: v as PaymentMethod })}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Дата оплаты</label>
              <Input
                type="datetime-local"
                value={toLocalInputValue(lead.paidAt)}
                onChange={(e) => onUpdate({ paidAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
