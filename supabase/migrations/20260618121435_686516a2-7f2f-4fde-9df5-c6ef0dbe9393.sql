
-- B4: Auto-actions for ads KPI

-- 1. Extend ad_kpi_targets with auto-mode settings
DO $$ BEGIN
  CREATE TYPE public.ad_auto_mode AS ENUM ('off', 'suggest', 'enforce');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ad_kpi_targets
  ADD COLUMN IF NOT EXISTS auto_mode public.ad_auto_mode NOT NULL DEFAULT 'suggest',
  ADD COLUMN IF NOT EXISTS auto_pause_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_budget_cut_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS budget_cut_pct integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS auto_budget_bump_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_bump_pct integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS bump_max_daily_kzt numeric(12,2),
  ADD COLUMN IF NOT EXISTS cooldown_minutes integer NOT NULL DEFAULT 360,
  ADD COLUMN IF NOT EXISTS daily_action_limit integer NOT NULL DEFAULT 5;

-- 2. New journal table for auto-actions
DO $$ BEGIN
  CREATE TYPE public.ad_auto_action_type AS ENUM ('pause', 'resume', 'budget_cut', 'budget_bump');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ad_auto_action_trigger AS ENUM ('kpi_evaluator', 'manual', 'rollback');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ad_auto_action_status AS ENUM ('pending', 'applied', 'failed', 'skipped', 'rolled_back');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ad_auto_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  campaign_name text,
  action_type public.ad_auto_action_type NOT NULL,
  trigger public.ad_auto_action_trigger NOT NULL DEFAULT 'kpi_evaluator',
  mode public.ad_auto_mode NOT NULL DEFAULT 'suggest',
  reason text,
  reason_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.ad_auto_action_status NOT NULL DEFAULT 'pending',
  alert_id uuid REFERENCES public.ad_alerts(id) ON DELETE SET NULL,
  parent_action_id uuid REFERENCES public.ad_auto_actions(id) ON DELETE SET NULL,
  applied_by uuid REFERENCES auth.users(id),
  applied_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aaa_cabinet_created ON public.ad_auto_actions(cabinet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aaa_campaign_created ON public.ad_auto_actions(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aaa_status ON public.ad_auto_actions(status) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.ad_auto_actions TO authenticated;
GRANT ALL ON public.ad_auto_actions TO service_role;

ALTER TABLE public.ad_auto_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_actions_select_members" ON public.ad_auto_actions
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "auto_actions_insert_members" ON public.ad_auto_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_project(project_id));

CREATE POLICY "auto_actions_update_members" ON public.ad_auto_actions
  FOR UPDATE TO authenticated
  USING (public.user_can_access_project(project_id))
  WITH CHECK (public.user_can_access_project(project_id));

CREATE TRIGGER trg_ad_auto_actions_updated_at
  BEFORE UPDATE ON public.ad_auto_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
