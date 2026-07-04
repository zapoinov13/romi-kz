import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SalesAnalyticsLead, SalesService } from "@/types/salesAnalytics";
import { fmtMoney } from "@/lib/format";

type Props = {
  rows: SalesAnalyticsLead[];
  services: SalesService[];
  loading?: boolean;
  editable?: boolean;
  onUpdate: (
    leadId: string,
    patch: Partial<Pick<SalesAnalyticsLead, "isQualified" | "paymentStatus" | "serviceId" | "amount">>,
  ) => Promise<void>;
};

export function SalesLeadsTable({ rows, services, loading, editable = true, onUpdate }: Props) {
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
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">Дата</th>
            <th className="px-3 py-2.5">Имя</th>
            <th className="px-3 py-2.5">Номер</th>
            <th className="px-3 py-2.5">UTM / Креатив</th>
            <th className="px-3 py-2.5">Квал</th>
            <th className="px-3 py-2.5">Статус оплаты</th>
            <th className="px-3 py-2.5">Тип услуги</th>
            <th className="px-3 py-2.5">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.leadId} className="border-b border-border/40 hover:bg-muted/20">
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
                  <YesNoToggle
                    value={r.isQualified}
                    onChange={(val) => void onUpdate(r.leadId, { isQualified: val })}
                  />
                ) : (
                  <ReadonlyQual value={r.isQualified} />
                )}
              </td>
              <td className="px-3 py-2">
                {editable ? (
                  <PaymentToggle
                    value={r.paymentStatus}
                    onChange={(val) => void onUpdate(r.leadId, { paymentStatus: val })}
                  />
                ) : (
                  <ReadonlyPayment value={r.paymentStatus} />
                )}
              </td>
              <td className="px-3 py-2">
                {editable ? (
                  <Select
                    value={r.serviceId ?? "unset"}
                    onValueChange={(v) => {
                      if (v === "unset") {
                        void onUpdate(r.leadId, { serviceId: null });
                        return;
                      }
                      const svc = services.find((s) => s.id === v);
                      void onUpdate(r.leadId, {
                        serviceId: v,
                        amount: svc && r.amount == null ? svc.defaultPrice : r.amount,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 w-[min(160px,100%)]">
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
                    onSave={(amount) => void onUpdate(r.leadId, { amount })}
                  />
                ) : (
                  <span className="tabular-nums">
                    {r.amount != null ? fmtMoney(r.amount) : "—"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toggleBtn(active: boolean, side: "left" | "right") {
  return cn(
    "px-2.5 py-1 text-xs font-medium transition-colors",
    side === "left" ? "rounded-l-md" : "rounded-r-md",
    active
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );
}

function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-md border border-border/60 bg-background p-0.5"
      role="group"
      aria-label="Квалификация"
    >
      <button
        type="button"
        className={toggleBtn(value === true, "left")}
        onClick={() => onChange(value === true ? null : true)}
      >
        Да
      </button>
      <button
        type="button"
        className={toggleBtn(value === false, "right")}
        onClick={() => onChange(value === false ? null : false)}
      >
        Нет
      </button>
    </div>
  );
}

function PaymentToggle({
  value,
  onChange,
}: {
  value: "paid" | "unpaid" | null;
  onChange: (v: "paid" | "unpaid" | null) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-md border border-border/60 bg-background p-0.5"
      role="group"
      aria-label="Статус оплаты"
    >
      <button
        type="button"
        className={toggleBtn(value === "paid", "left")}
        onClick={() => onChange(value === "paid" ? null : "paid")}
      >
        Оплатил
      </button>
      <button
        type="button"
        className={toggleBtn(value === "unpaid", "right")}
        onClick={() => onChange(value === "unpaid" ? null : "unpaid")}
      >
        Нет
      </button>
    </div>
  );
}

function ReadonlyQual({ value }: { value: boolean | null }) {
  if (value === true) return <span className="text-xs font-medium text-emerald-600">Да</span>;
  if (value === false) return <span className="text-xs font-medium text-muted-foreground">Нет</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function ReadonlyPayment({ value }: { value: "paid" | "unpaid" | null }) {
  if (value === "paid") return <span className="text-xs font-medium text-emerald-600">Оплатил</span>;
  if (value === "unpaid") return <span className="text-xs text-muted-foreground">Не оплатил</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function AmountCell({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (amount: number | null) => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const commit = () => {
    const num = draft === "" ? null : Number(draft);
    if (draft !== "" && !Number.isFinite(num)) return;
    if (num !== value) onSave(num);
  };

  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-2.5 text-xs text-muted-foreground">$</span>
      <Input
        type="number"
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
