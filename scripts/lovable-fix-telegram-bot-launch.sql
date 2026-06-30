-- Фикс запуска Telegram-бота «AI Маркетинг»
-- Lovable → Supabase → SQL Editor → Run (целиком)

-- ─── 1. Какой кабинет реально использует бот ───────────────────────────────
SELECT
  p.name AS project,
  c.name AS cabinet,
  bc.alias,
  bc.is_default,
  c.external_id,
  c.ad_account_id,
  c.page_id,
  c.config->>'pageId' AS cfg_page,
  CASE
    WHEN NULLIF(TRIM(c.external_id), '') IS NOT NULL AND NULLIF(TRIM(c.page_id), '') IS NOT NULL
    THEN '✅ OK'
    ELSE '❌ бот упадёт'
  END AS status
FROM public.project_ads_telegram_bots b
JOIN public.projects p ON p.id = b.project_id
LEFT JOIN public.ads_telegram_bot_cabinets bc ON bc.bot_id = b.id
LEFT JOIN public.ad_cabinets c ON c.id = bc.cabinet_id
WHERE b.is_active IS TRUE
ORDER BY p.name, bc.is_default DESC NULLS LAST;

-- ─── 2. Синхронизировать act_ / page_id у ВСЕХ кабинетов ──────────────────
UPDATE public.ad_cabinets c
SET
  ad_account_id = sub.act,
  external_id   = sub.act
FROM (
  SELECT id,
    CASE
      WHEN COALESCE(NULLIF(TRIM(ad_account_id), ''), NULLIF(TRIM(external_id), '')) IS NOT NULL THEN
        CASE WHEN COALESCE(NULLIF(TRIM(ad_account_id), ''), NULLIF(TRIM(external_id), '')) ~ '^act_'
          THEN COALESCE(NULLIF(TRIM(ad_account_id), ''), NULLIF(TRIM(external_id), ''))
          ELSE 'act_' || regexp_replace(COALESCE(NULLIF(TRIM(ad_account_id), ''), NULLIF(TRIM(external_id), '')), '\D', '', 'g')
        END
      WHEN NULLIF(TRIM(COALESCE(config->>'adAccountId', config->>'ad_account_id', '')), '') IS NOT NULL THEN
        CASE WHEN NULLIF(TRIM(COALESCE(config->>'adAccountId', config->>'ad_account_id', '')), '') ~ '^act_'
          THEN NULLIF(TRIM(COALESCE(config->>'adAccountId', config->>'ad_account_id', '')), '')
          ELSE 'act_' || regexp_replace(NULLIF(TRIM(COALESCE(config->>'adAccountId', config->>'ad_account_id', '')), ''), '\D', '', 'g')
        END
      ELSE NULL
    END AS act
  FROM public.ad_cabinets
) sub
WHERE c.id = sub.id AND sub.act IS NOT NULL;

UPDATE public.ad_cabinets c
SET page_id = COALESCE(
  NULLIF(TRIM(c.page_id), ''),
  NULLIF(TRIM(c.config->>'pageId'), ''),
  NULLIF(TRIM(c.config->>'page_id'), ''),
  ia.page_id
)
FROM (
  SELECT DISTINCT ON (project_id) project_id, page_id
  FROM public.instagram_accounts
  WHERE active IS TRUE AND page_id IS NOT NULL
  ORDER BY project_id, updated_at DESC
) ia
WHERE c.project_id = ia.project_id
  AND NULLIF(TRIM(c.page_id), '') IS NULL
  AND COALESCE(NULLIF(TRIM(c.config->>'pageId'), ''), NULLIF(TRIM(c.config->>'page_id'), ''), ia.page_id) IS NOT NULL;

-- ─── 3. Если боту не выдан кабинет — привязать первый кабинет проекта ───────
INSERT INTO public.ads_telegram_bot_cabinets (bot_id, project_id, cabinet_id, alias, is_default)
SELECT
  b.id,
  b.project_id,
  c.id,
  lower(regexp_replace(c.name, '[^a-zA-Z0-9а-яА-ЯёЁ]+', '_', 'g')),
  TRUE
FROM public.project_ads_telegram_bots b
JOIN LATERAL (
  SELECT id, name FROM public.ad_cabinets
  WHERE project_id = b.project_id
  ORDER BY updated_at DESC
  LIMIT 1
) c ON TRUE
WHERE b.is_active IS TRUE
  AND NOT EXISTS (SELECT 1 FROM public.ads_telegram_bot_cabinets bc WHERE bc.bot_id = b.id);

-- ─── 4. Ровно один is_default на бота ───────────────────────────────────────
WITH ranked AS (
  SELECT bc.bot_id, bc.cabinet_id,
    ROW_NUMBER() OVER (PARTITION BY bc.bot_id ORDER BY bc.is_default DESC, bc.created_at NULLS LAST) AS rn
  FROM public.ads_telegram_bot_cabinets bc
)
UPDATE public.ads_telegram_bot_cabinets bc
SET is_default = (r.rn = 1)
FROM ranked r
WHERE bc.bot_id = r.bot_id AND bc.cabinet_id = r.cabinet_id;

-- ─── 5. Проверка после фикса (только кабинеты бота) ────────────────────────
SELECT
  p.name AS project,
  c.name AS cabinet,
  c.external_id,
  c.page_id,
  CASE
    WHEN NULLIF(TRIM(c.external_id), '') IS NOT NULL AND NULLIF(TRIM(c.page_id), '') IS NOT NULL
    THEN '✅ можно тестировать /launch whatsapp'
    ELSE '❌ заполни Page ID в карточке этого кабинета'
  END AS result
FROM public.project_ads_telegram_bots b
JOIN public.projects p ON p.id = b.project_id
JOIN public.ads_telegram_bot_cabinets bc ON bc.bot_id = b.id AND bc.is_default IS TRUE
JOIN public.ad_cabinets c ON c.id = bc.cabinet_id
WHERE b.is_active IS TRUE;
