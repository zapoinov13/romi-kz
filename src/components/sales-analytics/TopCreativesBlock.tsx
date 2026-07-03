import type { TopCreativeRow } from "@/types/salesAnalytics";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");
const fmtTenge = (n: number) => `${fmt(n)} ₸`;

type Props = { items: TopCreativeRow[] };

export function TopCreativesBlock({ items }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
      <h3 className="mb-3 text-sm font-semibold">Топ-3 креатива</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет данных за период</p>
      ) : (
        <ol className="space-y-3">
          {items.map((c, i) => (
            <li key={c.key} className="text-sm">
              <div className="font-medium">
                {i + 1}. {c.label}
              </div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>• {fmt(c.leads)} лидов</li>
                <li>• {fmt(c.sales)} продаж</li>
                <li>• {fmtTenge(c.revenue)}</li>
                <li>• конверсия в оплату {c.conversion.toFixed(1)}%</li>
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
