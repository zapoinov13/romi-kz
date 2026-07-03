import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ReportPeriodRange } from "@/hooks/useReportData";
import {
  PERIOD_PRESETS,
  currentMonthRange,
  isFullMonthRange,
  matchPeriodPreset,
  monthRange,
  rangeSpanDays,
  sameDay,
  shiftRange,
  type PeriodPresetId,
} from "@/lib/periodRange";

export {
  currentMonthRange,
  monthRange,
  todayRange,
  yesterdayRange,
  thisWeekRange,
  lastWeekRange,
} from "@/lib/periodRange";

const MONTHS_RU = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

const MONTHS_RU_FULL = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatDay(d: Date): string {
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}.`;
}

function formatRangeLabel(range: ReportPeriodRange): string {
  const preset = matchPeriodPreset(range);
  if (preset === "today") return "Сегодня";
  if (preset === "yesterday") return "Вчера";

  const { from, to } = range;
  if (sameDay(from, to)) {
    return `${formatDay(from)} ${from.getFullYear()}`;
  }
  if (isFullMonthRange(range)) {
    const lastDay = to.getDate();
    return `1 ${MONTHS_RU[from.getMonth()]}. – ${lastDay} ${MONTHS_RU[from.getMonth()]}. ${from.getFullYear()}`;
  }
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()} – ${to.getDate()} ${MONTHS_RU_FULL[to.getMonth()]} ${to.getFullYear()}`;
  }
  return `${formatDay(from)} – ${formatDay(to)} ${to.getFullYear()}`;
}

function formatRangeLabelShort(range: ReportPeriodRange): string {
  const preset = matchPeriodPreset(range);
  if (preset === "today") return "Сегодня";
  if (preset === "yesterday") return "Вчера";
  if (isFullMonthRange(range)) {
    return `${MONTHS_RU[range.from.getMonth()]} ${range.from.getFullYear()}`;
  }
  if (sameDay(range.from, range.to)) {
    return formatDay(range.from);
  }
  return `${range.from.getDate()}–${range.to.getDate()} ${MONTHS_RU[range.to.getMonth()]}.`;
}

interface Props {
  range: ReportPeriodRange;
  onChange: (range: ReportPeriodRange) => void;
  className?: string;
  /** Быстрые пресеты: сегодня, вчера, недели */
  showPresets?: boolean;
}

export function PeriodPicker({ range, onChange, className, showPresets = false }: Props) {
  const [open, setOpen] = useState(false);
  const activePreset = useMemo(() => matchPeriodPreset(range), [range]);

  const calendarRange: DateRange = { from: range.from, to: range.to };

  const shiftPeriod = (direction: -1 | 1) => {
    if (isFullMonthRange(range)) {
      const next = new Date(range.from.getFullYear(), range.from.getMonth() + direction, 1);
      onChange(monthRange(next));
      return;
    }
    const span = rangeSpanDays(range);
    onChange(shiftRange(range, direction * span));
  };

  const applyPreset = (id: PeriodPresetId) => {
    const preset = PERIOD_PRESETS.find((p) => p.id === id);
    if (preset) onChange(preset.getRange());
  };

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <div className="inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-border/60 bg-card/60 px-1 py-1 sm:gap-1 sm:rounded-2xl sm:px-2 sm:py-1.5">
        <button
          type="button"
          onClick={() => shiftPeriod(-1)}
          className="grid h-8 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:h-9 sm:w-9 sm:rounded-xl"
          aria-label="Предыдущий период"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold tabular-nums whitespace-nowrap transition-colors hover:bg-secondary sm:gap-2 sm:rounded-xl sm:px-3 sm:text-sm"
              aria-label="Выбрать период"
            >
              <CalendarDays className="hidden h-4 w-4 text-muted-foreground sm:inline" />
              <span className="sm:hidden">{formatRangeLabelShort(range)}</span>
              <span className="hidden sm:inline">{formatRangeLabel(range)}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="flex flex-col sm:flex-row">
              {showPresets && (
                <div className="flex flex-row gap-1 overflow-x-auto border-b border-border/60 p-2 sm:w-[148px] sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
                  {PERIOD_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onChange(p.getRange());
                        setOpen(false);
                      }}
                      className={cn(
                        "shrink-0 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        activePreset === p.id
                          ? "bg-primary font-medium text-primary-foreground"
                          : "text-foreground hover:bg-secondary",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
              <Calendar
                mode="range"
                selected={calendarRange}
                onSelect={(selected) => {
                  if (selected?.from && selected?.to) {
                    onChange({ from: selected.from, to: selected.to });
                    setOpen(false);
                  } else if (selected?.from) {
                    onChange({ from: selected.from, to: selected.from });
                  }
                }}
                defaultMonth={range.from}
                numberOfMonths={1}
                initialFocus
                className="pointer-events-auto p-3"
              />
            </div>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={() => shiftPeriod(1)}
          className="grid h-8 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:h-9 sm:w-9 sm:rounded-xl"
          aria-label="Следующий период"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {showPresets && (
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activePreset === p.id
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
