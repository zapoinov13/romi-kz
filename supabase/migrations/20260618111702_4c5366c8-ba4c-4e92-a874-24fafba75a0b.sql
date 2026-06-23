
-- 1. Defaults for ad params on the bot
ALTER TABLE public.project_ads_telegram_bots
  ADD COLUMN IF NOT EXISTS default_geo text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_age_min smallint,
  ADD COLUMN IF NOT EXISTS default_age_max smallint,
  ADD COLUMN IF NOT EXISTS default_gender text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS default_objective text,
  ADD COLUMN IF NOT EXISTS default_placements text[] NOT NULL DEFAULT '{}';

-- 2. Resolved params on every command (mix of bot defaults + caption overrides)
ALTER TABLE public.ads_telegram_commands
  ADD COLUMN IF NOT EXISTS resolved_params jsonb,
  ADD COLUMN IF NOT EXISTS alias_used text;

-- 3. Multi-cabinet access per bot
CREATE TABLE IF NOT EXISTS public.ads_telegram_bot_cabinets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.project_ads_telegram_bots(id) ON DELETE CASCADE,
  cabinet_id uuid NOT NULL REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  alias text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, alias),
  UNIQUE (bot_id, cabinet_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_telegram_bot_cabinets TO authenticated;
GRANT ALL ON public.ads_telegram_bot_cabinets TO service_role;

ALTER TABLE public.ads_telegram_bot_cabinets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ads_tg_bot_cab_select_members"
  ON public.ads_telegram_bot_cabinets FOR SELECT
  TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "ads_tg_bot_cab_modify_members"
  ON public.ads_telegram_bot_cabinets FOR ALL
  TO authenticated
  USING (public.user_can_access_project(project_id))
  WITH CHECK (public.user_can_access_project(project_id));

CREATE TRIGGER trg_ads_tg_bot_cab_updated_at
  BEFORE UPDATE ON public.ads_telegram_bot_cabinets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_ads_tg_bot_cab_bot ON public.ads_telegram_bot_cabinets(bot_id);
