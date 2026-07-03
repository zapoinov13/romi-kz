import { AD_ACCOUNT_STATUS_LABEL, normalizeActId } from "./meta_list_ad_accounts.ts";

const META_API_VERSION = "v21.0";

export const DISABLE_REASON_LABEL: Record<number, string> = {
  0: "",
  1: "нарушение политики рекламы",
  2: "проверка IP-адреса",
  3: "проблема с платёжным методом",
  4: "аккаунт закрыт (gray account)",
  5: "проверка AFC",
  6: "проверка целостности бизнеса",
  7: "постоянное закрытие",
  8: "неиспользуемый реселлерский аккаунт",
  9: "неиспользуемый аккаунт",
  10: "umbrella ad account",
  11: "нарушение политики Business Manager",
  12: "искажение данных аккаунта",
  13: "AOAB deshare legal entity",
  14: "проверка CTX thread",
  15: "скомпрометированный аккаунт",
};

export const ACCOUNT_DETAIL_FIELDS =
  "id,account_id,name,currency,account_status,disable_reason,balance,is_prepay_account,timezone_name,business{name},funding_source_details{display_string,type}";

export type MetaAccountStatusPayload = {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  account_status: number;
  status_label: string;
  status_title: string;
  status_detail: string | null;
  status_tone: "success" | "warning" | "danger" | "muted";
  needs_payment: boolean;
  balance_due: number | null;
  balance_due_formatted: string | null;
  disable_reason: number;
  disable_reason_label: string | null;
  payment_method: string | null;
  billing_url: string;
  timezone_name: string | null;
  business_name: string | null;
};

type RawAccount = {
  id?: string;
  account_id?: string;
  name?: string;
  currency?: string;
  account_status?: number;
  disable_reason?: number;
  balance?: string | number;
  is_prepay_account?: boolean;
  timezone_name?: string;
  business?: { name?: string };
  funding_source_details?: { display_string?: string; type?: number };
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  KZT: "$",
  RUB: "₽",
  UAH: "₴",
  GBP: "£",
  TRY: "₺",
};

export function metaBillingUrl(actId: string): string {
  const act = normalizeActId(actId);
  const bare = act.replace(/^act_/i, "");
  return `https://business.facebook.com/billing_hub/accounts/details?asset_id=${encodeURIComponent(act)}&business_id=&placement=standalone&global_scope_id=${encodeURIComponent(bare)}`;
}

export function formatBalanceDue(
  balance: string | number | undefined | null,
  currency: string,
): { amount: number; formatted: string } | null {
  if (balance === undefined || balance === null || balance === "") return null;
  const raw = typeof balance === "string" ? Number.parseInt(balance, 10) : balance;
  if (!Number.isFinite(raw) || raw === 0) return null;
  const amount = Math.abs(raw) / 100;
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  const num = amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const formatted = ["$", "€", "£"].includes(sym) ? `${sym}${num}` : `${num} ${sym}`;
  return { amount, formatted };
}

function statusTitle(status: number, disableReason: number): string {
  switch (status) {
    case 1:
      return "Активен";
    case 2:
      return disableReason === 3 ? "Ошибка оплаты" : "Отключён";
    case 3:
      return "Ошибка оплаты";
    case 7:
      return "Проверка риска";
    case 8:
      return "Ожидает списания";
    case 9:
      return "Грейс-период";
    case 100:
      return "Закрывается";
    case 101:
      return "Закрыт";
    default:
      return "Неизвестно";
  }
}

function statusTone(
  status: number,
): "success" | "warning" | "danger" | "muted" {
  if (status === 1) return "success";
  if ([3, 8, 9].includes(status)) return "warning";
  if ([2, 100, 101].includes(status)) return "danger";
  if (status === 7) return "warning";
  return "muted";
}

function buildStatusDetail(
  status: number,
  disableReason: number,
  balanceFormatted: string | null,
  paymentMethod: string | null,
): string | null {
  const parts: string[] = [];
  const disableLabel = DISABLE_REASON_LABEL[disableReason];
  if (disableLabel) parts.push(disableLabel);
  if (status === 3) {
    parts.push("Неоплаченный баланс — реклама остановлена до оплаты");
  } else if (status === 8) {
    parts.push("Meta ожидает списание с платёжного метода");
  } else if (status === 2 && disableReason === 3) {
    parts.push("Платёж не прошёл — обновите карту или оплатите баланс");
  }
  if (balanceFormatted) parts.push(`К оплате: ${balanceFormatted}`);
  if (paymentMethod) parts.push(`Карта: ${paymentMethod}`);
  return parts.length ? parts.join(" · ") : null;
}

