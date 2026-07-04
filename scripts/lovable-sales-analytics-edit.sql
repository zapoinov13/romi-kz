-- ROMI-KZ · Lovable → SQL Editor
-- Ручное редактирование в аналитике продаж: paid=false → unpaid
-- Безопасно запускать повторно

CREATE OR REPLACE FUNCTION public.sync_sales_analytics_from_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stage_key text;
  _qualified boolean;
  _payment text;
  _service_id uuid;
  _amount numeric;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ps.key INTO _stage_key
  FROM public.pipeline_stages ps
  WHERE ps.id = NEW.stage_id;

  IF NEW.is_qualified IS NOT NULL THEN
    _qualified := NEW.is_qualified;
  ELSIF _stage_key IN ('in_progress', 'invoice', 'scheduled', 'visit', 'paid') THEN
    _qualified := true;
  ELSIF _stage_key IN ('rejected', 'no_answer') THEN
    _qualified := false;
  ELSE
    _qualified := NULL;
  END IF;

  IF NEW.paid IS TRUE THEN
    _payment := 'paid';
  ELSIF NEW.paid IS FALSE THEN
    _payment := 'unpaid';
  ELSIF _stage_key = 'rejected' THEN
    _payment := 'unpaid';
  ELSE
    _payment := NULL;
  END IF;

  _amount := NEW.amount;

  _service_id := NEW.service_id;
  IF _service_id IS NULL AND NULLIF(TRIM(NEW.service), '') IS NOT NULL THEN
    SELECT s.id INTO _service_id
    FROM public.sales_service_catalog s
    WHERE s.project_id = NEW.project_id
      AND lower(trim(s.name)) = lower(trim(NEW.service))
    LIMIT 1;
  END IF;

  INSERT INTO public.sales_analytics_leads (
    project_id, lead_id, cabinet_id, name, phone, source_label,
    meta_ad_id, utm_content, utm_source, utm_medium, utm_campaign,
    channel, is_qualified, payment_status, service_id, amount, created_at
  ) VALUES (
    NEW.project_id,
    NEW.id,
    NEW.cabinet_id,
    COALESCE(NULLIF(TRIM(NEW.name), ''), '—'),
    COALESCE(NULLIF(TRIM(NEW.phone), ''), '—'),
    public.build_sales_source_label(
      NEW.meta_ad_id, NEW.utm, NEW.campaign, NEW.source, NEW.channel::text
    ),
    NULLIF(TRIM(NEW.meta_ad_id), ''),
    NULLIF(TRIM(NEW.utm->>'utm_content'), ''),
    NULLIF(TRIM(NEW.utm->>'utm_source'), ''),
    NULLIF(TRIM(NEW.utm->>'utm_medium'), ''),
    NULLIF(TRIM(NEW.utm->>'utm_campaign'), ''),
    NEW.channel::text,
    _qualified,
    _payment,
    _service_id,
    _amount,
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
    is_qualified = EXCLUDED.is_qualified,
    payment_status = EXCLUDED.payment_status,
    service_id = EXCLUDED.service_id,
    amount = EXCLUDED.amount,
    updated_at = now();

  RETURN NEW;
END;
$$;
