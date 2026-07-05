-- Lovable SQL Editor: атрибуция лид-форм Meta → столбец «Объявление»
-- Безопасно запускать повторно (вместе с lovable-sales-analytics-ad-name.sql)

CREATE OR REPLACE FUNCTION public.resolve_meta_ids_from_utm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content text;
  v_campaign text;
BEGIN
  v_content := COALESCE(
    NULLIF(NEW.utm->>'utm_content', ''),
    NULLIF(NEW.utm->>'content', '')
  );
  v_campaign := COALESCE(
    NULLIF(NEW.utm->>'utm_campaign', ''),
    NULLIF(NEW.utm->>'campaign', '')
  );

  IF NEW.meta_ad_id IS NULL AND v_content IS NOT NULL THEN
    IF v_content ~ '^[0-9]{6,}$' THEN
      NEW.meta_ad_id := v_content;
    ELSE
      SELECT mc.ad_id, COALESCE(NEW.meta_campaign_id, mc.campaign_id), COALESCE(NEW.meta_adset_id, mc.adset_id)
        INTO NEW.meta_ad_id, NEW.meta_campaign_id, NEW.meta_adset_id
        FROM public.meta_creatives mc
       WHERE mc.name = v_content
         AND (NEW.project_id IS NULL OR mc.project_id = NEW.project_id)
       LIMIT 1;
    END IF;
  END IF;

  IF NEW.meta_campaign_id IS NULL AND v_campaign IS NOT NULL THEN
    IF v_campaign ~ '^[0-9]{6,}$' THEN
      NEW.meta_campaign_id := v_campaign;
    ELSE
      SELECT mcp.campaign_id INTO NEW.meta_campaign_id
        FROM public.meta_campaigns mcp
       WHERE mcp.name = v_campaign
         AND (NEW.project_id IS NULL OR mcp.project_id = NEW.project_id)
       LIMIT 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.leads l
   SET updated_at = now()
 WHERE l.is_personal = false
   AND (
     l.meta_ad_id IS NOT NULL
     OR l.source IN ('meta', 'lead_form', 'facebook')
     OR l.utm ? 'ad_name'
     OR l.utm ? 'utm_content'
     OR l.utm ? 'content'
   );
