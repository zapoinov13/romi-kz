import type { ReportPeriodRange } from "@/hooks/useReportData";

export type PeriodPresetId = "today" | "yesterday" | "thisWeek" | "lastWeek" | "month";

export type PeriodPreset = {
  id: PeriodPresetId;
  label: string;
  getRange: () => ReportPeriodRange;
};

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function rangesEqual(a: ReportPeriodRange, b: ReportPeriodRange): boolean {
  return sameDay(a.from, b.from) && sameDay(a.to, b.to);
}

function dayRange(d: Date): ReportPeriodRange {
  const day = startOfDay(d);
  return { from: day, to: day };
}

/** Понедельник той же недели (ISO). */
export function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const weekday = x.getDay();
  const diff = weekday === 0 ? 6 : weekday - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

export function todayRange(): ReportPeriodRange {
  return dayRange(new Date());
}

export function yesterdayRange(): ReportPeriodRange {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayRange(d);
}

/** Пн → сегодня. */
export function thisWeekRange(): ReportPeriodRange {
  return { from: startOfWeekMonday(new Date()), to: startOfDay(new Date()) };
}

/** Прошлый полный понедельник — воскресенье. */
export function lastWeekRange(): ReportPeriodRange {
  const thisMon = startOfWeekMonday(new Date());
  const from = new Date(thisMon);
  from.setDate(from.getDate() - 7);
  const to = new Date(thisMon);
  to.setDate(to.getDate() - 1);
  return { from, to };
}

export function monthRange(date: Date): ReportPeriodRange {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from, to };
}

export function currentMonthRange(): ReportPeriodRange {
  return monthRange(new Date());
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  { id: "today", label: "Сегодня", getRange: todayRange },
  { id: "yesterday", label: "Вчера", getRange: yesterdayRange },
  { id: "thisWeek", label: "Эта неделя (пн → сегодня)", getRange: thisWeekRange },
  { id: "lastWeek", label: "Прошлая неделя (пн–вс)", getRange: lastWeekRange },
  { id: "month", label: "Месяц", getRange: currentMonthRange },
];

export function matchPeriodPreset(range: ReportPeriodRange): PeriodPresetId | null {
  for (const p of PERIOD_PRESETS) {
    if (rangesEqual(range, p.getRange())) return p.id;
  }
  return null;
}

export function dateRangeToIso(range: ReportPeriodRange): { since: string; until: string } {
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { since: fmt(range.from), until: fmt(range.to) };
}

export function inDateRange(iso: string, since: string, until: string): boolean {
  const day = iso.slice(0, 10);
  return day >= since && day <= until;
}

/**
 * Локальный календарный день для timestamp из базы (UTC ISO).
 * `iso.slice(0,10)` даёт UTC-дату, из-за чего лид, созданный ночью по местному
 * времени, попадал в предыдущий день и «терялся» в графиках и фильтрах.
 */
export function localDayOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return isoDateLocal(d);
}

/** Тот же inDateRange, но по локальному дню timestamp. */
export function inDateRangeLocal(iso: string, since: string, until: string): boolean {
  const day = localDayOf(iso);
  return day >= since && day <= until;
}


export function rangeSpanDays(range: ReportPeriodRange): number {
  const ms = startOfDay(range.to).getTime() - startOfDay(range.from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function shiftRange(range: ReportPeriodRange, deltaDays: number): ReportPeriodRange {
  const from = new Date(range.from);
  const to = new Date(range.to);
  from.setDate(from.getDate() + deltaDays);
  to.setDate(to.getDate() + deltaDays);
  return { from: startOfDay(from), to: startOfDay(to) };
}

export function isFullMonthRange(range: ReportPeriodRange): boolean {
  const expected = monthRange(range.from);
  return rangesEqual(range, expected);
}

/** Все календарные дни в диапазоне включительно. */
export function eachDayInRange(range: ReportPeriodRange): Date[] {
  const days: Date[] = [];
  const cur = startOfDay(range.from);
  const end = startOfDay(range.to);
  while (cur.getTime() <= end.getTime()) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Начало дня from (вкл.) и конец дня to (вкл.) в миллисекундах. */
export function periodTimeBounds(range: ReportPeriodRange): { start: number; end: number } {
  const start = startOfDay(range.from).getTime();
  const end = startOfDay(range.to).getTime() + 86_400_000 - 1;
  return { start, end };
}

export function isTimestampInPeriod(ts: number, range: ReportPeriodRange): boolean {
  const { start, end } = periodTimeBounds(range);
  return ts >= start && ts <= end;
}
