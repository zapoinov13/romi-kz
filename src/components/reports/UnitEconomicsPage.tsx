import { BarChart3, Lock, ShoppingCart, TrendingUp, Users, Wallet } from "lucide-react";
import type { ReportData } from "@/hooks/useReportData";
import { ReportPageWrapper } from "./ReportPageWrapper";
import { SectionTitle } from "./SectionTitle";
import { reportFmt } from "./reportFormat";

interface Props {
  data: ReportData;
  rangeLabel: string;
}

function EcoRow({
  icon: Icon, title, sub, value,
}: { icon: typeof BarChart3; title: string; sub: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/30 px-2 py-4 last:border-0">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-success/15 text-success">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function UnitEconomicsPage({ data, rangeLabel }: Props) {
  const { totals } = data;
  const noRevenue = totals.revenue === 0;

  return (
    <ReportPageWrapper
      title="Все проекты"
      rangeLabel={rangeLabel}
      pageNumber={2}
      pageTotal={2}
      rightLabel="Продажи и юнит-экономика"
    >
      <div>
        <SectionTitle>Юнит-экономика</SectionTitle>
        <div className="rounded-2xl border border-border/40 bg-card/30 px-4">
          <EcoRow icon={BarChart3} title="Финансовая сводка" sub={`Unit Economics · ${rangeLabel}`} value="" />
          <EcoRow icon={Wallet} title="Общая выручка" sub="оплаты + диагностики за период" value={reportFmt.fmtTenge(totals.revenue)} />
          <EcoRow icon={ShoppingCart} title="Средний чек" sub="выручка ÷ число продаж" value={totals.sales > 0 ? reportFmt.fmtTenge(totals.aov) : "—"} />
          <EcoRow icon={Users} title="Стоимость клиента" sub="расход ÷ продажи (CAC)" value={totals.sales > 0 ? reportFmt.fmtTenge(totals.cac) : "—"} />
          <EcoRow icon={TrendingUp} title="Окупаемость рекламы" sub="(выручка − расход) ÷ расход (ROMI)" value={`${totals.romi >= 0 ? "+" : ""}${Math.round(totals.romi)}%`} />
        </div>
      </div>

      {noRevenue && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
          <Lock className="h-3.5 w-3.5" />
          Данные о выручке не переданы. ROMI и Средний чек рассчитаны как 0.
        </div>
      )}
    </ReportPageWrapper>
  );
}