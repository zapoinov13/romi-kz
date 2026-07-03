/** Единый формат валюты — доллары США. */
export const fmtMoney = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

export const fmtUsd = fmtMoney;

/** @deprecated используйте fmtMoney */
export const fmtKzt = fmtMoney;

/** @deprecated используйте fmtMoney */
export const fmtTenge = fmtMoney;

export const fmtNum = (n: number) =>
  Math.round(n).toLocaleString("en-US");
