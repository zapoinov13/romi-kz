
CREATE TABLE public.project_ads_telegram_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  bot_token text NOT NULL,
  bot_username text,
  chat_id text NOT NULL,
  chat_title text,
  allowed_chat_ids text[] NOT NULL DEFAULT '{}',
  default_cabinet_id uuid REFERENCES public.ad_cabinets(id) ON DELETE SET NULL,
  default_destination text NOT NULL DEFAULT 'whatsapp',
  default_goal text,
  default_daily_budget numeric,
  default_country text DEFAULT 'KZ',
  default_city text,
  is_active boolean NOT NULL DEFAULT true,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ads_telegram_bots TO authenticated;
GRANT ALL ON public.project_ads_telegram_bots TO service_role;
REVOKE SELECT (bot_token) ON public.project_ads_telegram_bots FROM authenticated;
REVOKE UPDATE (bot_token) ON public.project_ads_telegram_bots FROM authenticated;

ALTER TABLE public.project_ads_telegram_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ads_tg_bots_select_members"
  ON public.project_ads_telegram_bots FOR SELECT
  TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "ads_tg_bots_modify_members"
  ON public.project_ads_telegram_bots FOR ALL
  TO authenticated
  USING (public.user_can_access_project(project_id))
  WITH CHECK (public.user_can_access_project(project_id));

CREATE TRIGGER trg_ads_tg_bots_updated_at
  BEFORE UPDATE ON public.project_ads_telegram_bots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ads_telegram_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  bot_id uuid REFERENCES public.project_ads_telegram_bots(id) ON DELETE SET NULL,
  cabinet_id uuid REFERENCES public.ad_cabinets(id) ON DELETE SET NULL,
  chat_id text NOT NULL,
  from_user text,
  message_id bigint,
  update_id bigint UNIQUE,
  command_text text,
  parsed_destination text,
  media_kind text,
  media_url text,
  status text NOT NULL DEFAULT 'received',
  error text,
  reply_message_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ads_telegram_commands TO authenticated;
GRANT ALL ON public.ads_telegram_commands TO service_role;

ALTER TABLE public.ads_telegram_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ads_tg_cmd_select_members"
  ON public.ads_telegram_commands FOR SELECT
  TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE INDEX idx_ads_tg_cmd_project_created ON public.ads_telegram_commands (project_id, created_at DESC);

CREATE TRIGGER trg_ads_tg_cmd_updated_at
  BEFORE UPDATE ON public.ads_telegram_commands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
