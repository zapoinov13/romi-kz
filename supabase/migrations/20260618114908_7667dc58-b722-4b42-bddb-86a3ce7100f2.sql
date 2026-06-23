
CREATE TABLE IF NOT EXISTS public.ad_status_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  adset_id text,
  window_days integer NOT NULL DEFAULT 3,
  status text NOT NULL CHECK (status IN ('green','yellow','red','cold_start','no_data')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_kpi jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ass_cab_camp_time
  ON public.ad_status_snapshots (cabinet_id, campaign_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ass_project_time
  ON public.ad_status_snapshots (project_id, evaluated_at DESC);

GRANT SELECT ON public.ad_status_snapshots TO authenticated;
GRANT ALL ON public.ad_status_snapshots TO service_role;

ALTER TABLE public.ad_status_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ass_select_members" ON public.ad_status_snapshots
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE OR REPLACE VIEW public.v_latest_campaign_status AS
SELECT DISTINCT ON (cabinet_id, campaign_id)
  cabinet_id, project_id, campaign_id, adset_id,
  window_days, status, reasons, metrics, resolved_kpi, evaluated_at
FROM public.ad_status_snapshots
WHERE adset_id IS NULL
ORDER BY cabinet_id, campaign_id, evaluated_at DESC;

GRANT SELECT ON public.v_latest_campaign_status TO authenticated;
