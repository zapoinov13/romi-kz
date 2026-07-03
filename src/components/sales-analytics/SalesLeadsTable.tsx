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

type Props = {
  rows: SalesAnalyticsLead[];
  services: SalesService[];
  loading?: boolean;
  onUpdate: (
    leadId: string,
    patch: Partial<Pick<SalesAnalyticsLead, "isQualified" | "paymentStatus" | "serviceId" | "amount">>,
  ) => Promise<void>;
};

export function SalesLeadsTable({ rows, services, loading, onUpdate }: Props) {
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
        Нет заявок за выбранный период. Новые лиды из WhatsApp и сайта появятся автоматически.
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
            <tr
              key={r.leadId}
              className={cn(
                "border-b border-border/40 hover:bg-muted/20",
                r.isSynthetic && "bg-muted/30",
              )}
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
                {r.isSynthetic ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                <Select
                  value={r.isQualified === true ? "yes" : r.isQualified === false ? "no" : "unset"}
                  onValueChange={(v) => {
                    const val = v === "yes" ? true : v === "no" ? false : null;
                    void onUpdate(r.leadId, { isQualified: val });
                  }}
                >
                  <SelectTrigger className="h-8 w-[100px]">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    <SelectItem value="yes">Да</SelectItem>
                    <SelectItem value="no">Нет</SelectItem>
                  </SelectContent>
                </Select>
                )}
              </td>
              <td className="px-3 py-2">
                {r.isSynthetic ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                <Select
                  value={r.paymentStatus ?? "unset"}
                  onValueChange={(v) => {
                    const val = v === "paid" ? "paid" : v === "unpaid" ? "unpaid" : null;
                    void onUpdate(r.leadId, { paymentStatus: val });
                  }}
                >
                  <SelectTrigger className="h-8 w-[130px]">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    <SelectItem value="paid">Оплатил</SelectItem>
                    <SelectItem value="unpaid">Не оплатил</SelectItem>
                  </SelectContent>
                </Select>
                )}
              </td>
              <td className="px-3 py-2">
                {r.isSynthetic ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
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
                  <SelectTrigger className="h-8 w-[160px]">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </td>
              <td className="px-3 py-2">
                {r.isSynthetic ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                <AmountCell
                  value={r.amount}
                  onSave={(amount) => void onUpdate(r.leadId, { amount })}
                />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  return (
    <Input
      type="number"
      className="h-8 w-[120px] tabular-nums"
      placeholder="0"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const num = draft === "" ? null : Number(draft);
        if (num !== value) onSave(num);
      }}
    />
  );
}
