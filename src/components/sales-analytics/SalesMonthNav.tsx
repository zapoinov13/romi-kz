import { ChevronLeft, ChevronRight } from "lucide-react";
import { PeriodPicker, monthRange } from "@/components/dashboard/PeriodPicker";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import { cn } from "@/lib/utils";

const MONTHS_NOM = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function monthLabel(d: Date) {
  return MONTHS_NOM[d.getMonth()];
}

type Props = {
  range: ReportPeriodRange;
  onChange: (r: ReportPeriodRange) => void;
  className?: string;
};

export function SalesMonthNav({ range, onChange, className }: Props) {
  const prev = new Date(range.from.getFullYear(), range.from.getMonth() - 1, 1);
  const next = new Date(range.from.getFullYear(), range.from.getMonth() + 1, 1);
  const cur = monthLabel(range.from);

  const go = (d: Date) => onChange(monthRange(d));

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <PeriodPicker range={range} onChange={onChange} />
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => go(prev)}
          className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {monthLabel(prev)}
        </button>
        <span className="px-2 font-semibold text-foreground">{cur}</span>
        <button
          type="button"
          onClick={() => go(next)}
          className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 hover:bg-secondary hover:text-foreground"
        >
          {monthLabel(next)}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
