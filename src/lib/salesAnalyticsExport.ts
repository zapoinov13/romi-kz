import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { SalesAnalyticsLead, SalesService } from "@/types/salesAnalytics";

const QUAL_LABEL = (v: boolean | null) =>
  v === true ? "Да" : v === false ? "Нет" : "";

const PAY_LABEL = (v: string | null) =>
  v === "paid" ? "Оплатил" : v === "unpaid" ? "Не оплатил" : "";

export function exportSalesLeadsCsv(
  rows: SalesAnalyticsLead[],
  services: SalesService[],
  filenameStem: string,
) {
  const svcMap = new Map(services.map((s) => [s.id, s.name]));
  const header = [
    "Дата",
    "Имя",
    "Номер",
    "UTM / Креатив",
    "Квал",
    "Статус оплаты",
    "Тип услуги",
    "Сумма",
  ];
  const lines = rows.map((r) => [
    format(new Date(r.createdAt), "dd.MM.yyyy", { locale: ru }),
    r.name,
    r.phone,
    r.sourceLabel ?? "",
    QUAL_LABEL(r.isQualified),
    PAY_LABEL(r.paymentStatus),
    r.serviceId ? (svcMap.get(r.serviceId) ?? "") : "",
    r.amount != null ? String(Math.round(r.amount)) : "",
  ]);
  const csv = [header, ...lines]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameStem}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
