-- Аналитика продаж: справочник услуг + лиды + автосинк из CRM

CREATE TABLE IF NOT EXISTS public.sales_service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_service_catalog_project_idx
  ON public.sales_service_catalog(project_id);

CREATE TABLE IF NOT EXISTS public.sales_analytics_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lead_id uuid UNIQUE REFERENCES public.leads(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  source_label text,
  meta_ad_id text,
  utm_content text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  channel text,
  is_qualified boolean,
  payment_status text CHECK (payment_status IS NULL OR payment_status IN ('paid', 'unpaid')),
  service_id uuid REFERENCES public.sales_service_catalog(id) ON DELETE SET NULL,
  amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_analytics_leads_project_created_idx
  ON public.sales_analytics_leads(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sales_analytics_leads_project_payment_idx
  ON public.sales_analytics_leads(project_id, payment_status);

-- Автосоздание строки при новом лиде (WhatsApp / сайт / любой канал)
CREATE OR REPLACE FUNCTION public.build_sales_source_label(
  p_meta_ad_id text,
  p_utm jsonb,
  p_campaign text,
  p_source text,
  p_channel text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(TRIM(p_meta_ad_id), ''),
    NULLIF(TRIM(p_utm->>'utm_content'), ''),
    NULLIF(TRIM(p_campaign), ''),
    NULLIF(TRIM(p_source), ''),
    NULLIF(TRIM(p_channel), ''),
    '—'
  );
$$;

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

DROP TRIGGER IF EXISTS trg_sync_sales_analytics_from_lead ON public.leads;
CREATE TRIGGER trg_sync_sales_analytics_from_lead
  AFTER INSERT OR UPDATE OF name, phone, meta_ad_id, utm, campaign, source, channel, project_id
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_sales_analytics_from_lead();

-- Бэкфилл существующих лидов
INSERT INTO public.sales_analytics_leads (
  project_id, lead_id, name, phone, source_label,
  meta_ad_id, utm_content, utm_source, utm_medium, utm_campaign,
  channel, created_at
)
SELECT
  l.project_id,
  l.id,
  COALESCE(NULLIF(TRIM(l.name), ''), '—'),
  COALESCE(NULLIF(TRIM(l.phone), ''), '—'),
  public.build_sales_source_label(l.meta_ad_id, l.utm, l.campaign, l.source, l.channel::text),
  NULLIF(TRIM(l.meta_ad_id), ''),
  NULLIF(TRIM(l.utm->>'utm_content'), ''),
  NULLIF(TRIM(l.utm->>'utm_source'), ''),
  NULLIF(TRIM(l.utm->>'utm_medium'), ''),
  NULLIF(TRIM(l.utm->>'utm_campaign'), ''),
  l.channel::text,
  COALESCE(l.first_touch_at, l.created_at, now())
FROM public.leads l
WHERE l.project_id IS NOT NULL
ON CONFLICT (lead_id) DO NOTHING;

-- Демо-услуги для проектов без справочника (опционально — только если пусто)
INSERT INTO public.sales_service_catalog (project_id, name, default_price, sort_order)
SELECT p.id, svc.name, svc.price, svc.ord
FROM public.projects p
CROSS JOIN (
  VALUES
    ('Настройка рекламы', 120000::numeric, 1),
    ('AI Агент', 250000::numeric, 2),
    ('CRM', 350000::numeric, 3)
) AS svc(name, price, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sales_service_catalog s WHERE s.project_id = p.id
);

-- RLS
ALTER TABLE public.sales_service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_analytics_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_service_catalog_select ON public.sales_service_catalog
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY sales_service_catalog_insert ON public.sales_service_catalog
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_project(project_id));

CREATE POLICY sales_service_catalog_update ON public.sales_service_catalog
  FOR UPDATE TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY sales_service_catalog_delete ON public.sales_service_catalog
  FOR DELETE TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY sales_analytics_leads_select ON public.sales_analytics_leads
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY sales_analytics_leads_insert ON public.sales_analytics_leads
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_project(project_id));

CREATE POLICY sales_analytics_leads_update ON public.sales_analytics_leads
  FOR UPDATE TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY sales_analytics_leads_delete ON public.sales_analytics_leads
  FOR DELETE TO authenticated
  USING (public.user_can_access_project(project_id));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_analytics_leads;
