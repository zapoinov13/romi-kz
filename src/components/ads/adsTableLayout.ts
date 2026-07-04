/** Фиксированные доли колонок — шапка и строки в одной <table>. */
export const ADS_COL_WIDTHS = [
  "26%", // кабинет
  "11%", // расходы
  "10%", // клики
  "10%", // ватсап
  "12%", // лиды с сайта
  "13%", // стоимость лида
  "18%", // действия
] as const;

export const ADS_TH =
  "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

export const ADS_TD_NUM =
  "px-3 py-3 text-right text-sm font-semibold tabular-nums whitespace-nowrap";
