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
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Загрузка…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-6 py-12 text-center text-sm text-muted-foreground">
        Нет заявок с именем и телефоном за выбранный период. Новые лиды из WhatsApp и сайта
        появятся здесь автоматически.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">Дата</th>
            <th className="px-3 py-2.5">Имя</th>
            <th className="px-3 py-2.5">Номер</th>
            <th className="px-3 py-2.5">UTM / Креатив</th>
            <th className="px-3 py-2.5">Квал</th>
            <th className="px-3 py-2.5">Оплата</th>
            <th className="px-3 py-2.5">Услуга</th>
            <th className="px-3 py-2.5">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const busy = savingId === r.leadId;
            return (
              <tr
                key={r.leadId}
                className="border-b border-border/40 hover:bg-muted/20"
              >
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                  {format(new Date(r.createdAt), "dd.MM.yyyy", { locale: ru })}
                </td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.phone}</td>
                <td className="max-w-[180px] truncate px-3 py-2" title={r.sourceLabel ?? ""}>
                  {r.sourceLabel ?? "—"}
                </td>
                <td className="px-3 py-2">
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
                      <SelectTrigger className="h-8 w-[110px]">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[200]">
                        <SelectItem value="unset">—</SelectItem>
                        <SelectItem value="yes">Да</SelectItem>
                        <SelectItem value="no">Нет</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <ReadonlyQual value={r.isQualified} />
                  )}
                </td>
                <td className="px-3 py-2">
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
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[200]">
                        <SelectItem value="unset">—</SelectItem>
                        <SelectItem value="paid">Оплатил</SelectItem>
                        <SelectItem value="unpaid">Не оплатил</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <ReadonlyPayment value={r.paymentStatus} />
                  )}
                </td>
                <td className="px-3 py-2">
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
                          amount:
                            r.amount == null && svc
                              ? svc.defaultPrice
                              : r.amount,
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[min(180px,100%)]">
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
                <td className="px-3 py-2">
                  {editable ? (
                    <AmountCell
                      value={r.amount}
                      disabled={busy}
                      onSave={(amount) => void save(r.leadId, { amount })}
                    />
                  ) : (
                    <span className="tabular-nums">
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
  );
}

function ReadonlyQual({ value }: { value: boolean | null }) {
  if (value === true) return <span className="text-xs font-medium text-emerald-600">Да</span>;
  if (value === false) return <span className="text-xs font-medium text-muted-foreground">Нет</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function ReadonlyPayment({ value }: { value: PaymentStatus | null }) {
  if (value === "paid") return <span className="text-xs font-medium text-emerald-600">Оплатил</span>;
  if (value === "unpaid") return <span className="text-xs text-muted-foreground">Не оплатил</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
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
      <span className="pointer-events-none absolute left-2.5 text-xs text-muted-foreground">$</span>
      <Input
        type="number"
        disabled={disabled}
        className="h-8 w-[110px] pl-6 tabular-nums"
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
