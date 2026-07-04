import { Briefcase } from "lucide-react";
import type { TopServiceRow } from "@/types/salesAnalytics";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

type Props = { items: TopServiceRow[] };

export function TopServicesBlock({ items }: Props) {
  const maxRevenue = Math.max(...items.map((i) => i.revenue), 1);

  return (
    <div className="h-full rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/70 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/12 text-violet-600">
          <Briefcase className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Топ услуг</h3>
          <p className="text-[11px] text-muted-foreground">По выручке за период</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          Нет оплат за период
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((s, i) => (
            <li
              key={s.serviceId}
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
                  <div className="truncate text-sm font-semibold text-foreground" title={s.name}>
                    {s.name}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{fmt(s.sales)} продаж</span>
                    <span className="font-medium text-emerald-600">{fmtMoney(s.revenue)}</span>
                    <span>чек {fmtMoney(s.avgCheck)}</span>
                  </div>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400"
                  style={{ width: `${Math.max(8, (s.revenue / maxRevenue) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
