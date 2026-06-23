
CREATE TABLE IF NOT EXISTS public.ad_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  campaign_id text,
  adset_id text,
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  kind text NOT NULL,
  dedup_key text NOT NULL,
  title text NOT NULL,
  body text,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  fire_count integer NOT NULL DEFAULT 1,
  first_fired_at timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  snoozed_until timestamptz,
  resolved_at timestamptz,
  telegram_message_id bigint,
  telegram_chat_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_alerts_dedup
  ON public.ad_alerts (cabinet_id, dedup_key) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ad_alerts_project_open
  ON public.ad_alerts (project_id, resolved_at, last_fired_at DESC);

GRANT SELECT, UPDATE ON public.ad_alerts TO authenticated;
GRANT ALL ON public.ad_alerts TO service_role;

ALTER TABLE public.ad_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts_select_members" ON public.ad_alerts
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "alerts_ack_members" ON public.ad_alerts
  FOR UPDATE TO authenticated
  USING (public.user_can_access_project(project_id))
  WITH CHECK (public.user_can_access_project(project_id));

CREATE TRIGGER trg_ad_alerts_updated_at
  BEFORE UPDATE ON public.ad_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
