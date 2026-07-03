-- Единая интеграция платформы: CRM → аналитика, service_id, дедупликация

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_qualified boolean;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.sales_service_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_service_id_idx ON public.leads(service_id) WHERE service_id IS NOT NULL;

-- Поиск лида по телефону (единый идентификатор клиента)
CREATE OR REPLACE FUNCTION public.find_lead_id_by_phone(p_project_id uuid, p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.leads l
  WHERE l.is_personal = false
    AND public.normalize_phone(l.phone) = public.normalize_phone(p_phone)
    AND public.normalize_phone(p_phone) <> ''
    AND (
      p_project_id IS NULL
      OR l.project_id = p_project_id
      OR l.project_id IS NULL
    )
  ORDER BY l.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_lead_id_by_phone(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_lead_id_by_phone(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_lead_id_by_phone(uuid, text) TO service_role;

-- Полная синхронизация CRM → sales_analytics_leads
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

  IF NEW.paid = true THEN
    _payment := 'paid';
    _amount := NULLIF(NEW.amount, 0);
  ELSIF _stage_key = 'rejected' THEN
    _payment := 'unpaid';
    _amount := NULL;
  ELSE
    _payment := NULL;
    _amount := NULLIF(NEW.amount, 0);
  END IF;

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

DROP TRIGGER IF EXISTS trg_sync_sales_analytics_from_lead ON public.leads;
CREATE TRIGGER trg_sync_sales_analytics_from_lead
  AFTER INSERT OR UPDATE OF
    name, phone, meta_ad_id, utm, campaign, source, channel, project_id, cabinet_id,
    stage_id, paid, amount, service, service_id, is_qualified
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_sales_analytics_from_lead();

-- Realtime для справочника услуг
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sales_service_catalog'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_service_catalog;
  END IF;
END $$;

-- Пересинхронизация существующих лидов
UPDATE public.leads l
SET updated_at = now()
WHERE l.project_id IS NOT NULL AND l.is_personal = false;
