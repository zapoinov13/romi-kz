import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaymentStatus, SalesAnalyticsLead, SalesService } from "@/types/salesAnalytics";
import type { SalesLeadUpdatePatch } from "@/hooks/useSalesAnalyticsLeads";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  rows: SalesAnalyticsLead[];
  services: SalesService[];
  loading?: boolean;
  editable?: boolean;
  onUpdate: (leadId: string, patch: SalesLeadUpdatePatch) => Promise<void>;
};

export function SalesLeadsTable({ rows, services, loading, editable = true, onUpdate }: Props) {
  const [savingId, setSavingId] = useState<string | null>(null);

  const save = async (leadId: string, patch: SalesLeadUpdatePatch) => {
    setSavingId(leadId);
    try {
      await onUpdate(leadId, patch);
    } catch (e) {
      toast.error((e as Error).message || "Не удалось сохранить");
    } finally {
      setSavingId(null);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-border/70 bg-card/50 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Загрузка заявок…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 px-6 py-14 text-center">
        <p className="text-sm font-medium text-foreground">Нет заявок за период</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Показываем только лиды с именем и телефоном. Новые появятся из WhatsApp и сайта.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left">
              {[
                "Дата",
                "Имя",
                "Номер",
                "Объявление",
                "Квал",
                "Оплата",
                "Услуга",
                "Сумма",
              ].map((h) => (
                <th
                  key={h}
                  className="sticky top-0 px-3.5 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const busy = savingId === r.leadId;
              return (
                <tr
                  key={r.leadId}
                  className={cn(
                    "border-b border-border/40 transition-colors last:border-0",
                    idx % 2 === 1 ? "bg-muted/15" : "bg-transparent",
                    "hover:bg-primary/[0.04]",
                    busy && "opacity-70",
                  )}
                >
                  <td className="whitespace-nowrap px-3.5 py-2.5 tabular-nums text-muted-foreground">
                    {format(new Date(r.createdAt), "dd.MM.yyyy", { locale: ru })}
                  </td>
                  <td className="px-3.5 py-2.5 font-medium text-foreground">{r.name}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 tabular-nums text-foreground/90">
                    {r.phone}
                  </td>
                  <td
                    className="max-w-[240px] truncate px-3.5 py-2.5 font-medium text-foreground/90"
                    title={
                      [r.adName ?? r.sourceLabel, r.metaAdId ? `ID: ${r.metaAdId}` : null]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                  >
                    {r.adName ??
                      (r.sourceLabel && r.sourceLabel !== "—" ? r.sourceLabel : "—")}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {editable ? (
                      <Select
                        disabled={busy}
                        value={
                          r.isQualified === true
                            ? "yes"
                            : r.isQualified === false
                              ? "no"
                              : "unset"
                        }
                        onValueChange={(v) => {
                          const isQualified =
                            v === "yes" ? true : v === "no" ? false : null;
                          void save(r.leadId, { isQualified });
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-8 w-[108px] rounded-lg border-border/60 bg-background text-xs font-medium",
                            r.isQualified === true && "border-emerald-500/40 text-emerald-700",
                            r.isQualified === false && "text-muted-foreground",
                          )}
                        >
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent position="popper" className="z-[200]">
                          <SelectItem value="unset">—</SelectItem>
                          <SelectItem value="yes">Да</SelectItem>
                          <SelectItem value="no">Нет</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusPill
                        tone={r.isQualified === true ? "ok" : r.isQualified === false ? "muted" : "empty"}
                        label={r.isQualified === true ? "Да" : r.isQualified === false ? "Нет" : "—"}
                      />
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {editable ? (
                      <Select
                        disabled={busy}
                        value={r.paymentStatus ?? "unset"}
                        onValueChange={(v) => {
                          const paymentStatus =
                            v === "paid" || v === "unpaid" ? (v as PaymentStatus) : null;
                          void save(r.leadId, { paymentStatus });
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-8 w-[128px] rounded-lg border-border/60 bg-background text-xs font-medium",
                            r.paymentStatus === "paid" && "border-emerald-500/40 text-emerald-700",
                            r.paymentStatus === "unpaid" && "text-muted-foreground",
                          )}
                        >
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent position="popper" className="z-[200]">
                          <SelectItem value="unset">—</SelectItem>
                          <SelectItem value="paid">Оплатил</SelectItem>
                          <SelectItem value="unpaid">Не оплатил</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusPill
                        tone={
                          r.paymentStatus === "paid"
                            ? "ok"
                            : r.paymentStatus === "unpaid"
                              ? "muted"
                              : "empty"
                        }
                        label={
                          r.paymentStatus === "paid"
                            ? "Оплатил"
                            : r.paymentStatus === "unpaid"
                              ? "Не оплатил"
                              : "—"
                        }
                      />
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {editable ? (
                      <Select
                        disabled={busy}
                        value={r.serviceId ?? "unset"}
                        onValueChange={(v) => {
                          if (v === "unset") {
                            void save(r.leadId, { serviceId: null });
                            return;
                          }
                          const svc = services.find((s) => s.id === v);
                          void save(r.leadId, {
                            serviceId: v,
                            amount: r.amount == null && svc ? svc.defaultPrice : r.amount,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[min(180px,100%)] rounded-lg border-border/60 bg-background text-xs">
                          <SelectValue placeholder="Выберите" />
                        </SelectTrigger>
                        <SelectContent position="popper" className="z-[200]">
                          <SelectItem value="unset">—</SelectItem>
                          {services.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">
                        {services.find((s) => s.id === r.serviceId)?.name ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {editable ? (
                      <AmountCell
                        value={r.amount}
                        disabled={busy}
                        onSave={(amount) => void save(r.leadId, { amount })}
                      />
                    ) : (
                      <span className="font-medium tabular-nums">
                        {r.amount != null ? fmtMoney(r.amount) : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "muted" | "empty";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "ok" && "bg-emerald-500/12 text-emerald-700",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "empty" && "bg-muted/60 text-muted-foreground/80",
      )}
    >
      {label}
    </span>
  );
}

function AmountCell({
  value,
  disabled,
  onSave,
}: {
  value: number | null;
  disabled?: boolean;
  onSave: (amount: number | null) => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const commit = () => {
    if (disabled) return;
    const num = draft === "" ? null : Number(draft);
    if (draft !== "" && !Number.isFinite(num)) return;
    if (num !== value) onSave(num);
  };

  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-2.5 text-xs font-medium text-muted-foreground">
        $
      </span>
      <Input
        type="number"
        disabled={disabled}
        className="h-8 w-[112px] rounded-lg border-border/60 bg-background pl-6 tabular-nums"
        placeholder="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
            commit();
          }
        }}
      />
    </div>
  );
}