export function parseMetaAccountStatus(row: RawAccount): MetaAccountStatusPayload {
  const id = normalizeActId(String(row.id ?? row.account_id ?? ""));
  const currency = row.currency ?? "USD";
  const accountStatus = row.account_status ?? 0;
  const disableReason = row.disable_reason ?? 0;
  const balanceDue = formatBalanceDue(row.balance, currency);
  const paymentMethod = row.funding_source_details?.display_string?.trim() || null;
  const statusLabel = AD_ACCOUNT_STATUS_LABEL[accountStatus] ?? "unknown";
  const needsPayment =
    [3, 8].includes(accountStatus) ||
    (accountStatus === 2 && disableReason === 3) ||
    (balanceDue !== null && accountStatus !== 1);

  return {
    id,
    account_id: row.account_id ?? id.replace(/^act_/, ""),
    name: row.name ?? id,
    currency,
    account_status: accountStatus,
    status_label: statusLabel,
    status_title: statusTitle(accountStatus, disableReason),
    status_detail: buildStatusDetail(
      accountStatus,
      disableReason,
      balanceDue?.formatted ?? null,
      paymentMethod,
    ),
    status_tone: statusTone(accountStatus),
    needs_payment: needsPayment,
    balance_due: balanceDue?.amount ?? null,
    balance_due_formatted: balanceDue?.formatted ?? null,
    disable_reason: disableReason,
    disable_reason_label: DISABLE_REASON_LABEL[disableReason] || null,
    payment_method: paymentMethod,
    billing_url: metaBillingUrl(id),
    timezone_name: row.timezone_name ?? null,
    business_name: row.business?.name ?? null,
  };
}

export async function fetchMetaAccountStatus(
  actId: string,
  token: string,
): Promise<MetaAccountStatusPayload> {
  const act = normalizeActId(actId);
  const url =
    `https://graph.facebook.com/${META_API_VERSION}/${act}` +
    `?fields=${encodeURIComponent(ACCOUNT_DETAIL_FIELDS)}` +
    `&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j as { error?: { message?: string } })?.error) {
    const msg = (j as { error?: { message?: string } })?.error?.message ?? `Meta API ${r.status}`;
    throw new Error(msg);
  }
  return parseMetaAccountStatus(j as RawAccount);
}

/** Пытается инициировать списание через Graph API (если Meta разрешает для токена). */
export async function attemptMetaAccountPayment(
  actId: string,
  token: string,
): Promise<{ ok: boolean; message: string; attempted_api: boolean }> {
  const act = normalizeActId(actId);
  let fundingSource: string | undefined;
  try {
    const status = await fetchMetaAccountStatus(act, token);
    if (!status.needs_payment) {
      return { ok: true, message: "Кабинет активен, оплата не требуется", attempted_api: false };
    }
    const fsUrl =
      `https://graph.facebook.com/${META_API_VERSION}/${act}` +
      `?fields=funding_source&access_token=${encodeURIComponent(token)}`;
    const fsRes = await fetch(fsUrl);
    const fsJson = await fsRes.json().catch(() => ({}));
    fundingSource = (fsJson as { funding_source?: string }).funding_source;
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      attempted_api: false,
    };
  }

  const endpoints: Array<{ path: string; body: Record<string, string> }> = [
    { path: `/${act}/adaccountpayment`, body: {} },
    { path: `/${act}/payments`, body: {} },
  ];
  if (fundingSource) {
    endpoints.unshift({
      path: `/${act}/adaccountpayment`,
      body: { funding_source: fundingSource },
    });
  }

  let lastError = "Meta не предоставляет публичный API для списания оплаты";
  for (const { path, body } of endpoints) {
    const params = new URLSearchParams(body);
    params.set("access_token", token);
    const r = await fetch(`https://graph.facebook.com/${META_API_VERSION}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const text = await r.text();
    let parsed: { error?: { message?: string; error_user_msg?: string }; success?: boolean } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep text */
    }
    if (r.ok && !parsed.error) {
      return {
        ok: true,
        message: "Запрос на списание отправлен в Meta",
        attempted_api: true,
      };
    }
    lastError = parsed.error?.error_user_msg ?? parsed.error?.message ?? text.slice(0, 200);
    if (/unknown path|unsupported|nonexisting|cannot be loaded/i.test(lastError)) {
      continue;
    }
    return { ok: false, message: lastError, attempted_api: true };
  }

  return {
    ok: false,
    message: `${lastError}. Откройте биллинг Meta и нажмите «Оплатить сейчас».`,
    attempted_api: true,
  };
}
