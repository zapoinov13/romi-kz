-- Диагностика: какой кабинет использует Telegram-бот «AI Маркетинг»
-- Lovable → Supabase → SQL Editor → Run

SELECT
  b.id AS bot_id,
  b.project_id,
  p.name AS project_name,
  b.default_cabinet_id,
  bc.alias,
  bc.is_default,
  c.id AS cabinet_id,
  c.name AS cabinet_name,
  c.external_id,
  c.ad_account_id,
  c.page_id,
  CASE
    WHEN NULLIF(TRIM(c.external_id), '') IS NOT NULL
     AND NULLIF(TRIM(c.page_id), '') IS NOT NULL
    THEN '✅ OK для бота'
    ELSE '❌ ПУСТО — бот упадёт на launch'
  END AS status
FROM public.project_ads_telegram_bots b
LEFT JOIN public.projects p ON p.id = b.project_id
LEFT JOIN public.ads_telegram_bot_cabinets bc ON bc.bot_id = b.id
LEFT JOIN public.ad_cabinets c ON c.id = COALESCE(bc.cabinet_id, b.default_cabinet_id)
WHERE b.is_active IS TRUE
ORDER BY bc.is_default DESC NULLS LAST, c.name;

-- Принудительно синхронизировать поля у ВСЕХ кабинетов (триггер)
UPDATE public.ad_cabinets
SET updated_at = now()
WHERE id IN (SELECT id FROM public.ad_cabinets);

-- Повторная проверка только кабинетов бота
SELECT
  c.name,
  c.external_id,
  c.page_id,
  CASE
    WHEN NULLIF(TRIM(c.external_id), '') IS NOT NULL AND NULLIF(TRIM(c.page_id), '') IS NOT NULL
    THEN '✅ OK'
    ELSE '❌ всё ещё пусто'
  END AS after_fix
FROM public.project_ads_telegram_bots b
JOIN public.ads_telegram_bot_cabinets bc ON bc.bot_id = b.id AND bc.is_default IS TRUE
JOIN public.ad_cabinets c ON c.id = bc.cabinet_id
WHERE b.is_active IS TRUE;
