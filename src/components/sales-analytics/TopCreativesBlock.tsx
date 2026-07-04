import { Megaphone } from "lucide-react";
import type { TopCreativeRow } from "@/types/salesAnalytics";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

type Props = { items: TopCreativeRow[] };

export function TopCreativesBlock({ items }: Props) {
  const maxRevenue = Math.max(...items.map((i) => i.revenue), 1);

  return (
    <div className="h-full rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/70 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/12 text-sky-600">
          <Megaphone className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Топ объявлений</h3>
          <p className="text-[11px] text-muted-foreground">Креативы Meta · по выручке</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          Нет данных за период
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((c, i) => (
            <li
              key={c.key}
              className="rounded-xl border border-border/50 bg-background/60 p-3 transition-colors hover:bg-background"
            >
              <div className="mb-2 flex items-start gap-2.5">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
                    i === 0
                      ? "bg-amber-500/15 text-amber-700"
                      : i === 1
                        ? "bg-slate-400/15 text-slate-600"
                        : "bg-orange-500/10 text-orange-700",
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground" title={c.label}>
                    {c.label}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{fmt(c.leads)} лидов</span>
                    <span>{fmt(c.sales)} продаж</span>
                    <span className="font-medium text-emerald-600">{fmtMoney(c.revenue)}</span>
                    <span>{c.conversion.toFixed(1)}% в оплату</span>
                  </div>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400"
                  style={{ width: `${Math.max(8, (c.revenue / maxRevenue) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
