
CREATE TABLE public.project_telegram_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  bot_token text NOT NULL,
  bot_username text,
  chat_id text NOT NULL,
  chat_title text,
  is_active boolean NOT NULL DEFAULT true,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_telegram_bots TO authenticated;
GRANT ALL ON public.project_telegram_bots TO service_role;

REVOKE SELECT (bot_token) ON public.project_telegram_bots FROM anon, authenticated;

ALTER TABLE public.project_telegram_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_bots_select_project_members"
  ON public.project_telegram_bots
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_can_access_project(project_id));

CREATE POLICY "tg_bots_insert_project_members"
  ON public.project_telegram_bots
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_can_access_project(project_id));

CREATE POLICY "tg_bots_update_project_members"
  ON public.project_telegram_bots
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_can_access_project(project_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_can_access_project(project_id));

CREATE POLICY "tg_bots_delete_project_members"
  ON public.project_telegram_bots
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_can_access_project(project_id));

CREATE TRIGGER trg_project_telegram_bots_updated_at
  BEFORE UPDATE ON public.project_telegram_bots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
