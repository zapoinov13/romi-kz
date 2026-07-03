import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import { cn } from "@/lib/utils";

type Props = {
  range: ReportPeriodRange;
  onChange: (r: ReportPeriodRange) => void;
  className?: string;
};

export function SalesMonthNav({ range, onChange, className }: Props) {
  return (
    <PeriodPicker
      range={range}
      onChange={onChange}
      showPresets
      className={cn("items-end", className)}
    />
  );
}
