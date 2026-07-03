-- Дополнение: cabinet_id в sales_analytics_leads + обновление триггера

ALTER TABLE public.sales_analytics_leads
  ADD COLUMN IF NOT EXISTS cabinet_id uuid REFERENCES public.ad_cabinets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_analytics_leads_cabinet_idx
  ON public.sales_analytics_leads(project_id, cabinet_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_sales_analytics_from_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sales_analytics_leads (
    project_id,
    lead_id,
    cabinet_id,
    name,
    phone,
    source_label,
    meta_ad_id,
    utm_content,
    utm_source,
    utm_medium,
    utm_campaign,
    channel,
    created_at
  ) VALUES (
    NEW.project_id,
    NEW.id,
    NEW.cabinet_id,
    COALESCE(NULLIF(TRIM(NEW.name), ''), '—'),
    COALESCE(NULLIF(TRIM(NEW.phone), ''), '—'),
    public.build_sales_source_label(
      NEW.meta_ad_id,
      NEW.utm,
      NEW.campaign,
      NEW.source,
      NEW.channel::text
    ),
    NULLIF(TRIM(NEW.meta_ad_id), ''),
    NULLIF(TRIM(NEW.utm->>'utm_content'), ''),
    NULLIF(TRIM(NEW.utm->>'utm_source'), ''),
    NULLIF(TRIM(NEW.utm->>'utm_medium'), ''),
    NULLIF(TRIM(NEW.utm->>'utm_campaign'), ''),
    NEW.channel::text,
    COALESCE(NEW.first_touch_at, NEW.created_at, now())
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    cabinet_id = COALESCE(EXCLUDED.cabinet_id, sales_analytics_leads.cabinet_id),
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    source_label = EXCLUDED.source_label,
    meta_ad_id = COALESCE(EXCLUDED.meta_ad_id, sales_analytics_leads.meta_ad_id),
    utm_content = COALESCE(EXCLUDED.utm_content, sales_analytics_leads.utm_content),
    utm_source = COALESCE(EXCLUDED.utm_source, sales_analytics_leads.utm_source),
    utm_medium = COALESCE(EXCLUDED.utm_medium, sales_analytics_leads.utm_medium),
    utm_campaign = COALESCE(EXCLUDED.utm_campaign, sales_analytics_leads.utm_campaign),
    channel = COALESCE(EXCLUDED.channel, sales_analytics_leads.channel),
    updated_at = now();

  RETURN NEW;
END;
$$;

UPDATE public.sales_analytics_leads sal
SET cabinet_id = l.cabinet_id
FROM public.leads l
WHERE sal.lead_id = l.id AND sal.cabinet_id IS NULL;
