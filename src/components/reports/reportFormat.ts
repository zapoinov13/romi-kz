import { fmtMoney, fmtNum as fmtNumCore } from "@/lib/format";

/** Форматирование сумм в отчётах — всегда USD, как на Дашборде. */
export const fmtTenge = fmtMoney;

export const fmtMetricTenge = (n: number, hasBase: boolean) =>
  hasBase && n > 0 ? fmtMoney(n) : "—";

export const fmtNum = fmtNumCore;

export const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export const reportFmt = { fmtTenge, fmtMetricTenge, fmtNum, fmtPct };
