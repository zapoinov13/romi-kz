-- Исправление legacy-данных: расходы Meta были сохранены в тенге (KZT), а UI показывал $.
-- Конвертируем spend и revenue обратно в USD. Безопасно запускать повторно.

-- 1) Строки с currency = KZT и курсом на эту дату
UPDATE public.cabinet_daily_insights cdi
SET
  spend = ROUND((cdi.spend / fx.usd_kzt)::numeric, 2),
  revenue = ROUND((cdi.revenue / fx.usd_kzt)::numeric, 2),
  currency = 'USD'
FROM public.fx_rates fx
WHERE cdi.currency = 'KZT'
  AND cdi.date = fx.date
  AND fx.usd_kzt > 0;

-- 2) Оставшиеся KZT без курса на дату — последний известный курс NBK
UPDATE public.cabinet_daily_insights cdi
SET
  spend = ROUND((cdi.spend / fx.usd_kzt)::numeric, 2),
  revenue = ROUND((cdi.revenue / fx.usd_kzt)::numeric, 2),
  currency = 'USD'
FROM (
  SELECT usd_kzt FROM public.fx_rates ORDER BY date DESC LIMIT 1
) fx
WHERE cdi.currency = 'KZT'
  AND fx.usd_kzt > 0;

-- После этого пересинхронизируйте Meta (meta-daily-sync) — новые данные уже в USD.
