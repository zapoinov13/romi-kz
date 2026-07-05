-- Lovable SQL Editor: автосбор лидов Meta Lead Forms (без n8n)
-- 1) Выполнить этот SQL
-- 2) Deploy edge function: meta-leads-sync (verify_jwt=false)
-- 3) У кабинета должен быть page_id (+ lead_form_id опционально)
-- 4) Meta token: leads_retrieval, pages_read_engagement

CREATE TABLE IF NOT EXISTS public.meta_lead_ingest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_lead_id text NOT NULL UNIQUE,
  form_id text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  cabinet_id uuid REFERENCES public.ad_cabinets(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  meta_ad_id text,
  meta_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_lead_ingest_cabinet_idx
  ON public.meta_lead_ingest(cabinet_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.meta_lead_sync_state (
  cabinet_id uuid PRIMARY KEY REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_lead_ingest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_lead_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_lead_ingest_admin ON public.meta_lead_ingest;
CREATE POLICY meta_lead_ingest_admin ON public.meta_lead_ingest
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS meta_lead_sync_state_admin ON public.meta_lead_sync_state;
CREATE POLICY meta_lead_sync_state_admin ON public.meta_lead_sync_state
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

SELECT cron.unschedule('meta-leads-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-leads-sync');

SELECT cron.schedule(
  'meta-leads-sync',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://rgttklitvvqsnlsakvzr.supabase.co/functions/v1/meta-leads-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automation-key', (SELECT cron_secret FROM public.automation_settings WHERE id = true)
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Ручной прогон (после deploy функции):
-- curl -X POST 'https://rgttklitvvqsnlsakvzr.supabase.co/functions/v1/meta-leads-sync' \
--   -H 'Content-Type: application/json' \
--   -H 'x-automation-key: YOUR_CRON_SECRET_FROM_automation_settings'
