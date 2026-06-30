-- ROMI-KZ · Lovable → Supabase (rgttklitvvqsnlsakvzr) → SQL Editor
-- Почему бот пишет «не заполнены обязательные поля (ad_account_id / page_id)»:
--   на проде крутится СТАРАЯ ads-telegram-webhook — она смотрит только external_id и page_id,
--   а в карточке часто заполнен ad_account_id / config JSONB.
-- Этот скрипт: (1) диагностика, (2) backfill колонок, (3) триггер на будущее.

-- ─── 1. Диагностика (кабинеты бота) ─────────────────────────────────────────
SELECT
  c.id,
  c.name,
  c.external_id,
  c.ad_account_id,
  c.page_id,
  c.config->>'pageId'       AS cfg_page_id,
  c.config->>'adAccountId'    AS cfg_ad_account,
  bc.alias,
  bc.is_default,
  ia.page_id                  AS ig_page_id
FROM public.ad_cabinets c
LEFT JOIN public.ads_telegram_bot_cabinets bc ON bc.cabinet_id = c.id
LEFT JOIN LATERAL (
  SELECT page_id
  FROM public.instagram_accounts
  WHERE project_id = c.project_id AND active IS TRUE AND page_id IS NOT NULL
  ORDER BY updated_at DESC
  LIMIT 1
) ia ON TRUE
ORDER BY bc.is_default DESC NULLS LAST, c.updated_at DESC;

-- ─── 2. Backfill: ad account (external_id ↔ ad_account_id ↔ config) ─────────
UPDATE public.ad_cabinets c
SET
  ad_account_id = sub.act,
  external_id   = sub.act
FROM (
  SELECT
    id,
    CASE
      WHEN COALESCE(NULLIF(TRIM(ad_account_id), ''), NULLIF(TRIM(external_id), '')) IS NOT NULL THEN
        CASE
          WHEN COALESCE(NULLIF(TRIM(ad_account_id), ''), NULLIF(TRIM(external_id), '')) ~ '^act_'
            THEN COALESCE(NULLIF(TRIM(ad_account_id), ''), NULLIF(TRIM(external_id), ''))
          ELSE 'act_' || regexp_replace(
            COALESCE(NULLIF(TRIM(ad_account_id), ''), NULLIF(TRIM(external_id), '')),
            '\D', '', 'g'
          )
        END
      WHEN NULLIF(TRIM(COALESCE(config->>'adAccountId', config->>'ad_account_id', config->>'externalId', '')), '') IS NOT NULL THEN
        CASE
          WHEN NULLIF(TRIM(COALESCE(config->>'adAccountId', config->>'ad_account_id', config->>'externalId', '')), '') ~ '^act_'
            THEN NULLIF(TRIM(COALESCE(config->>'adAccountId', config->>'ad_account_id', config->>'externalId', '')), '')
          ELSE 'act_' || regexp_replace(
            NULLIF(TRIM(COALESCE(config->>'adAccountId', config->>'ad_account_id', config->>'externalId', '')), ''),
            '\D', '', 'g'
          )
        END
      ELSE NULL
    END AS act
  FROM public.ad_cabinets
) sub
WHERE c.id = sub.id
  AND sub.act IS NOT NULL
  AND (
    NULLIF(TRIM(c.external_id), '') IS NULL
    OR NULLIF(TRIM(c.ad_account_id), '') IS NULL
    OR c.external_id IS DISTINCT FROM sub.act
    OR c.ad_account_id IS DISTINCT FROM sub.act
  );

-- ─── 3. Backfill: page_id из config и instagram_accounts ────────────────────
UPDATE public.ad_cabinets c
SET page_id = COALESCE(
  NULLIF(TRIM(c.page_id), ''),
  NULLIF(TRIM(c.config->>'pageId'), ''),
  NULLIF(TRIM(c.config->>'page_id'), ''),
  ia.page_id
)
FROM (
  SELECT DISTINCT ON (project_id)
    project_id, page_id
  FROM public.instagram_accounts
  WHERE active IS TRUE AND page_id IS NOT NULL
  ORDER BY project_id, updated_at DESC
) ia
WHERE c.project_id = ia.project_id
  AND NULLIF(TRIM(c.page_id), '') IS NULL
  AND COALESCE(
    NULLIF(TRIM(c.config->>'pageId'), ''),
    NULLIF(TRIM(c.config->>'page_id'), ''),
    ia.page_id
  ) IS NOT NULL;

-- ─── 4. Триггер: при каждом сохранении кабинета синхронизировать колонки ───
CREATE OR REPLACE FUNCTION public.sync_ad_cabinet_meta_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cfg jsonb;
  act text;
  pg  text;
BEGIN
  cfg := COALESCE(NEW.config, '{}'::jsonb);

  act := NULLIF(TRIM(COALESCE(NEW.ad_account_id, '')), '');
  IF act IS NULL THEN act := NULLIF(TRIM(COALESCE(NEW.external_id, '')), ''); END IF;
  IF act IS NULL THEN
    act := NULLIF(TRIM(COALESCE(
      cfg->>'adAccountId', cfg->>'ad_account_id', cfg->>'externalId', cfg->>'external_id', ''
    )), '');
  END IF;
  IF act IS NOT NULL AND act !~ '^act_' THEN
    act := 'act_' || regexp_replace(act, '\D', '', 'g');
  END IF;

  pg := NULLIF(TRIM(COALESCE(NEW.page_id, '')), '');
  IF pg IS NULL THEN
    pg := NULLIF(TRIM(COALESCE(cfg->>'pageId', cfg->>'page_id', '')), '');
  END IF;

  IF act IS NOT NULL THEN
    NEW.ad_account_id := act;
    NEW.external_id   := act;
  END IF;
  IF pg IS NOT NULL THEN
    NEW.page_id := pg;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ad_cabinet_meta ON public.ad_cabinets;
CREATE TRIGGER trg_sync_ad_cabinet_meta
  BEFORE INSERT OR UPDATE ON public.ad_cabinets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ad_cabinet_meta_columns();

-- ─── 5. Проверка после фикса ───────────────────────────────────────────────
SELECT
  id, name, external_id, ad_account_id, page_id,
  CASE
    WHEN NULLIF(TRIM(external_id), '') IS NOT NULL AND NULLIF(TRIM(page_id), '') IS NOT NULL
    THEN 'OK для старого бота'
    ELSE 'ВСЁ ЕЩЁ ПУСТО — заполни Page ID в карточке или подключи Instagram'
  END AS bot_status
FROM public.ad_cabinets
ORDER BY updated_at DESC;
