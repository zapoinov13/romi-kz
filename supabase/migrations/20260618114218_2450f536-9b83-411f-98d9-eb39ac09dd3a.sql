
CREATE TABLE IF NOT EXISTS public.ad_kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  campaign_id text,  -- meta_campaign_id (NULL = cabinet default)
  adset_id text,     -- meta_adset_id (NULL = campaign or cabinet default)
  goal_type text,    -- 'whatsapp' | 'site-leads' | 'meta-form' | 'traffic' (NULL = any)
  target_cpl_kzt numeric(12,2),
  max_cpl_kzt numeric(12,2),
  min_daily_leads integer DEFAULT 1,
  target_roas numeric(6,4),
  min_roas numeric(6,4),
  min_daily_spend_kzt numeric(12,2),
  max_daily_spend_kzt numeric(12,2),
  attribution_window text DEFAULT '7d_click_1d_view',
  max_frequency_7d numeric(4,2) DEFAULT 3.5,
  min_ctr_pct numeric(5,3) DEFAULT 0.8,
  learning_phase_min_events integer DEFAULT 50,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_kpi_scope_check CHECK (
    (campaign_id IS NULL AND adset_id IS NULL) OR
    (campaign_id IS NOT NULL AND adset_id IS NULL) OR
    (campaign_id IS NOT NULL AND adset_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_kpi_scope_unique
  ON public.ad_kpi_targets (
    cabinet_id,
    COALESCE(campaign_id, ''),
    COALESCE(adset_id, ''),
    COALESCE(goal_type, '')
  );
CREATE INDEX IF NOT EXISTS idx_ad_kpi_cabinet ON public.ad_kpi_targets(cabinet_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_kpi_targets TO authenticated;
GRANT ALL ON public.ad_kpi_targets TO service_role;

ALTER TABLE public.ad_kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_select_members"
  ON public.ad_kpi_targets FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "kpi_modify_members"
  ON public.ad_kpi_targets FOR ALL TO authenticated
  USING (public.user_can_access_project(project_id))
  WITH CHECK (public.user_can_access_project(project_id));

CREATE TRIGGER trg_ad_kpi_targets_updated_at
  BEFORE UPDATE ON public.ad_kpi_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper view: effective KPI per (cabinet_id, campaign_id, adset_id).
-- Returns one row per scope key with the most specific KPI override.
CREATE OR REPLACE VIEW public.v_resolved_kpi AS
WITH
  cab_default AS (
    SELECT cabinet_id, target_cpl_kzt, max_cpl_kzt, min_daily_leads,
           target_roas, min_roas, min_daily_spend_kzt, max_daily_spend_kzt,
           max_frequency_7d, min_ctr_pct, learning_phase_min_events,
           attribution_window, goal_type
      FROM public.ad_kpi_targets
     WHERE campaign_id IS NULL AND adset_id IS NULL
  ),
  camp_override AS (
    SELECT cabinet_id, campaign_id, target_cpl_kzt, max_cpl_kzt, min_daily_leads,
           target_roas, min_roas, min_daily_spend_kzt, max_daily_spend_kzt,
           max_frequency_7d, min_ctr_pct, learning_phase_min_events,
           attribution_window
      FROM public.ad_kpi_targets
     WHERE campaign_id IS NOT NULL AND adset_id IS NULL
  ),
  adset_override AS (
    SELECT cabinet_id, campaign_id, adset_id, target_cpl_kzt, max_cpl_kzt, min_daily_leads,
           target_roas, min_roas, min_daily_spend_kzt, max_daily_spend_kzt,
           max_frequency_7d, min_ctr_pct, learning_phase_min_events,
           attribution_window
      FROM public.ad_kpi_targets
     WHERE adset_id IS NOT NULL
  )
SELECT mc.cabinet_id, mc.campaign_id, NULL::text AS adset_id,
       COALESCE(co.target_cpl_kzt, cd.target_cpl_kzt) AS target_cpl_kzt,
       COALESCE(co.max_cpl_kzt, cd.max_cpl_kzt) AS max_cpl_kzt,
       COALESCE(co.min_daily_leads, cd.min_daily_leads) AS min_daily_leads,
       COALESCE(co.target_roas, cd.target_roas) AS target_roas,
       COALESCE(co.min_roas, cd.min_roas) AS min_roas,
       COALESCE(co.min_daily_spend_kzt, cd.min_daily_spend_kzt) AS min_daily_spend_kzt,
       COALESCE(co.max_daily_spend_kzt, cd.max_daily_spend_kzt) AS max_daily_spend_kzt,
       COALESCE(co.max_frequency_7d, cd.max_frequency_7d) AS max_frequency_7d,
       COALESCE(co.min_ctr_pct, cd.min_ctr_pct) AS min_ctr_pct,
       COALESCE(co.learning_phase_min_events, cd.learning_phase_min_events) AS learning_phase_min_events,
       COALESCE(co.attribution_window, cd.attribution_window) AS attribution_window
  FROM public.meta_campaigns mc
  LEFT JOIN cab_default cd ON cd.cabinet_id = mc.cabinet_id
  LEFT JOIN camp_override co ON co.cabinet_id = mc.cabinet_id AND co.campaign_id = mc.campaign_id;
