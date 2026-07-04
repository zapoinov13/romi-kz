-- Подпись «Объявление» = название креатива Meta, не ad id и не кампания.

CREATE OR REPLACE FUNCTION public.build_sales_source_label(
  p_meta_ad_id text,
  p_utm jsonb,
  p_campaign text,
  p_source text,
  p_channel text
) RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT mc.name
        FROM public.meta_creatives mc
       WHERE mc.ad_id = NULLIF(TRIM(p_meta_ad_id), '')
       LIMIT 1
    ),
    (
      SELECT mc.headline
        FROM public.meta_creatives mc
       WHERE mc.ad_id = NULLIF(TRIM(p_meta_ad_id), '')
         AND NULLIF(TRIM(mc.headline), '') IS NOT NULL
       LIMIT 1
    ),
    (
      SELECT ac.ad_name
        FROM public.ad_campaigns ac
       WHERE ac.meta_ad_id = NULLIF(TRIM(p_meta_ad_id), '')
         AND NULLIF(TRIM(ac.ad_name), '') IS NOT NULL
       LIMIT 1
    ),
    NULLIF(TRIM(p_utm->>'ad_name'), ''),
    NULLIF(TRIM(p_utm->>'headline'), ''),
    CASE
      WHEN NULLIF(TRIM(p_utm->>'utm_content'), '') ~ '^\d{8,}$' THEN NULL
      ELSE NULLIF(TRIM(p_utm->>'utm_content'), '')
    END,
    CASE
      WHEN NULLIF(TRIM(p_meta_ad_id), '') IS NOT NULL THEN 'Объявление без названия'
    END,
    NULLIF(TRIM(p_campaign), ''),
    NULLIF(TRIM(p_source), ''),
    NULLIF(TRIM(p_channel), ''),
    '—'
  );
$$;

-- Пересчитать source_label через триггер sync_sales_analytics_from_lead
UPDATE public.leads l
   SET updated_at = now()
 WHERE l.meta_ad_id IS NOT NULL
   AND l.is_personal = false;
