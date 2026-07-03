import type { TopServiceRow } from "@/types/salesAnalytics";
import { fmtMoney as fmtTenge } from "@/lib/format";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

type Props = { items: TopServiceRow[] };

export function TopServicesBlock({ items }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
      <h3 className="mb-3 text-sm font-semibold">Топ-3 услуги</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет оплат за период</p>
      ) : (
        <ol className="space-y-3">
          {items.map((s, i) => (
            <li key={s.serviceId} className="text-sm">
              <div className="font-medium">
                {i + 1}. {s.name}
              </div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>• {fmt(s.sales)} продаж</li>
                <li>• {fmtTenge(s.revenue)} выручка</li>
                <li>• средний чек {fmtTenge(s.avgCheck)}</li>
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
