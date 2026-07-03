/** Правила авто-оптимизации рекламы на уровне кабинета (ad_kpi_targets). */

export type AutoMode = "off" | "suggest" | "enforce";

export type AutoPauseScope = "adset" | "ad";

export type AdAutomationRules = {
  auto_mode: AutoMode;
  auto_duplicate_adset_enabled: boolean;
  auto_duplicate_stable_days: number;
  /** Потолок CPL за окно (USD) */
  auto_duplicate_max_cpl: number | null;
  auto_duplicate_min_leads: number;
  auto_smart_pause_enabled: boolean;
  /** Порог трат без заявок */
  auto_pause_spend_threshold: number | null;
  /** CTR «хороший» — иначе не паузим (проблема в креативе, не в аудитории) */
  auto_pause_min_ctr_pct: number;
  /** CPM выше — не паузим (аудитория дорогая / узкая) */
  auto_pause_max_cpm: number | null;
  auto_pause_scope: AutoPauseScope;
  cooldown_minutes: number;
  daily_action_limit: number;
  target_cpl_kzt: number | null;
  max_cpl_kzt: number | null;
};

export const DEFAULT_AUTOMATION_RULES: AdAutomationRules = {
  auto_mode: "suggest",
  auto_duplicate_adset_enabled: false,
  auto_duplicate_stable_days: 3,
  auto_duplicate_max_cpl: 2,
  auto_duplicate_min_leads: 3,
  auto_smart_pause_enabled: true,
  auto_pause_spend_threshold: 5,
  auto_pause_min_ctr_pct: 0.8,
  auto_pause_max_cpm: null,
  auto_pause_scope: "adset",
  cooldown_minutes: 360,
  daily_action_limit: 5,
  target_cpl_kzt: null,
  max_cpl_kzt: null,
};

export function currencyIsUsd(code: string | undefined): boolean {
  return (code ?? "USD").toUpperCase() === "USD";
}

export function formatAutomationMoney(n: number | null, _currency?: string): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Краткое описание активных правил для подсказки в меню. */
export function summarizeAutomationRules(rules: Partial<AdAutomationRules>, currency: string): string {
  const parts: string[] = [];
  if (rules.auto_mode === "off") return "Автоматизация выключена";
  if (rules.auto_duplicate_adset_enabled) {
    parts.push(
      `дубль при CPL < ${formatAutomationMoney(rules.auto_duplicate_max_cpl ?? null, currency)} за ${rules.auto_duplicate_stable_days ?? 3} дн.`,
    );
  }
  if (rules.auto_smart_pause_enabled) {
    parts.push(
      `пауза при ${formatAutomationMoney(rules.auto_pause_spend_threshold ?? null, currency)} без заявок`,
    );
  }
  return parts.length ? parts.join(" · ") : "Правила не настроены";
}
